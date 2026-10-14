"""
Local workflow-template generator.

Replaces the MPS ``create-workflow`` call with a self-hosted LLM (DeepSeek by
default, OpenAI-compatible chat completions). Given a natural-language use case
and activity description it returns the same shape the rest of the workflow
route expects::

    {
        "name": str,
        "workflow_definition": {
            "nodes": [...],
            "edges": [...],
            "viewport": {...},
        },
    }

The generated JSON mirrors the structure produced by MPS so it stores and
renders unchanged in the existing UI / runtime.
"""

from __future__ import annotations

import json
import time
from typing import Optional

import httpx
from loguru import logger

from api.constants import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
)

_REQUIRED_NODE_TYPES = {"startCall", "agentNode", "endCall"}


def _language_label(language: str) -> str:
    """Map a language code to a human label for the prompt."""
    if not language:
        return "English"
    lang = language.lower()
    if lang.startswith("zh"):
        return "Simplified Chinese (简体中文)"
    if lang.startswith("en"):
        return "English"
    return language


_SYSTEM_PROMPT = """\
You are an expert voice-agent workflow designer for Dograh, a platform that \
builds conversational voice AI agents (inbound/outbound phone calls).

You will receive a call_type, a use_case, and an activity_description. Your job \
is to design a voice agent and output STRICTLY a single JSON object (no prose, \
no markdown) that conforms exactly to the schema below.

## Output schema

{
  "name": string,                 // short agent name, e.g. "客户支持 - 呼入"
  "workflow_definition": {
    "nodes": [ Node, ... ],
    "edges": [ Edge, ... ],
    "viewport": { "x": 184.25, "y": 23.5, "zoom": 0.5 }
  }
}

### Node (common fields for every node)
{
  "id": string,                   // unique within the workflow, e.g. "1"
  "type": "startCall" | "globalNode" | "agentNode" | "endCall",
  "position": { "x": number, "y": number },
  "data": { ... },               // see per-type spec below
  "measured": { "width": 320, "height": 128 },
  "selected": false,
  "dragging": false
}

### startCall node (exactly ONE)
"data": {
  "prompt": string,              // opening/greeting instructions
  "name": "start call",
  "allow_interrupt": true,
  "invalid": false,
  "validationMessage": null,
  "is_static": false,
  "add_global_prompt": true,
  "wait_for_user_response": false,
  "detect_voicemail": false,
  "delayed_start": false,
  "is_start": true,
  "selected_through_edge": false,
  "hovered_through_edge": false
}

### globalNode (optional, exactly one if present)
"data": {
  "prompt": string,              // global persona + cross-cutting rules
  "name": "Global Node",
  "allow_interrupt": true,
  "invalid": false,
  "validationMessage": null,
  "is_static": false
}

### agentNode (the main working node)
"data": {
  "prompt": string,              // main agenda, questions, resolution steps
  "name": string,                // e.g. "Main Agenda and Questions"
  "allow_interrupt": true,
  "invalid": false,
  "validationMessage": null,
  "extraction_enabled": false,
  "extraction_prompt": "",
  "extraction_variables": [],
  "add_global_prompt": true,
  "selected_through_edge": false,
  "hovered_through_edge": false
}

### endCall node (at least ONE)
"data": {
  "prompt": string,              // short polite closing instructions
  "name": "End Call",
  "allow_interrupt": true,
  "invalid": false,
  "validationMessage": null,
  "is_static": false,
  "extraction_enabled": false,
  "extraction_prompt": "",
  "extraction_variables": [],
  "add_global_prompt": false,
  "is_end": true,
  "selected_through_edge": false,
  "hovered_through_edge": false
}

### Edge
{
  "animated": true,
  "type": "custom",
  "source": string,              // source node id
  "target": string,              // target node id
  "data": {
    "condition": string,         // when to take this path
    "label": string,             // short label, e.g. "End call"
    "invalid": false,
    "validationMessage": null
  },
  "id": string,                  // "{source}-{target}"
  "selected": false
}

## Graph rules
- startCall -> agentNode (label "Move to Main Agenda"), startCall -> endCall \
(label "End call"), agentNode -> endCall (label "End call").
- Keep node ids consistent between nodes and edges.
- Include a globalNode only when cross-call persona rules are useful.

## Writing prompts
- All prompt text and node name values must be in the requested LANGUAGE.
- This is a VOICE agent played over TTS: keep sentences short and natural, \
avoid special characters, emojis, markdown, or bullet-heavy walls of text.
- The globalNode prompt should define persona, tone, ASR-noise handling, and \
keep responses to 2-3 sentences.
- The startCall prompt greets, states name/company if known, asks the caller's \
name and reason for calling.
- The agentNode prompt drives the main task using the activity_description.
- The endCall prompt ends the call politely in 6-8 words.
"""


def _build_user_prompt(
    call_type: str,
    use_case: str,
    activity_description: str,
    language: str,
) -> str:
    lang_label = _language_label(language)
    return (
        f"call_type: {call_type}\n"
        f"use_case: {use_case}\n"
        f"activity_description: {activity_description}\n\n"
        f"Design the voice agent. Write every prompt and node name in "
        f"{lang_label}. Output only the JSON object."
    )


