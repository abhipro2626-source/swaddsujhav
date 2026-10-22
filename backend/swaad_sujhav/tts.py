"""Paaji's voice.

Providers, tried in order (each optional, skipped if not configured or out of quota):
  1. edge       — Microsoft "Madhur" (hi-IN-MadhurNeural) via the free Edge read-aloud
                  service: no key, no account, no limit. Owner's pick for Paaji.
  2. gemini     — Google Gemini TTS "Orus" (same free GEMINI_API_KEY; 10 lines/day free)
  3. elevenlabs — ElevenLabs "George"
  4. azure      — Azure Neural TTS "Arjun" (only if AZURE_SPEECH_KEY is ever added)
TTS_PROVIDER picks the first choice; the others stay as backups.

Every generated line is cached on disk (backend/.cache/tts/), so a line is only
synthesised (and counted against free limits) once. Hindi voices pronounce best from
Devanagari, so Hinglish lines are converted with Gemini first (also cached).
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import io
import os
import time
import wave
from collections import defaultdict, deque
from pathlib import Path
from xml.sax.saxutils import escape

import httpx

from .config import BACKEND_DIR  # loads backend/.env first
from . import gemini

PROVIDER = os.getenv("TTS_PROVIDER", "edge").strip().lower()

EDGE_VOICE = os.getenv("EDGE_VOICE", "hi-IN-MadhurNeural").strip()
# Lively halwai delivery: a touch quicker and deeper than default.
EDGE_RATE = os.getenv("EDGE_RATE", "+6%").strip()
EDGE_PITCH = os.getenv("EDGE_PITCH", "-4Hz").strip()
try:
    import edge_tts  # free Microsoft neural voices (no key)
except ImportError:  # pragma: no cover — optional
    edge_tts = None

GEMINI_TTS_VOICE = os.getenv("GEMINI_TTS_VOICE", "Orus").strip()
GEMINI_TTS_MODELS = [m.strip() for m in os.getenv(
    "GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts,gemini-3.1-flash-tts-preview").split(",") if m.strip()]
GEMINI_TTS_STYLE = os.getenv(
    "GEMINI_TTS_STYLE", "Say warmly and cheerfully, like a friendly Indian sweet-shop uncle welcoming a customer:").strip()

AZURE_KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
AZURE_REGION = os.getenv("AZURE_SPEECH_REGION", "centralindia").strip()
AZURE_VOICE = os.getenv("AZURE_VOICE", "hi-IN-ArjunNeural").strip()
AZURE_RATE = os.getenv("AZURE_RATE", "-6%").strip()
AZURE_PITCH = os.getenv("AZURE_PITCH", "-4%").strip()

ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVEN_VOICE = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb").strip()
ELEVEN_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2").strip()
ELEVEN_SETTINGS = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": True}

CACHE_DIR = BACKEND_DIR / ".cache" / "tts"
MAX_CHARS = 400
_hits: dict[str, deque] = defaultdict(deque)
_off_until: dict[str, float] = defaultdict(float)     # provider → resting until (after quota errors)

MIME = {"edge": "audio/mpeg", "gemini": "audio/wav", "elevenlabs": "audio/mpeg", "azure": "audio/mpeg"}
EXT = {"edge": "mp3", "gemini": "wav", "elevenlabs": "mp3", "azure": "mp3"}


def _configured(p: str) -> bool:
    return {"edge": edge_tts is not None, "gemini": bool(gemini.API_KEY), "elevenlabs": bool(ELEVEN_KEY), "azure": bool(AZURE_KEY)}[p]


def _providers() -> list[str]:
    order = [PROVIDER] if PROVIDER in MIME else []
    order += [p for p in ("edge", "gemini", "elevenlabs", "azure") if p not in order]
    return [p for p in order if _configured(p)]


def enabled() -> bool:
    return bool(_providers())


def _voice(p: str) -> str:
    return {"edge": EDGE_VOICE, "gemini": GEMINI_TTS_VOICE, "elevenlabs": ELEVEN_VOICE, "azure": AZURE_VOICE}[p]


def active_voice() -> str | None:
    p = _providers()
    return f"{p[0]}:{_voice(p[0])}" if p else None


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


def _cache_path(provider: str, text: str) -> Path:
    key = hashlib.sha256(f"{provider}|{_voice(provider)}|{GEMINI_TTS_STYLE if provider == 'gemini' else ''}|{text}".encode()).hexdigest()[:32]
    return CACHE_DIR / f"{key}.{EXT[provider]}"


def _rest(provider: str, seconds: float) -> None:
    _off_until[provider] = time.time() + seconds


# ---------------------------------------------------------------- providers
async def _edge(client: httpx.AsyncClient, text: str) -> bytes:
    """Madhur via Microsoft's free neural voice service. Hindi reads best in Devanagari."""
    spoken = text if _mostly_devanagari(text) else await gemini.to_devanagari(client, text)
    try:
        comm = edge_tts.Communicate(spoken, EDGE_VOICE, rate=EDGE_RATE, pitch=EDGE_PITCH)
        audio = bytearray()
        async for chunk in comm.stream():
            if chunk.get("type") == "audio":
                audio.extend(chunk["data"])
    except Exception as err:  # noqa: BLE001 — network / service hiccup → next voice
        raise TTSError(502, f"Madhur voice unavailable ({type(err).__name__})") from err
    if not audio:
        raise TTSError(502, "Madhur voice returned no audio")
    return bytes(audio)


