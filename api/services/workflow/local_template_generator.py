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
import re
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

## How the runtime works (design against this, not against your intuition)

The canvas is NOT a state machine. Every outgoing edge of a node is registered \
to the LLM as a callable tool:
- the tool NAME is the edge "data.label"
- the tool DESCRIPTION is the edge "data.condition"

The model decides, on every single turn, whether to call one of them. So:

1. ONE NODE = ONE JOB. Never dump the whole call into a single agentNode.
   A production workflow has 3-6 agentNodes.
2. ONE EDGE = ONE GATE. A vague condition ("when the task is complete",
   "when finished", "when answered") WILL be called immediately and hang up
   the call. Every condition must name the concrete evidence required.
3. Collecting data is its own node. If the caller must provide details, that
   node asks for ONE field per turn and has exactly ONE outgoing edge, gated
   on every field being collected and confirmed.

Reference shape for an inbound service call that must book an appointment:

  startCall  --to_diagnose-->  agentNode "Diagnose"  --to_booking-->  agentNode "Collect details"
                                                          |                    |
                                            end_call_declined          go_to_confirm
                                                          v                    v
                                                endCall "Declined"    agentNode "Read back"
                                                                     --close_success--> endCall "Booked"
                                                                     --back_to_collect--> agentNode "Collect details"

Do not copy that graph literally; copy its shape: greet -> diagnose -> collect
(one field per turn) -> read back -> two or three distinct endings.

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
  "extraction_variables": [],    // MUST be an array of OBJECTS, never bare strings
  "add_global_prompt": true,
  "selected_through_edge": false,
  "hovered_through_edge": false
}

### extraction_variables (only when extraction_enabled is true)
Each entry is an OBJECT with exactly three keys — a bare string is INVALID and \
will be rejected by the runtime:
{
  "name": string,                // snake_case identifier, e.g. "mobile_number"
  "type": "string" | "number" | "boolean",
  "prompt": string               // what to look for, e.g. "the caller's mobile number"
}
If you do not need extraction, set "extraction_enabled": false and \
"extraction_variables": [].

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
    "condition": string,         // the GATE: when to take this path AND when not to
    "label": string,             // ASCII tool name, e.g. "to_booking" / "end_call_declined"
    "invalid": false,
    "validationMessage": null
  },
  "id": string,                  // "{source}-{target}"
  "selected": false
}

## Edge rules (violating these breaks the call at runtime)

- "data.label" MUST be lowercase ASCII with underscores only: ``^[a-z0-9_]+$``.
  NEVER translate it, never use Chinese characters or spaces. It becomes the
  LLM function name; non-ASCII characters are silently stripped and two edges
  from the same node then collide into the same name and fail validation.
  Good: "to_diagnose", "to_booking", "go_to_confirm", "close_success",
  "back_to_collect", "end_call_declined", "end_call_transfer".
- Labels must be unique among all edges leaving the same node.
- "data.condition" is the tool description the model reads. Write ONE sentence
  that contains BOTH halves — the positive trigger and the negative guard:
  "Only when the caller has confirmed phone, address and time. If any field is
   still missing or the caller denied it, keep asking and do not call this."
- Name the tool calls inside the node prompts, e.g. "when all three values are
  confirmed, call go_to_confirm; otherwise keep asking". The model cannot follow
  a rule it never sees next to the tool.

## Graph rules

- Add a dedicated collection agentNode whenever the activity_description asks to
  collect anything (name, phone, address, appointment time, order id, budget...).
  That node asks for ONE field per turn and has exactly ONE outgoing edge, whose
  condition requires all fields collected AND confirmed.
- Use 2-3 endCall nodes with distinct names (Booked / Declined / Transfer). Each
  gets its own edge with its own precise trigger; endCall nodes have no outgoing
  edges. Inbound calls almost always need a "caller refuses / wrong number /
  wants to hang up" ending next to the success ending.
- Cycles: at most one back-edge, and only when the caller must be able to correct
  data (e.g. "Read back" --back_to_collect--> "Collect details").
- Include a globalNode only when cross-call persona rules are useful.
- Keep node ids consistent between nodes and edges. The runtime re-positions every
  node, so do not spend effort on "position".

## Writing prompts

- All prompt text, node "name" values, and edge "condition" values must be in the
  requested LANGUAGE. Only "data.label" stays ASCII.
- This is a VOICE agent played over TTS: short natural sentences, no markdown,
  no emoji, no bullet walls.
