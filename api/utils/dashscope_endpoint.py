"""Resolve the DashScope realtime speech websocket endpoint.

Aliyun serves realtime ASR/TTS from per-workspace subdomains::

    wss://{WorkspaceId}.{region}.maas.aliyuncs.com/api-ws/v1/inference

The workspace id differs per install, so it is an operator setting. Operators
copy it straight out of the Bailian console, which gives them something like
``llm-kb8cnhojfztojv7i`` rather than a URL - and pasting that into a URL field
produces ``wss://llm-kb8cnhojfztojv7i``, a host that does not resolve. Expanding
a bare workspace id here keeps that mistake harmless.

Accepted inputs:

* ``""`` - caller falls back to the environment / shared host.
* ``llm-kb8cnhojfztojv7i`` - a workspace id, expanded with ``DASHSCOPE_WS_REGION``.
* ``llm-kb8cnhojfztojv7i.cn-beijing.maas.aliyuncs.com`` - a bare host, wss assumed.
* ``wss://...`` / ``https://...`` - used as given, with the scheme normalised.
"""

import os

DEFAULT_REGION = "cn-beijing"

_INFERENCE_PATH = "/api-ws/v1/inference"


def _region() -> str:
    return (os.getenv("DASHSCOPE_WS_REGION") or DEFAULT_REGION).strip() or DEFAULT_REGION


def _normalise_scheme(url: str) -> str:
    if url.startswith("https://"):
        return "wss://" + url[len("https://") :]
    if url.startswith("http://"):
        return "ws://" + url[len("http://") :]
    return url


def expand_dashscope_endpoint(value: str | None) -> str:
    """Expand a configured DashScope endpoint. Returns ``""`` for empty input."""
    value = (value or "").strip()
    if not value:
        return ""

    if "://" in value:
        return _normalise_scheme(value)

    # A bare workspace id has no dots and no path separators. Anything with a
    # dot is a hostname the operator typed out; assume TLS and leave the path
    # for them to complete.
    if "." not in value and "/" not in value:
        return f"wss://{value}.{_region()}.maas.aliyuncs.com{_INFERENCE_PATH}"

    # A bare host the operator typed out: assume TLS and add the path they
    # almost certainly meant, since every realtime model lives there.
    if "/" not in value:
        value = f"{value}{_INFERENCE_PATH}"
    return f"wss://{value}"