async def _gemini(client: httpx.AsyncClient, text: str) -> bytes:
    # Gemini's voice reads Hinglish (Roman) and Devanagari directly — no conversion step,
    # which keeps first-time lines fast. Chat replies already arrive in Devanagari.
    body = {
        "contents": [{"parts": [{"text": f"{GEMINI_TTS_STYLE} {text}"}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": GEMINI_TTS_VOICE}}},
        },
    }
    last = 0
    # Each TTS model twice (Google sometimes returns a brief 503 under load).
    for model in [m for m in GEMINI_TTS_MODELS for _ in (0, 1)]:
        if last >= 500:
            await asyncio.sleep(0.8)
        r = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                              params={"key": gemini.API_KEY}, json=body, timeout=httpx.Timeout(45.0, connect=5.0))
        last = r.status_code
        if r.status_code == 200:
            try:
                part = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]
                pcm = base64.b64decode(part["data"])
            except (KeyError, IndexError, ValueError) as err:
                raise TTSError(502, f"Gemini TTS returned no audio ({err})") from err
            rate = 24000
            mime = part.get("mimeType", "")
            if "rate=" in mime:
                try:
                    rate = int(mime.split("rate=")[1].split(";")[0])
                except ValueError:
                    pass
            buf = io.BytesIO()
            with wave.open(buf, "wb") as w:      # raw 16-bit PCM → playable WAV
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(rate)
                w.writeframes(pcm)
            return buf.getvalue()
        if r.status_code == 429:
            _rest("gemini", 120)                 # free-tier voice limit: rest, use backup voice
            raise TTSError(429, "Gemini voice limit reached")
        if r.status_code in (401, 403):
            raise TTSError(503, "Gemini key rejected for TTS")
        # 404 / 5xx: try the next TTS model
    raise TTSError(502, f"Gemini TTS error {last}")


async def _eleven(client: httpx.AsyncClient, text: str) -> bytes:
    # Paaji speaks Hindi: Devanagari gives ElevenLabs' multilingual model the right pronunciation.
    spoken = text if _mostly_devanagari(text) else await gemini.to_devanagari(client, text)
    r = await client.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        json={"text": spoken, "model_id": ELEVEN_MODEL, "voice_settings": ELEVEN_SETTINGS},
        timeout=httpx.Timeout(30.0, connect=5.0))
    if r.status_code == 401:
        _rest("elevenlabs", 86400)               # revoked/invalid key: stop trying for a day
        raise TTSError(503, "ElevenLabs key rejected")
    if r.status_code in (402, 429) or "quota" in r.text.lower():
        _rest("elevenlabs", 3600)
        raise TTSError(402, "ElevenLabs credit used up")
    if r.status_code >= 400:
        raise TTSError(502, f"ElevenLabs error {r.status_code}")
    return r.content


