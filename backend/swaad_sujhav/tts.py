"""Paaji's voice: Azure Neural TTS ("Arjun", Hindi) first, ElevenLabs as backup.

TTS_PROVIDER = azure | elevenlabs | auto (default auto: Azure if its key is set,
otherwise ElevenLabs). Every generated line is cached on disk
(backend/.cache/tts/), so a line is only synthesised (and counted) once.
Azure Hindi voices pronounce best from Devanagari, so Hinglish lines are first
converted with Gemini when it is configured (also cached).
"""
from __future__ import annotations

import hashlib
import os
import time
from collections import defaultdict, deque
from pathlib import Path
from xml.sax.saxutils import escape

import httpx

from .config import BACKEND_DIR  # loads backend/.env first
from . import gemini

PROVIDER = os.getenv("TTS_PROVIDER", "auto").strip().lower()

AZURE_KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
AZURE_REGION = os.getenv("AZURE_SPEECH_REGION", "centralindia").strip()
AZURE_VOICE = os.getenv("AZURE_VOICE", "hi-IN-ArjunNeural").strip()
# Warm halwai delivery: a touch slower and deeper than default.
AZURE_RATE = os.getenv("AZURE_RATE", "-6%").strip()
AZURE_PITCH = os.getenv("AZURE_PITCH", "-4%").strip()

ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVEN_VOICE = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb").strip()
ELEVEN_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2").strip()
ELEVEN_SETTINGS = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": True}

CACHE_DIR = BACKEND_DIR / ".cache" / "tts"
MAX_CHARS = 400
_hits: dict[str, deque] = defaultdict(deque)
_eleven_off_until = 0.0
_azure_off_until = 0.0


def _providers() -> list[str]:
    order = []
    if PROVIDER in ("azure", "auto") and AZURE_KEY:
        order.append("azure")
    if PROVIDER in ("elevenlabs", "auto") and ELEVEN_KEY:
        order.append("elevenlabs")
    if PROVIDER == "azure" and ELEVEN_KEY and "elevenlabs" not in order:
        order.append("elevenlabs")          # backup if Azure fails
    if PROVIDER == "elevenlabs" and AZURE_KEY and "azure" not in order:
        order.append("azure")
    return order


def enabled() -> bool:
    return bool(_providers())


def active_voice() -> str | None:
    p = _providers()
    if not p:
        return None
    return f"azure:{AZURE_VOICE}" if p[0] == "azure" else f"elevenlabs:{ELEVEN_VOICE}"


def allowed(ip: str, per_minute: int = 30) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= per_minute:
        return False
    q.append(now)
    return True


class TTSError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _cache_path(provider: str, voice: str, text: str) -> Path:
    key = hashlib.sha256(f"{provider}|{voice}|{text}".encode()).hexdigest()[:32]
    return CACHE_DIR / f"{key}.mp3"


async def _azure(client: httpx.AsyncClient, text: str) -> bytes:
    global _azure_off_until
    if time.time() < _azure_off_until:
        raise TTSError(503, "Azure resting after quota")
    spoken = await gemini.to_devanagari(client, text)
    ssml = (f"<speak version='1.0' xml:lang='hi-IN'><voice name='{AZURE_VOICE}'>"
            f"<prosody rate='{AZURE_RATE}' pitch='{AZURE_PITCH}'>{escape(spoken)}</prosody></voice></speak>")
    r = await client.post(
        f"https://{AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1",
        headers={"Ocp-Apim-Subscription-Key": AZURE_KEY, "Content-Type": "application/ssml+xml",
                 "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "swaad-sujhav"},
        content=ssml.encode("utf-8"), timeout=httpx.Timeout(20.0, connect=5.0))
    if r.status_code in (401, 403):
        raise TTSError(503, "Azure key rejected")
    if r.status_code == 429:
        _azure_off_until = time.time() + 60
        raise TTSError(429, "Azure busy")
    if r.status_code >= 400:
        raise TTSError(502, f"Azure error {r.status_code}")
    return r.content


async def _eleven(client: httpx.AsyncClient, text: str) -> bytes:
    global _eleven_off_until
    if time.time() < _eleven_off_until:
        raise TTSError(402, "ElevenLabs credit used up")
    r = await client.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        json={"text": text, "model_id": ELEVEN_MODEL, "voice_settings": ELEVEN_SETTINGS},
        timeout=httpx.Timeout(30.0, connect=5.0))
    if r.status_code == 401:
        raise TTSError(503, "ElevenLabs key rejected")
    if r.status_code in (402, 429) or "quota" in r.text.lower():
        _eleven_off_until = time.time() + 3600
        raise TTSError(402, "ElevenLabs credit used up")
    if r.status_code >= 400:
        raise TTSError(502, f"ElevenLabs error {r.status_code}")
    return r.content


async def synthesize(text: str, client: httpx.AsyncClient) -> bytes:
    text = " ".join(text.split())[:MAX_CHARS]
    if not text:
        raise TTSError(400, "Empty text")
    providers = _providers()
    if not providers:
        raise TTSError(503, "Studio voice is not configured")
    last: TTSError | None = None
    for p in providers:
        voice = AZURE_VOICE if p == "azure" else ELEVEN_VOICE
        path = _cache_path(p, voice, text)
        if path.exists():
            return path.read_bytes()
        try:
            audio = await (_azure(client, text) if p == "azure" else _eleven(client, text))
        except TTSError as err:
            last = err
            continue
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_bytes(audio)
        return audio
    raise last or TTSError(503, "No voice available")
