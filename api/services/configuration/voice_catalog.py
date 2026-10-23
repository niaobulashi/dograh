"""Voice discovery using an organization's saved provider connection."""

import asyncio
import time
from random import choice

import httpx
from fastapi import HTTPException

from api.db import db_client
from api.schemas.voices import VoiceFacets, VoicesResponse
from api.services.configuration.voice_catalog_adapters import (
    VOICE_CATALOGS,
    VoiceQuery,
    create_voice_catalog,
)
from api.utils.url_security import validate_user_configured_service_url

# Voice catalogs change rarely; cache the full unfiltered list per
# (provider, connection, model) so facets stay cheap to compute and repeated
# filter changes don't re-fetch thousands of voices from the provider.
_VOICE_FACET_CACHE: dict[tuple, tuple[float, list]] = {}
_VOICE_FACET_CACHE_TTL = 300.0


async def get_connection_voices(
    provider: str,
    organization_id: int,
    connection_uuid: str,
    *,
    model: str | None = None,
    language: str | None = None,
    q: str | None = None,
    gender: str | None = None,
    accent: str | None = None,
) -> VoicesResponse:
    catalog_type = VOICE_CATALOGS.get(provider)
    if catalog_type is None:
        raise HTTPException(
            status_code=400, detail="Voice catalog is not supported for this provider"
        )
    name = catalog_type.name
    connection = await db_client.get_provider_connection(
        organization_id, connection_uuid
    )
    if connection is None:
        raise HTTPException(status_code=404, detail="Provider connection not found")
    if connection.provider != provider:
        raise HTTPException(
            status_code=400, detail=f"Select a {name} provider connection"
        )
    keys = connection.credentials.get("api_key")
    # Select from the pool once; pagination must keep using the same account.
    api_key = choice(keys) if isinstance(keys, list) and keys else keys
    if catalog_type.auth_header and (
        not isinstance(api_key, str) or not api_key.strip()
    ):
        raise HTTPException(
            status_code=400, detail=f"Add an API key to the {name} connection"
        )
    try:
        catalog = create_voice_catalog(
            provider,
            api_key=api_key,
            base_url=connection.connection_settings.get("base_url"),
        )
        if catalog.url:
            await asyncio.to_thread(
                validate_user_configured_service_url, catalog.url, field_name="base_url"
            )
    except ValueError:
        raise HTTPException(
            status_code=400, detail=f"Invalid {name} connection base URL"
        ) from None

    try:
        async with (
            asyncio.timeout(30),
            httpx.AsyncClient(timeout=10, follow_redirects=False) as client,
        ):
            # Fetch the full catalog for this model (no language/gender/accent/q)
            # so facets reflect the entire voice universe, then filter locally for
            # the displayed list. Cached per (provider, connection, model)
            # because voice catalogs change rarely.
            cache_key = (provider, connection_uuid, model)
            now = time.monotonic()
            cached = _VOICE_FACET_CACHE.get(cache_key)
            if cached is not None and now - cached[0] < _VOICE_FACET_CACHE_TTL:
                full_voices = cached[1]
            else:
                full_voices = await catalog.voices(client, VoiceQuery(model=model))
                _VOICE_FACET_CACHE[cache_key] = (now, full_voices)
    except (TimeoutError, httpx.TimeoutException):
        raise HTTPException(
            status_code=504, detail=f"{name} took too long to load voices. Try again."
        ) from None
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in {401, 403}:
            permission = (
                "Voices read permission"
                if provider == "elevenlabs"
                else "voice catalog permissions"
            )
            raise HTTPException(
                status_code=400,
                detail=f"{name} could not list voices. Check the connection's API key and its {permission}.",
            ) from None
        if exc.response.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail=f"{name} voice requests are rate limited. Try again shortly.",
            ) from None
        raise HTTPException(
            status_code=502, detail=f"Could not load voices from {name}. Try again."
        ) from None
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        # Provider bodies/request exceptions can contain credentials or account
        # details. Never return or log them.
        raise HTTPException(
            status_code=502, detail=f"Could not load voices from {name}. Try again."
        ) from None

    # Facets are derived from the entire voice universe, independent of the
    # active filter, so the dropdowns always offer every available option.
    facets = VoiceFacets(
        genders=sorted({voice.gender for voice in full_voices if voice.gender}),
        languages=sorted({voice.language for voice in full_voices if voice.language}),
        accents=sorted({voice.accent for voice in full_voices if voice.accent}),
    )

    # Apply the requested filters locally for the displayed list. All four
    # dimensions are filtered here so behaviour is uniform across providers.
    filtered = {}
    for voice in full_voices:
        if language and (voice.language or "").casefold() != language.casefold():
            continue
        if gender and (voice.gender or "").casefold() != gender.casefold():
            continue
        if accent and (voice.accent or "").casefold() != accent.casefold():
            continue
        if (
            q
            and q.casefold()
            not in " ".join(
                filter(None, (voice.voice_id, voice.name, voice.description))
            ).casefold()
        ):
            continue
        filtered[voice.voice_id] = voice
    return VoicesResponse(
        provider=provider,
        voices=sorted(filtered.values(), key=lambda voice: voice.name.casefold()),
        facets=facets,
    )
