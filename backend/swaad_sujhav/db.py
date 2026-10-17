"""Thin async client for Supabase's REST API (PostgREST + Auth).

The service-role key is used only here, on the server. Requests made on a
user's behalf verify their JWT first (see `current_user`).
"""
from __future__ import annotations

from typing import Any

import httpx

from .config import settings

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0))
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _service_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    h = {
        "apikey": settings.service_key,
        "Authorization": f"Bearer {settings.service_key}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


async def select(table: str, params: dict[str, str] | None = None, page_size: int = 1000) -> list[dict[str, Any]]:
    """Read every row of a table (paged) with the service role."""
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        r = await client().get(
            f"{settings.supabase_url}/rest/v1/{table}",
            params=params or {"select": "*"},
            headers=_service_headers({"Range-Unit": "items", "Range": f"{start}-{start + page_size - 1}"}),
        )
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < page_size:
            return rows
        start += page_size


async def upsert(table: str, rows: list[dict[str, Any]], on_conflict: str, chunk: int = 500) -> None:
    for i in range(0, len(rows), chunk):
        r = await client().post(
            f"{settings.supabase_url}/rest/v1/{table}",
            params={"on_conflict": on_conflict},
            json=rows[i:i + chunk],
            headers=_service_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
        )
        r.raise_for_status()


async def delete(table: str, filters: dict[str, str]) -> None:
    r = await client().delete(
        f"{settings.supabase_url}/rest/v1/{table}", params=filters, headers=_service_headers()
    )
    r.raise_for_status()


async def insert_returning(table: str, row: dict[str, Any]) -> dict[str, Any]:
    r = await client().post(
        f"{settings.supabase_url}/rest/v1/{table}",
        json=row,
        headers=_service_headers({"Prefer": "return=representation"}),
    )
    r.raise_for_status()
    return r.json()[0]


async def update(table: str, filters: dict[str, str], values: dict[str, Any]) -> None:
    r = await client().patch(
        f"{settings.supabase_url}/rest/v1/{table}",
        params=filters, json=values, headers=_service_headers(),
    )
    r.raise_for_status()


async def rpc(name: str, params: dict[str, Any], user_token: str | None = None, timeout: float = 60.0) -> Any:
    """Call a Postgres function through PostgREST with the anon key (or a user's JWT).
    Privileged functions here are protected by their own token check (ML_TOKEN)."""
    r = await client().post(
        f"{settings.supabase_url}/rest/v1/rpc/{name}",
        json=params,
        headers={
            "apikey": settings.anon_key,
            "Authorization": f"Bearer {user_token or settings.anon_key}",
            "Content-Type": "application/json",
        },
        timeout=timeout,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"rpc {name} failed ({r.status_code}): {r.text[:300]}")
    return r.json() if r.content else None


async def user_from_token(token: str) -> dict[str, Any] | None:
    """Validate a Supabase access token by asking Supabase Auth who it belongs to."""
    if not token:
        return None
    r = await client().get(
        f"{settings.supabase_url}/auth/v1/user",
        headers={"apikey": settings.anon_key, "Authorization": f"Bearer {token}"},
    )
    return r.json() if r.status_code == 200 else None
