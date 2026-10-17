"""Paaji's studio voice via ElevenLabs (optional).

Set ELEVENLABS_API_KEY in backend/.env to enable. Every generated line is
cached on disk (backend/.cache/tts/), so a line is only paid for once.
Without a key the endpoint reports disabled and the browser voice is used.
"""
from __future__ import annotations

import hashlib
import os
import time
from collections import defaultdict, deque
from pathlib import Path

import httpx

from .config import BACKEND_DIR

API_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
# Default: "Adam", a deep, warm premade male voice. For a Punjabi/Indian accent,
# pick a male voice from the ElevenLabs Voice Library and put its ID here.
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB").strip()
MODEL_ID = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2").strip()
CACHE_DIR = BACKEND_DIR / ".cache" / "tts"
MAX_CHARS = 400

# Bold and smooth: steady delivery, strong likeness, a touch of warmth/style.
VOICE_SETTINGS = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": True}

_hits: dict[str, deque] = defaultdict(deque)   # per-IP request times (simple rate limit)


def enabled() -> bool:
    return bool(API_KEY)


def allowed(ip: str, per_minute: int = 30) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= per_minute:
        return False
    q.append(now)
    return True


def _cache_path(text: str) -> Path:
    key = hashlib.sha256(f"{VOICE_ID}|{MODEL_ID}|{text}".encode()).hexdigest()[:32]
    return CACHE_DIR / f"{key}.mp3"


class TTSError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


async def synthesize(text: str, client: httpx.AsyncClient) -> bytes:
    text = " ".join(text.split())[:MAX_CHARS]
    if not text:
        raise TTSError(400, "Empty text")
    path = _cache_path(text)
    if path.exists():
        return path.read_bytes()
    if not enabled():
        raise TTSError(503, "Studio voice is not configured")
    r = await client.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        json={"text": text, "model_id": MODEL_ID, "voice_settings": VOICE_SETTINGS},
        timeout=httpx.Timeout(30.0, connect=5.0),
    )
    if r.status_code == 401:
        raise TTSError(503, "ElevenLabs key rejected")
    if r.status_code in (402, 429) or "quota" in r.text.lower():
        raise TTSError(402, "ElevenLabs credit used up")
    if r.status_code >= 400:
        raise TTSError(502, f"ElevenLabs error {r.status_code}")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(r.content)
    return r.content
