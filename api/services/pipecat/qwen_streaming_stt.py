"""Qwen-Audio ASR realtime streaming speech-to-text service.

DashScope's realtime ASR models speak the "inference" WebSocket protocol at
``/api-ws/v1/inference``:

1. ``run-task`` starts a duplex task and carries the model plus audio format.
2. Raw PCM is sent as binary websocket messages, not JSON.
3. ``result-generated`` events carry ``payload.output.sentence``; ``sentence_end``
   true marks the final text for that sentence, false is an interim update.
4. ``finish-task`` closes the task before the socket is closed.

This is the streaming counterpart to the OpenAI-compatible
``/audio/transcriptions`` path used by the existing DashScope STT branch. That
one uploads a whole VAD segment per request, so the transcript only appears once
the speaker stops and a full HTTP round trip completes. Streaming recognisers
emit text while the caller is still talking and hand the final sentence over
after the server-side silence threshold, which is the same shape as the hosted
Dograh/MPS recogniser.

Note that ``qwen-audio-3.1-asr-flash-filetrans`` is *not* usable here: it is the
non-realtime, file-URL based transcription API (up to 12 hours per job) and has
no duplex streaming mode.

Docs: https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide
"""

import asyncio
import json
import uuid

from loguru import logger

from pipecat.frames.frames import (
    InterimTranscriptionFrame,
    TranscriptionFrame,
)
from pipecat.services.settings import STTSettings
from pipecat.services.stt_service import WebsocketSTTService
from pipecat.transcriptions.language import Language
from pipecat.utils.time import time_now_iso8601

try:
    from websockets.protocol import State
except ModuleNotFoundError as e:  # pragma: no cover - dependency is pinned
    logger.error(f"Exception: {e}")
    logger.error("In order to use streaming STT, you need to `pip install websockets`.")
    raise Exception(f"Missing module: {e}") from e


# Workspace-specific DashScope host (Beijing). The shared
# ``wss://dashscope.aliyuncs.com/api-ws/v1/inference`` host still works, but the
# per-workspace subdomain is what Alibaba now recommends. The API key must come
# from the same region as the host.
DASHSCOPE_STREAMING_WS_URL = (
    "wss://llm-kb8cnhojfztojv7i.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference"
)
DASHSCOPE_STREAMING_ASR_MODEL = "qwen-audio-3.1-asr-flash-streaming"

# DashScope splits sentences server-side. Keep the silence threshold close to
# the client VAD stop (200ms) so the final transcript does not lag the turn
# boundary by much; below ~300ms the model starts cutting sentences in half.
DEFAULT_MAX_SENTENCE_SILENCE_MS = 400