def _validate_definition(payload: dict) -> dict:
    """Light structural validation; raises ValueError on fatal problems."""
    wf = payload.get("workflow_definition")
    if not isinstance(wf, dict):
        raise ValueError("workflow_definition missing or not an object")
    nodes = wf.get("nodes")
    edges = wf.get("edges")
    if not isinstance(nodes, list) or not nodes:
        raise ValueError("workflow_definition.nodes must be a non-empty list")
    if not isinstance(edges, list) or not edges:
        raise ValueError("workflow_definition.edges must be a non-empty list")

    types = {n.get("type") for n in nodes if isinstance(n, dict)}
    missing = _REQUIRED_NODE_TYPES - types
    if missing:
        raise ValueError(f"workflow is missing required node type(s): {sorted(missing)}")

    for node in nodes:
        if not isinstance(node, dict) or not node.get("id") or not node.get("type"):
            raise ValueError("every node needs id and type")
        data = node.get("data")
        if not isinstance(data, dict) or not data.get("prompt"):
            raise ValueError(f"node {node.get('id')} needs a non-empty data.prompt")

    wf.setdefault("viewport", {"x": 184.25, "y": 23.5, "zoom": 0.5})
    return payload


async def generate_workflow_from_template(
    call_type: str,
    use_case: str,
    activity_description: str,
    language: str = "zh",
) -> dict:
    """
    Generate a workflow definition locally via a DeepSeek-compatible LLM.

    Returns ``{"name": str, "workflow_definition": {...}}`` ready for the
    workflow route to persist.

    Raises:
        RuntimeError: If no DeepSeek API key is configured.
        ValueError: If the model output is not valid workflow JSON.
        httpx.HTTPStatusError: If the LLM API call fails.
    """
    if not DEEPSEEK_API_KEY:
        logger.error("[local_template_generator] DEEPSEEK_API_KEY is not set")
        raise RuntimeError(
            "DEEPSEEK_API_KEY is not set. Set it (and WORKFLOW_TEMPLATE_GENERATOR=local) "
            "to generate workflow templates without MPS."
        )

    user_prompt = _build_user_prompt(
        call_type=call_type,
        use_case=use_case,
        activity_description=activity_description,
        language=language,
    )
    logger.info(
        "[local_template_generator] REQUEST -> call_type={call_type} language={language} "
        "use_case={use_case!r} model={model} base_url={base_url}",
        call_type=call_type,
        language=language,
        use_case=use_case,
        model=DEEPSEEK_MODEL,
        base_url=DEEPSEEK_BASE_URL,
    )
    logger.debug(
        "[local_template_generator] user prompt (activity_description):\n{activity}",
        activity=activity_description,
    )

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    body = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.7,
        "max_tokens": 4096,
    }

    logger.info(
        "[local_template_generator] Calling DeepSeek chat/completions (max_tokens={mt}, "
        "temperature={temp})",
        mt=body["max_tokens"],
        temp=body["temperature"],
    )
    req_start = time.monotonic()
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0)) as client:
        response = await client.post(
            f"{DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions",
            json=body,
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
        )
        elapsed = time.monotonic() - req_start
        if response.status_code != 200:
            logger.error(
                "[local_template_generator] DeepSeek HTTP {status} in {elapsed:.2f}s: {text}",
                status=response.status_code,
                elapsed=elapsed,
                text=response.text,
            )
            raise httpx.HTTPStatusError(
                f"DeepSeek workflow generation failed: {response.text}",
                request=response.request,
                response=response,
            )

        data = response.json()
        content = data["choices"][0]["message"]["content"]

    logger.info(
        "[local_template_generator] DeepSeek OK in {elapsed:.2f}s | response chars={n_chars}",
        elapsed=elapsed,
        n_chars=len(content),
    )
    logger.debug(
        "[local_template_generator] raw LLM content (first 1000 chars):\n{head}",
        head=content[:1000],
    )

    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        logger.error(
            "[local_template_generator] LLM output was not valid JSON: {exc}", exc=exc
        )
        raise ValueError(f"LLM did not return valid JSON: {exc}") from exc

    if not payload.get("name"):
        payload["name"] = f"{use_case} - {call_type}"

    wf = payload.get("workflow_definition", {}) or {}
    logger.info(
        "[local_template_generator] PARSED name={name!r} nodes={n_nodes} edges={n_edges}",
        name=payload.get("name"),
        n_nodes=len(wf.get("nodes", [])),
        n_edges=len(wf.get("edges", [])),
    )

    try:
        validated = _validate_definition(payload)
    except ValueError as exc:
        logger.error(
            "[local_template_generator] validation failed: {exc}", exc=exc
        )
        raise

    vwf = validated.get("workflow_definition", {})
    logger.info(
        "[local_template_generator] VALIDATED ok | name={name!r} nodes={n_nodes} "
        "edges={n_edges} viewport={viewport}",
        name=validated.get("name"),
        n_nodes=len(vwf.get("nodes", [])),
        n_edges=len(vwf.get("edges", [])),
        viewport=vwf.get("viewport"),
    )
    return validated
