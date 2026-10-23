"""Qwen-Audio TTS over the DashScope inference websocket.

``qwen-audio-3.1-tts-plus`` is served by the same ``/api-ws/v1/inference``
endpoint the realtime ASR models use, but with ``task: "tts"``:

1. ``run-task`` configures model, voice, output format and sample rate.
2. ``continue-task`` carries the text to synthesise, one message per chunk.
3. Audio comes back as **binary** websocket frames (raw PCM when requested).
4. ``finish-task`` flushes buffered text and ends the task; ``task-finished``
   confirms it.

The OpenAI-compatible ``/audio/speech`` endpoint the existing DashScope TTS
branch uses does not serve this model, and the cosyvoice ``*_v2`` voice ids are
not valid here. Qwen-Audio-TTS voices are named ``longanlingxin_v3.1`` and
friends.

Binary frames carry no task id, so audio is attributed to pending tasks in FIFO
order. The TTS service synthesises one context at a time, which makes that
unambiguous in practice.

Docs: https://help.aliyun.com/zh/model-studio/qwen-audio-tts-websocket-api
      https://help.aliyun.com/zh/model-studio/qwen-audio-tts-client-events
"""

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator

from loguru import logger

from api.services.pipecat.diagnostics import truncate_text
from pipecat.frames.frames import (
    ErrorFrame,
    Frame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.services.settings import TTSSettings
from pipecat.services.tts_service import WebsocketTTSService
from pipecat.utils.tracing.service_decorators import traced_tts

try:
    from websockets.protocol import State
except ModuleNotFoundError as e:  # pragma: no cover - dependency is pinned
    logger.error(f"Exception: {e}")
    logger.error("In order to use streaming TTS, you need to `pip install websockets`.")
    raise Exception(f"Missing module: {e}") from e


# Shared, workspace-free endpoint. Deployments that use Alibaba's per-workspace
# subdomains (wss://{WorkspaceId}.{region}.maas.aliyuncs.com/api-ws/v1/inference)
# pass the resolved URL in from the service factory: the workspace id differs per
# install and belongs in configuration, not in source.
DASHSCOPE_TTS_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
DASHSCOPE_TTS_MODEL = "qwen-audio-3.1-tts-plus"
DASHSCOPE_TTS_VOICE = "longanlingxin_v3.1"

# Keep each continue-task well under the documented text limit. The pipeline
# aggregates a sentence at a time, so this only matters for long paragraphs.
_MAX_CONTINUE_CHARS = 400


class QwenAudioTTSService(WebsocketTTSService):
    """Text-to-speech through Qwen-Audio-TTS on the DashScope websocket."""

    def __init__(
        self,
        *,
        api_key: str,
        url: str = DASHSCOPE_TTS_WS_URL,
        voice: str = DASHSCOPE_TTS_VOICE,
        model: str = DASHSCOPE_TTS_MODEL,
        rate: float = 1.0,
        volume: int = 50,
        sample_rate: int = 16000,
        settings: TTSSettings | None = None,
        **kwargs,
    ):
        """Initialise the Qwen-Audio TTS service.

        Args:
            api_key: DashScope API key, sent as a bearer token on the handshake.
            url: Websocket endpoint (workspace-specific hosts are also valid).
            voice: Qwen-Audio-TTS voice id, e.g. ``longanlingxin_v3.1``.
            model: Qwen-Audio-TTS model id.
            rate: Speech rate in [0.5, 2.0].
            volume: Volume in [0, 100].
            sample_rate: Output sample rate. The pipeline is capped at 16kHz, so
                asking for 24kHz would only add a resample step.
            settings: Runtime-updatable TTS settings.
            **kwargs: Passed through to ``WebsocketTTSService``.
        """
        default_settings = TTSSettings(
            model=model, voice=voice, language=None
        )
        if settings is not None:
            default_settings.apply_update(settings)

        super().__init__(
            reconnect_on_error=True,
            sample_rate=sample_rate,
            settings=default_settings,
            **kwargs,
        )

        self._api_key = api_key
        self._url = url
        self._rate = rate
        self._volume = volume
        self._receive_task = None
        # Insertion order is FIFO, which is how binary audio is attributed.
        self._pending_tasks: dict[str, str] = {}
        self._task_started: dict[str, asyncio.Event] = {}

    # ------------------------------------------------------------------ setup

    async def _connect(self):
        """Connect and start the receive loop."""
        await super()._connect()
        await self._connect_websocket()
        if self._websocket and not self._receive_task:
            self._receive_task = self.create_task(
                self._receive_task_handler(self._report_error)
            )

    async def _disconnect(self):
        """Stop the receive loop and close the socket."""
        await super()._disconnect()
        if self._receive_task:
            await self.cancel_task(self._receive_task)
            self._receive_task = None
        await self._disconnect_websocket()

    async def _connect_websocket(self):
        """Open the synthesis websocket."""
        try:
            if self._websocket and self._websocket.state is State.OPEN:
                return

            headers = {"Authorization": f"Bearer {self._api_key}"}
            logger.info(
                f"Qwen TTS connecting: url={self._url} "
                f"model={self._settings.model} voice={self._settings.voice} "
                f"sample_rate={self.sample_rate}"
            )
            self._websocket = await self._websocket_connect(
                self._url, additional_headers=headers
            )
            await self._call_event_handler("on_connected")
        except Exception as e:
            self._websocket = None
            await self.push_error(error_msg=f"Qwen TTS connect error: {e}", exception=e)
            await self._call_event_handler("on_connection_error", f"{e}")

    async def _disconnect_websocket(self):
        """Close the synthesis websocket."""
        try:
            if self._websocket:
                await self._websocket.close()
        except Exception as e:
            logger.debug(f"Qwen TTS disconnect error: {e}")
        finally:
            self._pending_tasks.clear()
            self._task_started.clear()
            self._websocket = None
            await self.remove_active_audio_context()
            await self._call_event_handler("on_disconnected")

    # --------------------------------------------------------------- protocol

    def _build_run_task(self, task_id: str) -> dict:
        """Build the ``run-task`` command for one synthesis task."""
        return {
            "header": {
                "action": "run-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {
                "task_group": "audio",
                "task": "tts",
                "function": "SpeechSynthesizer",
                "model": self._settings.model,
                "input": {},
                "parameters": {
                    "text_type": "PlainText",
                    "voice": self._settings.voice or DASHSCOPE_TTS_VOICE,
                    "format": "pcm",
                    "sample_rate": self.sample_rate or 16000,
                    "volume": self._volume,
                    "rate": self._rate,
                },
            },
        }

    def _build_continue_task(self, task_id: str, text: str) -> dict:
        """Build a ``continue-task`` command carrying a text chunk."""
        return {
            "header": {
                "action": "continue-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {"input": {"text": text}},
        }

    def _build_finish_task(self, task_id: str) -> dict:
        """Build the ``finish-task`` command for one synthesis task."""
        return {
            "header": {
                "action": "finish-task",
                "task_id": task_id,
                "streaming": "duplex",
            },
            "payload": {"input": {}},
        }

    # ------------------------------------------------------------------ audio

    def _current_context(self) -> str | None:
        """Return the context id of the oldest pending task, if still alive."""
        for context_id in self._pending_tasks.values():
            if self.audio_context_available(context_id):
                return context_id
        return None

    @traced_tts
    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        """Synthesise one aggregated chunk of text."""
        task_id: str | None = None
        try:
            if not self._websocket or self._websocket.state is State.CLOSED:
                await self._connect()

            if not self.audio_context_available(context_id):
                await self.create_audio_context(context_id)
                await self.start_ttfb_metrics()
                yield TTSStartedFrame(context_id=context_id)

            logger.info(
                f"Qwen TTS request: model={self._settings.model} "
                f"voice={self._settings.voice} text=[{truncate_text(text)}]"
            )

            task_id = uuid.uuid4().hex
            started = asyncio.Event()
            self._task_started[task_id] = started
            self._pending_tasks[task_id] = context_id

            ws = self._get_websocket()
            await ws.send(json.dumps(self._build_run_task(task_id)))

            # The server rejects continue-task until it has confirmed run-task.
            try:
                await asyncio.wait_for(started.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning(
                    f"Qwen TTS task {task_id} did not start in time; sending text anyway"
                )

            for chunk in self._chunk_text(text):
                await ws.send(json.dumps(self._build_continue_task(task_id, chunk)))
            await ws.send(json.dumps(self._build_finish_task(task_id)))

            await self.start_tts_usage_metrics(text)
            yield None
        except Exception as e:
            if task_id:
                self._pending_tasks.pop(task_id, None)
                self._task_started.pop(task_id, None)
            logger.error(f"Qwen TTS request failed: {e}")
            yield ErrorFrame(error=f"Qwen TTS error: {e}")

    @staticmethod
    def _chunk_text(text: str) -> list[str]:
        """Split text into continue-task sized pieces on soft boundaries."""
        if len(text) <= _MAX_CONTINUE_CHARS:
            return [text]

        chunks: list[str] = []
        remaining = text
        while remaining:
            if len(remaining) <= _MAX_CONTINUE_CHARS:
                chunks.append(remaining)
                break
            window = remaining[:_MAX_CONTINUE_CHARS]
            # Prefer breaking on sentence or clause punctuation.
            cut = max(
                window.rfind("。"),
                window.rfind("！"),
                window.rfind("？"),
                window.rfind("；"),
                window.rfind(". "),
                window.rfind("，"),
                window.rfind(", "),
            )
            cut = cut + 1 if cut > _MAX_CONTINUE_CHARS // 2 else _MAX_CONTINUE_CHARS
            chunks.append(remaining[:cut])
            remaining = remaining[cut:]
        return [c for c in chunks if c]

    # ---------------------------------------------------------------- receive

    async def _receive_messages(self):
        """Dispatch binary audio and JSON events from DashScope."""
        if not self._websocket:
            return

        async for message in self._websocket:
            if isinstance(message, (bytes, bytearray)):
                context_id = self._current_context()
                if not context_id:
                    continue
                await self.append_to_audio_context(
                    context_id,
                    TTSAudioRawFrame(
                        audio=bytes(message),
                        sample_rate=self.sample_rate,
                        num_channels=1,
                        context_id=context_id,
                    ),
                )
                continue

            try:
                msg = json.loads(message)
            except json.JSONDecodeError:
                logger.warning(f"Qwen TTS non-JSON message: {message[:120]}")
                continue
            await self._handle_event(msg)

    async def _handle_event(self, msg: dict):
        """Handle one DashScope event envelope."""
        header = msg.get("header") or {}
        event = header.get("event")
        task_id = header.get("task_id")

        if event == "task-started":
            started = self._task_started.get(task_id)
            if started:
                started.set()
            logger.debug(f"Qwen TTS task started: {task_id}")
        elif event == "task-finished":
            await self._finish_context(task_id)
        elif event == "task-failed":
            context_id = self._pending_tasks.pop(task_id, None)
            self._task_started.pop(task_id, None)
            code = header.get("error_code")
            detail = header.get("error_message") or "unknown error"
            logger.error(f"Qwen TTS task failed ({code}): {detail}")
            await self.push_error(error_msg=f"Qwen TTS failed ({code}): {detail}")
            if context_id and self.audio_context_available(context_id):
                await self.append_to_audio_context(
                    context_id, TTSStoppedFrame(context_id=context_id)
                )
                await self.remove_audio_context(context_id)
        elif event == "result-generated":
            # Synthesis result metadata (timestamps/usage); audio rides the
            # binary channel, so nothing to push here.
            logger.debug("Qwen TTS result-generated")
        else:
            logger.debug(f"Qwen TTS unhandled event: {event}")

    async def _finish_context(self, task_id: str):
        """Close the audio context for a finished task."""
        context_id = self._pending_tasks.pop(task_id, None)
        self._task_started.pop(task_id, None)
        if not context_id or not self.audio_context_available(context_id):
            return
        await self.stop_ttfb_metrics()
        await self.append_to_audio_context(
            context_id, TTSStoppedFrame(context_id=context_id)
        )
        await self.remove_audio_context(context_id)

    # ------------------------------------------------------------ interruption

    async def on_audio_context_interrupted(self, context_id: str):
        """Drop in-flight synthesis when the bot is interrupted.

        DashScope has no cancel command for a running synthesis task, so the
        only way to stop audio already being generated is to drop the socket.
        Pending tasks are cleared first so their remaining binary frames cannot
        be attributed to the next context.
        """
        self._pending_tasks.clear()
        self._task_started.clear()
        try:
            await self._disconnect()
            await self._connect()
        except Exception as e:
            logger.warning(f"Qwen TTS reconnect after interruption failed: {e}")
        await super().on_audio_context_interrupted(context_id)