class QwenStreamingSTTService(WebsocketSTTService):
    """Streaming speech-to-text through the DashScope inference websocket."""

    def __init__(
        self,
        *,
        api_key: str,
        url: str = DASHSCOPE_STREAMING_WS_URL,
        model: str = DASHSCOPE_STREAMING_ASR_MODEL,
        sample_rate: int = 16000,
        max_sentence_silence_ms: int = DEFAULT_MAX_SENTENCE_SILENCE_MS,
        semantic_punctuation: bool = True,
        settings: STTSettings | None = None,
        **kwargs,
    ):
        """Initialise the streaming ASR service.

        Args:
            api_key: DashScope API key, sent as a bearer token on the handshake.
            url: Websocket endpoint. Workspace-specific hosts look like
                ``wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference``.
            model: Qwen realtime ASR model id.
            sample_rate: Input sample rate. DashScope accepts 8000 or 16000.
            max_sentence_silence_ms: Server-side silence that ends a sentence.
            semantic_punctuation: Whether the server adds punctuation.
            settings: Runtime-updatable STT settings.
            **kwargs: Passed through to ``WebsocketSTTService``.
        """
        default_settings = STTSettings(model=model, language=None)
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
        self._max_sentence_silence_ms = max_sentence_silence_ms
        self._semantic_punctuation = semantic_punctuation
        self._receive_task = None
        self._task_id: str | None = None
        self._task_started = asyncio.Event()

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
        """Open the websocket and start a recognition task."""
        try:
            if self._websocket and self._websocket.state is State.OPEN:
                return

            headers = {"Authorization": f"Bearer {self._api_key}"}
            logger.info(
                f"Qwen ASR connecting: url={self._url} "
                f"model={self._settings.model} sample_rate={self.sample_rate}"
            )
            self._websocket = await self._websocket_connect(
                self._url, additional_headers=headers
            )

            self._task_id = uuid.uuid4().hex
            self._task_started.clear()
            await self._websocket.send(json.dumps(self._build_run_task()))
            await self._call_event_handler("on_connected")
        except Exception as e:
            self._websocket = None
            await self.push_error(error_msg=f"Qwen ASR connect error: {e}", exception=e)
            await self._call_event_handler("on_connection_error", f"{e}")

    async def _disconnect_websocket(self):
        """Finish the task and close the socket."""
        try:
            if self._websocket:
                if self._websocket.state is State.OPEN and self._task_id:
                    await self._websocket.send(json.dumps(self._build_finish_task()))
                await self._websocket.close()
        except Exception as e:
            logger.debug(f"Qwen ASR disconnect error: {e}")
        finally:
            self._task_started.clear()
            self._task_id = None
            self._websocket = None
            await self._call_event_handler("on_disconnected")

    # --------------------------------------------------------------- protocol

    def _build_run_task(self) -> dict:
        """Build the ``run-task`` command that opens a recognition task."""
        return {
            "header": {
                "action": "run-task",
                "task_id": self._task_id,
                "streaming": "duplex",
            },
            "payload": {
                "task_group": "audio",
                "task": "asr",
                "function": "recognition",
                "model": self._settings.model,
                "parameters": {
                    "sample_rate": self.sample_rate or 16000,
                    "format": "pcm",
                    "max_sentence_silence": self._max_sentence_silence_ms,
                    "semantic_punctuation_enabled": self._semantic_punctuation,
                },
                "input": {},
            },
        }

    def _build_finish_task(self) -> dict:
        """Build the ``finish-task`` command that closes the task."""
        return {
            "header": {
                "action": "finish-task",
                "task_id": self._task_id,
                "streaming": "duplex",
            },
            "payload": {"input": {}},
        }

    # ------------------------------------------------------------------ audio

    async def run_stt(self, audio: bytes):
        """Forward a raw PCM frame to DashScope.

        Yields nothing: transcripts arrive asynchronously on the receive loop.
        """
        if not self._websocket or self._websocket.state is not State.OPEN:
            yield None
            return

        if not self._task_started.is_set():
            # The server confirms run-task with ``task-started`` before it will
            # accept audio. This normally lands well before the first frame, so
            # only wait briefly rather than stalling the pipeline.
            try:
                await asyncio.wait_for(self._task_started.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                logger.warning("Qwen ASR task not started yet; dropping audio frame")
                yield None
                return

        try:
            await self._websocket.send(audio)
        except Exception as e:
            logger.warning(f"Qwen ASR send failed: {e}")
        yield None

    # ---------------------------------------------------------------- receive

    async def _receive_messages(self):
        """Dispatch DashScope events to the state handlers below."""
        if not self._websocket:
            return

        async for message in self._websocket:
            if isinstance(message, (bytes, bytearray)):
                # Realtime ASR never returns audio; ignore stray binary frames.
                continue
            try:
                msg = json.loads(message)
            except json.JSONDecodeError:
                logger.warning(f"Qwen ASR non-JSON message: {message[:120]}")
                continue
            await self._handle_event(msg)

    async def _handle_event(self, msg: dict):
        """Handle one DashScope event envelope."""
        header = msg.get("header") or {}
        event = header.get("event")

        if event == "task-started":
            self._task_started.set()
            logger.info("Qwen ASR task started")
        elif event == "result-generated":
            await self._handle_sentence(msg)
        elif event == "task-finished":
            self._task_started.clear()
            logger.info("Qwen ASR task finished")
        elif event == "task-failed":
            self._task_started.clear()
            code = header.get("error_code")
            detail = header.get("error_message") or "unknown error"
            await self.push_error(error_msg=f"Qwen ASR failed ({code}): {detail}")
        else:
            logger.debug(f"Qwen ASR unhandled event: {event}")

    async def _handle_sentence(self, msg: dict):
        """Push a final or interim transcript frame."""
        payload = msg.get("payload") or {}
        output = payload.get("output") or {}
        sentence = output.get("sentence") or {}
        text = (sentence.get("text") or "").strip()
        if not text:
            return

        language = self._settings.language
        if not isinstance(language, Language):
            language = None

        if bool(sentence.get("sentence_end")):
            logger.info(f"Qwen ASR final: [{text}]")
            await self.push_frame(
                TranscriptionFrame(
                    text=text,
                    user_id=self._user_id,
                    timestamp=time_now_iso8601(),
                    language=language,
                )
            )
        else:
            logger.debug(f"Qwen ASR interim: [{text}]")
            await self.push_frame(
                InterimTranscriptionFrame(
                    text=text,
                    user_id=self._user_id,
                    timestamp=time_now_iso8601(),
                    language=language,
                )
            )
