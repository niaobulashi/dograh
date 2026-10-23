"""MiniMax speech-to-text service.

MiniMax exposes speech recognition at ``POST {base_url}/speech_to_text`` with a
multipart body (model, file, response_format). The OpenAI-compatible
``/v1/audio/transcriptions`` path does not exist on the MiniMax API host (it
answers 404), so this service keeps pipecat's OpenAI STT framing — buffering,
turn taking, transcription frames — and only replaces the HTTP call and the
response shape.

Docs: https://platform.minimax.cn/docs/api-reference/speech-to-text
"""

import time

import httpx
from loguru import logger
from openai.types.audio import Transcription
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.stt import OpenAISTTSettings


class MiniMaxSTTService(OpenAISTTService):
    """Transcribe audio with MiniMax's ``/v1/speech_to_text`` endpoint."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str = "asr-1.0",
        **kwargs,
    ):
        self._minimax_api_key = api_key
        self._minimax_base_url = base_url.rstrip("/")
        self._minimax_model = model
        # Reuse one pooled client instead of opening a fresh TLS connection on
        # every VAD segment — the previous per-call client added a full DNS +
        # handshake round trip to each transcription.
        self._client = httpx.AsyncClient(timeout=60.0)
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            # MiniMax detects the language itself when no language hint is
            # given, so do not pin the base class to English.
            settings=OpenAISTTSettings(model=model, language=None),
            **kwargs,
        )

    async def cleanup(self):
        try:
            await super().cleanup()
        except Exception:
            pass
        try:
            await self._client.aclose()
        except Exception:
            pass

    async def _transcribe(self, audio: bytes) -> Transcription:
        files = {"file": ("audio.wav", audio, "audio/wav")}
        data = {"model": self._minimax_model, "response_format": "json"}
        headers = {"Authorization": f"Bearer {self._minimax_api_key}"}
        url = f"{self._minimax_base_url}/speech_to_text"
        logger.info(
            f"MiniMax STT request: url={url} model={self._minimax_model} "
            f"audio_bytes={len(audio)}"
        )
        start = time.monotonic()
        try:
            response = await self._client.post(
                url, files=files, data=data, headers=headers
            )
        except httpx.RequestError as exc:
            raise RuntimeError(
                f"Could not reach the MiniMax STT endpoint at {url}: {exc}"
            ) from exc
        elapsed = time.monotonic() - start
        if response.status_code != 200:
            raise RuntimeError(
                f"MiniMax STT returned HTTP {response.status_code}: {response.text[:200]}"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(
                f"MiniMax STT returned a non-JSON response: {response.text[:200]}"
            ) from exc
        text = payload.get("text") if isinstance(payload, dict) else None
        logger.info(
            f"MiniMax STT result: status={response.status_code} "
            f"elapsed={elapsed:.3f}s text=[{text}]"
        )
        return Transcription(text=text or "")
