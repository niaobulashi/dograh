"""Global, organization-independent vendor voice catalogs (MiniMax, DashScope, ...).

Voices are pre-fetched out-of-band and stored in the `vendor_voices` table because
the source listings (e.g. MiniMax's web voice library) require a logged-in session
and cannot be queried per request. This client only ever reads/writes that table;
it never contacts a vendor at request time.

Reads are served from Redis (one cache key per provider, 1h TTL). The full catalog
is cached once and filtered in memory, so any combination of language/gender/age/q
filters only ever hits Redis, never the database. The cache is invalidated on every
manual upsert (sync) and gracefully falls back to a direct DB read if Redis is
unavailable.
"""

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Iterable

import redis.asyncio as aioredis
from sqlalchemy import delete, select

from api.constants import REDIS_URL
from api.db.base_client import BaseDBClient
from api.db.models import VendorVoiceModel


# Cache the full per-provider catalog; filters are applied in memory.
_VENDOR_VOICE_CACHE_TTL = 3600
_VENDOR_VOICE_CACHE_PREFIX = "dograh:vendor_voices"
_redis_client: aioredis.Redis | None = None


@dataclass(frozen=True)
class VendorVoiceItem:
    """Lightweight, JSON-serializable view of a vendor voice row."""

    voice_id: str
    name: str
    description: str | None = None
    gender: str | None = None
    language: str | None = None
    age: str | None = None
    accent: str | None = None
    preview_url: str | None = None
    preview_audio_url: str | None = None
    sample_text: str | None = None
    tags: dict = field(default_factory=dict)


def _cache_key(provider: str) -> str:
    return f"{_VENDOR_VOICE_CACHE_PREFIX}:{provider}"


async def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


class VendorVoiceClient(BaseDBClient):
    async def upsert_vendor_voices(
        self, provider: str, voices: Iterable[dict]
    ) -> int:
        """Replace all rows for `provider` with the supplied voice records.

        A full refresh (delete + insert) keeps the table consistent with the
        vendor's current library on each manual sync. The cached catalog is
        invalidated so the next read reflects the refresh immediately.
        """
        rows = [dict(v) for v in voices]
        if not rows:
            return 0
        async with self.async_session() as session:
            await session.execute(
                delete(VendorVoiceModel).where(
                    VendorVoiceModel.provider == provider
                )
            )
            session.add_all(
                VendorVoiceModel(
                    provider=provider,
                    voice_id=v["voice_id"],
                    name=v.get("name") or v["voice_id"],
                    description=v.get("description"),
                    gender=v.get("gender"),
                    language=v.get("language"),
                    age=v.get("age"),
                    accent=v.get("accent"),
                    preview_url=v.get("preview_url"),
                    preview_audio_url=v.get("preview_audio_url"),
                    sample_text=v.get("sample_text"),
                    tags=v.get("tags") or {},
                    updated_at=datetime.now(UTC),
                )
                for v in rows
            )
            await session.commit()
        # Invalidate the cached catalog so the next read reflects the refresh.
        try:
            redis = await _get_redis()
            await redis.delete(_cache_key(provider))
        except Exception:
            # Redis is best-effort here; the DB remains the source of truth.
            pass
        return len(rows)

    async def list_vendor_voices(
        self,
        provider: str,
        *,
        language: str | None = None,
        q: str | None = None,
        gender: str | None = None,
        age: str | None = None,
    ) -> list[VendorVoiceItem]:
        """Return catalog voices for `provider`, filtered in memory.

        The full catalog is loaded from Redis (or DB on miss) once and the
        language/gender/age/q filters are applied here, so request-time queries
        never hit the database.
        """
        payload = await self._load_catalog(provider)
        ql = (q or "").strip().lower()
        items: list[VendorVoiceItem] = []
        for item in payload:
            if language and item.get("language") != language:
                continue
            if gender and item.get("gender") != gender:
                continue
            if age and item.get("age") != age:
                continue
            if ql:
                haystack = " ".join(
                    str(item.get(k) or "")
                    for k in ("name", "voice_id", "description")
                ).lower()
                if ql not in haystack:
                    continue
            items.append(VendorVoiceItem(**item))
        return items

    async def _load_catalog(self, provider: str) -> list[dict]:
        """Return the full provider catalog, preferring Redis; fall back to DB."""
        try:
            redis = await _get_redis()
            raw = await redis.get(_cache_key(provider))
            if raw is not None:
                return json.loads(raw)
        except Exception:
            # Redis miss or unavailable: read through to the database.
            pass
        payload = await self._load_all(provider)
        try:
            redis = await _get_redis()
            await redis.set(
                _cache_key(provider),
                json.dumps(payload),
                ex=_VENDOR_VOICE_CACHE_TTL,
            )
        except Exception:
            # Cache write failure must not break the read path.
            pass
        return payload

    async def _load_all(self, provider: str) -> list[dict]:
        """Read the full catalog from the database (used on cache miss)."""
        async with self.async_session() as session:
            result = await session.execute(
                select(VendorVoiceModel)
                .where(VendorVoiceModel.provider == provider)
                .order_by(VendorVoiceModel.name.asc())
            )
            rows = result.scalars().all()
        return [
            {
                "voice_id": r.voice_id,
                "name": r.name,
                "description": r.description,
                "gender": r.gender,
                "language": r.language,
                "age": r.age,
                "accent": r.accent,
                "preview_url": r.preview_url,
                "preview_audio_url": r.preview_audio_url,
                "sample_text": r.sample_text,
                "tags": r.tags or {},
            }
            for r in rows
        ]
