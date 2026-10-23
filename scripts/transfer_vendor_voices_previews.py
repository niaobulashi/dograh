"""Mirror vendor voice preview mp3s into local MinIO.

The `vendor_voices.preview_url` column holds the vendor's CDN link (e.g.
hailuoai.com). This script downloads each `preview_url`, stores a copy in the
configured storage backend (MinIO for local/OSS deployments), and records the
resulting public URL in `vendor_voices.preview_audio_url`. The API then serves
the local copy, removing the hard dependency on the external CDN.

Run from the repo root with the API environment so DATABASE_URL / MINIO_* are
available, e.g.:

  # normal run (only voices without a local copy yet)
  docker compose exec api python scripts/transfer_vendor_voices_previews.py
  docker compose exec api python scripts/transfer_vendor_voices_previews.py --provider minimax

  # re-mirror everything, even rows that already have preview_audio_url
  docker compose exec api python scripts/transfer_vendor_voices_previews.py --force

  # just list what would be mirrored, without downloading
  docker compose exec api python scripts/transfer_vendor_voices_previews.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import io
import os
import sys
from datetime import UTC, datetime

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import httpx
from loguru import logger
from sqlalchemy import select, update

from api.constants import ENVIRONMENT
from api.db import db_client
from api.db.models import VendorVoiceModel
from api.services.filesystem.minio import MinioFileSystem
from api.services.storage import storage_fs

OBJECT_PREFIX = "vendor-voices"  # MinIO/S3 object key prefix
_CONTENT_TYPE = "audio/mpeg"


def _object_key(provider: str, voice_id: str) -> str:
    # voice_id is namespaced per provider; it is already URL-safe (vendor ids).
    return f"{OBJECT_PREFIX}/{provider}/{voice_id}.mp3"


async def _download(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


async def _upload(key: str, data: bytes) -> None:
    # MinIO: set the audio MIME type explicitly so <audio> plays reliably.
    # For other backends fall back to the generic bytes writer.
    if isinstance(storage_fs, MinioFileSystem):

        def _put():
            storage_fs.client.put_object(
                storage_fs.bucket_name,
                key,
                data=io.BytesIO(data),
                length=len(data),
                content_type=_CONTENT_TYPE,
            )

        await asyncio.to_thread(_put)
    else:
        ok = await storage_fs.acreate_file_from_bytes(key, data)
        if not ok:
            raise RuntimeError(f"upload failed: {key}")


async def _transfer_one(provider: str, voice_id: str, preview_url: str) -> str | None:
    key = _object_key(provider, voice_id)
    data = await _download(preview_url)
    await _upload(key, data)
    public_url = await storage_fs.aget_signed_url(key)
    return public_url


async def run(
    provider: str, *, force: bool, dry_run: bool, limit: int | None
) -> None:
    if ENVIRONMENT == "test":
        raise SystemExit("Refusing to run against the test environment.")

    async with db_client.async_session() as session:
        stmt = select(VendorVoiceModel).where(
            VendorVoiceModel.provider == provider,
            VendorVoiceModel.preview_url.is_not(None),
        )
        if not force:
            stmt = stmt.where(VendorVoiceModel.preview_audio_url.is_(None))
        if limit:
            stmt = stmt.limit(limit)
        rows = (await session.execute(stmt)).scalars().all()

    total = len(rows)
    logger.info(
        f"{'[DRY-RUN] ' if dry_run else ''}found {total} {provider} voices to mirror"
    )
    if dry_run:
        for r in rows:
            logger.info(f"  would mirror {r.voice_id} <- {r.preview_url}")
        return

    done = 0
    failed = 0
    for r in rows:
        try:
            public_url = await _transfer_one(provider, r.voice_id, r.preview_url)
        except Exception as exc:  # noqa: BLE001 - report and continue
            logger.error(f"mirror failed for {r.voice_id} ({r.preview_url}): {exc}")
            failed += 1
            continue
        if not public_url:
            failed += 1
            continue
        async with db_client.async_session() as session:
            await session.execute(
                update(VendorVoiceModel)
                .where(VendorVoiceModel.id == r.id)
                .values(preview_audio_url=public_url, updated_at=datetime.now(UTC))
            )
            await session.commit()
        done += 1
        if done % 50 == 0:
            logger.info(f"progress: {done}/{total}")

    logger.info(f"done: {done} mirrored, {failed} failed, {total} total")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mirror vendor preview mp3s into local MinIO"
    )
    parser.add_argument("--provider", default="minimax")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-mirror even if preview_audio_url is already set",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List candidates without downloading/uploads",
    )
    parser.add_argument("--limit", type=int, default=None, help="Max voices to process")
    args = parser.parse_args()
    asyncio.run(
        run(args.provider, force=args.force, dry_run=args.dry_run, limit=args.limit)
    )


if __name__ == "__main__":
    main()