async def _azure(client: httpx.AsyncClient, text: str) -> bytes:
    spoken = await gemini.to_devanagari(client, text)
    ssml = (f"<speak version='1.0' xml:lang='hi-IN'><voice name='{AZURE_VOICE}'>"
            f"<prosody rate='{AZURE_RATE}' pitch='{AZURE_PITCH}'>{escape(spoken)}</prosody></voice></speak>")
    r = await client.post(
        f"https://{AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1",
        headers={"Ocp-Apim-Subscription-Key": AZURE_KEY, "Content-Type": "application/ssml+xml",
                 "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "swaad-sujhaav"},
        content=ssml.encode("utf-8"), timeout=httpx.Timeout(20.0, connect=5.0))
    if r.status_code in (401, 403):
        raise TTSError(503, "Azure key rejected")
    if r.status_code == 429:
        _rest("azure", 60)
        raise TTSError(429, "Azure busy")
    if r.status_code >= 400:
        raise TTSError(502, f"Azure error {r.status_code}")
    return r.content


async def synthesize(text: str, client: httpx.AsyncClient) -> tuple[bytes, str]:
    """Return (audio bytes, mime type) from the first provider that can speak."""
    text = " ".join(text.split())[:MAX_CHARS]
    if not text:
        raise TTSError(400, "Empty text")
    providers = _providers()
    if not providers:
        raise TTSError(503, "Studio voice is not configured")
    # Cached audio from any provider is free and instant.
    for p in providers:
        path = _cache_path(p, text)
        if path.exists():
            return path.read_bytes(), MIME[p]
    last: TTSError | None = None
    for p in providers:
        if time.time() < _off_until[p]:
            continue
        try:
            audio = await {"edge": _edge, "gemini": _gemini, "elevenlabs": _eleven, "azure": _azure}[p](client, text)
        except TTSError as err:
            logging.getLogger("swaad.tts").info("%s voice failed: %s", p, err)
            last = err
            continue
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _cache_path(p, text).write_bytes(audio)
        return audio, MIME[p]
    raise last or TTSError(503, "No voice available right now")


def _mostly_devanagari(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    deva = sum(1 for c in letters if "\u0900" <= c <= "\u097f")
    return bool(letters) and deva / len(letters) >= 0.6


def cached(text: str) -> tuple[bytes, str] | None:
    """Audio already made for this line by any provider, else None."""
    text = " ".join(text.split())[:MAX_CHARS]
    for p in _providers():
        path = _cache_path(p, text)
        if path.exists():
            return path.read_bytes(), MIME[p]
    return None


def can_stream() -> bool:
    """Stream only when Madhur (edge) is the chosen voice; another first choice uses synthesize()."""
    p = _providers()
    return bool(p) and p[0] == "edge" and time.time() >= _off_until["edge"]


async def stream(text: str, client: httpx.AsyncClient):
    """Yield Madhur's MP3 as it is generated (first sound in well under a second) and
    cache the whole clip when done. Lines already in Devanagari skip the conversion step."""
    text = " ".join(text.split())[:MAX_CHARS]
    spoken = text if _mostly_devanagari(text) else await gemini.to_devanagari(client, text)
    audio = bytearray()
    comm = edge_tts.Communicate(spoken, EDGE_VOICE, rate=EDGE_RATE, pitch=EDGE_PITCH)
    async for chunk in comm.stream():
        if chunk.get("type") == "audio":
            audio.extend(chunk["data"])
            yield chunk["data"]
    if audio:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path = _cache_path("edge", text)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(bytes(audio))
        tmp.replace(path)

