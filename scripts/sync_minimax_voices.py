"""Seed the `vendor_voices` table from MiniMax's voice library.

MiniMax's web voice-library listing (https://www.minimax.cn/v1/api/audio/voice/list)
requires a logged-in session token, so it cannot be queried per request. This
script populates the table out-of-band, in one of two modes:

  1. Offline (recommended): paste/store the JSON returned by the curl, then
     python scripts/sync_minimax_voices.py --json voices.json

  2. Live fetch (run from a machine with the session token): set MINIMAX_WEB_TOKEN
     (and optionally MINIMAX_WEB_COOKIE) and run with --fetch.

The same table is shared by all vendors behind the `provider` column; pass
--provider to target a different vendor in the future (e.g. dashscope).

Run from the repo root (it imports the `api` package) with the API's environment
so DATABASE_URL is available, e.g.:

  docker compose exec api python scripts/sync_minimax_voices.py --json /tmp/voices.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

# Make the api package importable when run from the repo root.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


# --- tag normalization -------------------------------------------------------
# MiniMax voice entries expose a structured `tag_items` array whose `category`
# codes are stable: 1=language, 2=accent, 3=gender, 4=age, 6=style, 8=scenario.
# We prefer tag_items and fall back to the free-form `tag_list` text.
GENDER_MAP = {"女": "female", "男": "male", "中性": "neutral"}
AGE_MAP = {"儿童": "child", "青年": "youth", "中年": "middle", "老年": "elder"}

# Language family roots -> normalized iso-ish code. A tag like "英语-英音" resolves
# to its family root "英语" -> "en".
LANGUAGE_FAMILY = {
    "中文": "zh",
    "中国": "zh",
    "普通话": "zh",
    "英语": "en",
    "日语": "ja",
    "韩语": "ko",
    "法语": "fr",
    "德语": "de",
    "西班牙语": "es",
    "葡萄牙语": "pt",
    "意大利语": "it",
    "俄语": "ru",
    "阿拉伯语": "ar",
    "泰语": "th",
    "越南语": "vi",
    "印尼语": "id",
    "马来语": "ms",
    "粤语": "zh",
}

# Exact full-tag overrides (used if a tag does not split into a known family).
LANGUAGE_NAME_MAP = {
    "中文-普通话": "zh",
    "中国-南方": "zh",
    "中国-北方": "zh",
}

# vendor language code -> normalized iso-ish code (rarely needed for tag_items).
LANGUAGE_CODE_MAP = {
    "cmn": "zh",
    "hk": "zh",
    "eng": "en",
    "jpn": "ja",
    "kor": "ko",
    "fra": "fr",
    "deu": "de",
    "spa": "es",
    "por": "pt",
    "ita": "it",
    "rus": "ru",
    "arb": "ar",
    "tha": "th",
    "vie": "vi",
    "ind": "id",
    "ms": "ms",
}


def _lang_to_code(tag: str) -> str | None:
    if tag in LANGUAGE_NAME_MAP:
        return LANGUAGE_NAME_MAP[tag]
    base = tag.split("-")[0]
    if base in LANGUAGE_FAMILY:
        return LANGUAGE_FAMILY[base]
    if tag in LANGUAGE_CODE_MAP:
        return LANGUAGE_CODE_MAP[tag]
    return None


def _load_taxonomy(path: str | None) -> None:
    if not path:
        return
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    for entry in data.get("voice_tag_language") or []:
        name = entry.get("tag_name")
        code = entry.get("tag_value")
        if name and code:
            LANGUAGE_NAME_MAP[name] = LANGUAGE_CODE_MAP.get(code, code)


def _from_tag_items(tag_items: list[dict]) -> dict:
    by_cat: dict[int, str] = {}
    for ti in tag_items or []:
        cat = ti.get("category")
        name = ti.get("name")
        if cat is not None and name and cat not in by_cat:
            by_cat[cat] = name
    gender = by_cat.get(3)
    age = by_cat.get(4)
    lang = by_cat.get(1)
    accent = by_cat.get(2)
    return {
        "gender": GENDER_MAP.get(gender, gender.lower()) if gender else None,
        "age": AGE_MAP.get(age, age.lower()) if age else None,
        "language": _lang_to_code(lang) if lang else None,
        "accent": accent,
    }


def _from_tag_list(tags: list[str]) -> dict:
    gender = next((GENDER_MAP[t] for t in tags if t in GENDER_MAP), None)
    age = next((AGE_MAP[t] for t in tags if t in AGE_MAP), None)
    language = next((_lang_to_code(t) for t in tags if _lang_to_code(t)), None)
    return {"gender": gender, "age": age, "language": language, "accent": None}


def _rows_from_payload(payload: dict) -> list[dict]:
    data = payload.get("data") or {}
    items = list(data.get("voice_list") or [])
    items.extend(data.get("recommended_voice_list") or [])
    seen: set[str] = set()
    rows: list[dict] = []
    for entry in items:
        # MiniMax's TTS synthesis API identifies a voice by `uniq_id`
        # (e.g. "Chinese_wenrounvxing"), not the numeric `voice_id`. Use that
        # as the stored voice id; fall back to the numeric id only if missing.
        voice_id = entry.get("uniq_id") or entry.get("voice_id")
        if not voice_id or voice_id in seen:
            continue
        seen.add(voice_id)
        tag_items = entry.get("tag_items")
        norm = (
            _from_tag_items(tag_items)
            if tag_items
            else _from_tag_list(entry.get("tag_list") or [])
        )
        rows.append(
            {
                "voice_id": voice_id,
                "name": entry.get("voice_name") or voice_id,
                "description": entry.get("description") or None,
                "gender": norm["gender"],
                "language": norm["language"],
                "age": norm["age"],
                "accent": norm["accent"],
                "preview_url": entry.get("sample_audio") or None,
                "sample_text": None,
                "tags": {
                    "tag_list": entry.get("tag_list") or [],
                    "tag_items": tag_items or [],
                },
            }
        )
    return rows


async def _run(provider: str, rows: list[dict]) -> int:
    from api.db import db_client

    return await db_client.upsert_vendor_voices(provider, rows)


def _fetch_live() -> dict:
    import httpx

    url = "https://www.minimax.cn/v1/api/audio/voice/list"
    token = os.environ.get("MINIMAX_WEB_TOKEN")
    if not token:
        raise SystemExit("MINIMAX_WEB_TOKEN is required for --fetch")
    headers = {"token": token}
    cookie = os.environ.get("MINIMAX_WEB_COOKIE")
    if cookie:
        headers["Cookie"] = cookie
    body = {
        "is_system": True,
        "is_collect": False,
        "page": 1,
        "page_size": 3000,
        "filter": [],
        "user_language": "zh-Hans",
    }
    resp = httpx.post(url, headers=headers, json=body, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync MiniMax voices into vendor_voices")
    parser.add_argument("--provider", default="minimax")
    parser.add_argument("--json", help="Path to a saved voice-list JSON response")
    parser.add_argument("--fetch", action="store_true", help="Fetch live via token")
    parser.add_argument("--taxonomy", help="Optional taxonomy JSON (voice_tag_*)")
    args = parser.parse_args()

    _load_taxonomy(args.taxonomy)

    if args.fetch:
        payload = _fetch_live()
    elif args.json:
        with open(args.json, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    else:
        raise SystemExit("Provide --json <file> or --fetch")

    rows = _rows_from_payload(payload)
    if not rows:
        raise SystemExit("No voices parsed from payload")

    count = asyncio.run(_run(args.provider, rows))
    print(f"Upserted {count} {args.provider} voices into vendor_voices")


if __name__ == "__main__":
    main()