- Every agentNode prompt uses these four sections, in this order:
  1. 【本节点任务】 one sentence: the single job of this node.
  2. 【流程】 a numbered sequence; each step asks for at most one thing.
  3. 【规则】 constraints: one question per turn, ask again instead of guessing,
     never quote prices or promise times the business did not give, do not ask
     for fields owned by another node, do not end the call yourself.
  4. 【成功标准】 the exact tool name to call and the evidence required, plus
     which tool NOT to call while that evidence is missing.
- Collect ONE field per turn. Asking "may I have your name, phone and address"
  in one turn is a defect: the caller answers one item and the flow collapses.
- Put FAQ / troubleshooting knowledge into the node that handles it, as a short
  list of "symptom -> most likely cause" pairs the agent can say in 1-2 sentences.
- The startCall prompt greets, states name/company if known, and asks ONE thing
  (usually the caller's name). It must not run the whole call.
- The globalNode prompt defines persona, tone, ASR-noise handling, and keeps
  replies to 2-3 sentences; add "do not end the call without an explicit closing
  instruction".
- The endCall prompt is 6-12 words of closing only — no new questions.
- When extraction is needed, attach "extraction_enabled": true plus the variable
  list to the collection node (not to the start node), one variable per field,
  and make each "prompt" hint concrete (format, length, what counts as valid).
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
        f"Design the voice agent. Write every prompt, node name and edge condition "
        f"in {lang_label}. Keep every edge data.label lowercase ASCII with "
        f"underscores (never translate it).\n\n"
        "Before you answer, self-check the graph:\n"
        "1. Are there 3-6 agentNodes, each with exactly one job?\n"
        "2. If any detail must be collected from the caller, is there a dedicated "
        "collection node asking one field per turn, with a single outgoing edge "
        "gated on all fields being confirmed?\n"
        "3. Does every edge condition state both when to call it and when not to?\n"
        "4. Are there 2-3 endCall nodes covering success and refusal?\n"
        "5. Does every data.label match ^[a-z0-9_]+$ and stay unique per source "
        "node?\n"
        "Output only the JSON object."
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


# Deterministic node positions keyed by type, so the canvas always renders
# tidy regardless of what the LLM emits. Matches the layout the old MPS
# generator produced. agentNode / endCall are laid out per index in
# ``_normalize_definition`` because a workflow now carries several of each.
_NODE_LAYOUT = {
    "startCall": {"x": 175, "y": 60},
    "globalNode": {"x": -325, "y": 480},
}

_AGENT_ORIGIN = {"x": 615.5, "y": 476}
_AGENT_VERTICAL_GAP = 240

# Fallback tool names when the model emits a non-ASCII or duplicate label.
# The label becomes an LLM function name, so it must be ``[a-z0-9_]`` only.
_EDGE_LABEL_FALLBACK = {
    "agentNode": "to_agent",
    "endCall": "end_call",
    "globalNode": "to_global",
}


def _slugify_edge_label(label) -> str:
    """Reduce an edge label to a legal LLM function name.

    ``transition_tool_name`` in ``workflow_graph`` does the same transform at
    runtime, so a Chinese label collapses to ``____`` (one underscore per
    character) and ties the model's hands. Returning "" here (label was empty or
    purely non-ASCII) lets the caller fall back to a type-derived name instead.
    """
    if not isinstance(label, str):
        return ""
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def _normalize_edges(wf: dict) -> None:
    """Make every edge addressable by the LLM.

    The model is told to emit ASCII labels, but a translated label ("结束通话")
    is silently useless at runtime: it becomes ``____`` and, when a node has two
    such edges, collides into a duplicate tool name that fails graph validation.
    So labels are re-slugged here, deduplicated per source node, and falling back
    to a target-type-derived name when nothing usable survives.
    """
    nodes = wf.get("nodes")
    edges = wf.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return

    node_types = {
        node.get("id"): node.get("type") for node in nodes if isinstance(node, dict)
    }

    used_labels: dict[str, set[str]] = {}
    repaired = 0
    kept: list = []

    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source, target = edge.get("source"), edge.get("target")
        if source not in node_types or target not in node_types:
            logger.warning(
                "[local_template_generator] dropping dangling edge {src}->{dst}",
                src=source,
                dst=target,
            )
            continue

        edge["type"] = edge.get("type") or "custom"
        edge["animated"] = True
        edge["id"] = f"{source}-{target}"

        data = edge.get("data")
        if not isinstance(data, dict):
            data = {}
            edge["data"] = data

        condition = data.get("condition")
        if not isinstance(condition, str) or not condition.strip():
            data["condition"] = (
                "Only call this when the goal of the current step is proven done "
                "by something the caller said. Do not call it while any required "
                "detail is still missing."
            )

        seen = used_labels.setdefault(source, set())
        label = _slugify_edge_label(data.get("label"))
        if not label or label in seen:
            base = _EDGE_LABEL_FALLBACK.get(node_types[target], "next_step")
            label = base
            suffix = 2
            while label in seen:
                label = f"{base}_{suffix}"
                suffix += 1
            repaired += 1
        seen.add(label)
        data["label"] = label
        kept.append(edge)

    wf["edges"] = kept
    if repaired:
        logger.info(
            "[local_template_generator] repaired {n} edge label(s) into ASCII "
            "function names",
            n=repaired,
        )


def _normalize_extraction_variable(variable):
    """Coerce a single extraction_variables entry into a valid DTO dict.

    The LLM sometimes emits bare strings (e.g. ``"mobile_number"``) instead of
    the ``{name, type, prompt}`` object the runtime expects. Normalize both
    shapes so validation never fails; drop anything unusable.
    """
    if isinstance(variable, str):
        return {"name": variable, "type": "string", "prompt": ""}
    if isinstance(variable, dict):
        return {
            "name": variable.get("name") or "",
            "type": variable.get("type") or "string",
            "prompt": variable.get("prompt") or "",
        }
    return None


def _normalize_definition(payload: dict) -> dict:
    """Post-process the LLM output so it always validates and renders cleanly.

    Three fixes applied regardless of what the model produced:

    1. ``extraction_variables`` — normalize bare strings into
       ``{name, type, prompt}`` objects (the DTO rejects string entries), and
       disable extraction if the list ends up empty.
    2. Edge labels — re-slugged to ASCII function names and deduplicated per
       source node (see ``_normalize_edges``); dangling edges are dropped.
    3. Node ``position`` — snap nodes to deterministic slots. agentNodes stack
       downwards and endCall nodes sit in a row below them, so a multi-node
       workflow no longer overlaps itself on the canvas.
    """
    wf = payload.get("workflow_definition")
    if not isinstance(wf, dict):
        return payload

    nodes = wf.get("nodes")
    if not isinstance(nodes, list):
        return payload

    for node in nodes:
        if not isinstance(node, dict):
            continue

        data = node.get("data")
        if isinstance(data, dict):
            variables = data.get("extraction_variables")
            if isinstance(variables, list):
                normalized = [
                    v
                    for v in (_normalize_extraction_variable(x) for x in variables)
                    if v is not None
                ]
                data["extraction_variables"] = normalized
                if not normalized:
                    data["extraction_enabled"] = False

    agent_nodes = [
        node
        for node in nodes
        if isinstance(node, dict) and node.get("type") == "agentNode"
    ]
    end_nodes = [
        node
        for node in nodes
        if isinstance(node, dict) and node.get("type") == "endCall"
    ]

    for index, node in enumerate(agent_nodes):
        node["position"] = {
            "x": _AGENT_ORIGIN["x"],
            "y": _AGENT_ORIGIN["y"] + index * _AGENT_VERTICAL_GAP,
        }

    ends_y = _AGENT_ORIGIN["y"] + len(agent_nodes) * _AGENT_VERTICAL_GAP + 60
    for index, node in enumerate(end_nodes):
        node["position"] = {"x": 175 + index * 460, "y": ends_y}

    for node in nodes:
        if isinstance(node, dict) and node.get("type") in _NODE_LAYOUT:
            node["position"] = dict(_NODE_LAYOUT[node["type"]])

    _normalize_edges(wf)

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
        "temperature": 0.5,
        "max_tokens": 8192,
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
        choice = data["choices"][0]
        content = choice["message"]["content"]
        if choice.get("finish_reason") == "length":
            # Truncated JSON is unusable for a multi-node graph; say so instead of
            # letting json.loads raise something opaque.
            logger.error(
                "[local_template_generator] response truncated at max_tokens="
                "{mt}; the graph was cut off mid-JSON",
                mt=body["max_tokens"],
            )

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

    normalized = _normalize_definition(validated)

    vwf = normalized.get("workflow_definition", {})
    logger.info(
        "[local_template_generator] VALIDATED ok | name={name!r} nodes={n_nodes} "
        "edges={n_edges} viewport={viewport}",
        name=normalized.get("name"),
        n_nodes=len(vwf.get("nodes", [])),
        n_edges=len(vwf.get("edges", [])),
        viewport=vwf.get("viewport"),
    )
    return normalized
