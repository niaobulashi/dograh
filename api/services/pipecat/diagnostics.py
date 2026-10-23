"""Shared, log-safe helpers for diagnostic logging.

These helpers keep verbose provider I/O (STT audio size, TTS text, LLM
messages) out of the hot path while still making it observable at INFO level.
Set ``LLM_LOG_CONTENT = False`` to drop message bodies (keep only counts) when
PII must not land in logs.
"""

from loguru import logger

# Flip to False to stop writing message bodies to logs (keeps role + count only).
LLM_LOG_CONTENT = True

# Per-message body cap so one huge transcript cannot flood the log line.
_LLM_MESSAGE_LIMIT = 800


def truncate_text(text, limit: int = _LLM_MESSAGE_LIMIT):
    if text is None:
        return None
    text = str(text)
    if len(text) > limit:
        return text[:limit] + f"...[+{len(text) - limit} chars]"
    return text


def _message_role(item) -> str:
    if isinstance(item, dict):
        return str(item.get("role", "?"))
    return str(getattr(item, "role", "?"))


def _message_content(item) -> str:
    if isinstance(item, dict):
        content = item.get("content")
    else:
        content = getattr(item, "content", None)
    if content is None:
        return ""
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                parts.append(str(block.get("text", "")))
            else:
                parts.append(str(getattr(block, "text", block)))
        return " ".join(p for p in parts if p)
    return str(content)


def summarize_messages(messages) -> str:
    """Compact, log-safe summary of the messages about to hit the LLM."""
    if not messages:
        return "(no messages)"
    try:
        if LLM_LOG_CONTENT:
            parts = []
            for item in messages:
                role = _message_role(item)
                body = truncate_text(_message_content(item))
                parts.append(f"[{role}] {body}")
            return " | ".join(parts)
        return f"({len(messages)} messages, content logging disabled)"
    except Exception as exc:  # never let diagnostics crash a turn
        return f"(unsummarizable messages: {exc})"


def log_llm_input(service, context) -> None:
    """INFO-log the messages a provider is about to send to the LLM."""
    messages = getattr(context, "messages", None)
    if messages is None:
        messages = getattr(context, "_messages", None)
    logger.info(
        f"LLM input ({type(service).__name__}): {summarize_messages(messages)}"
    )
