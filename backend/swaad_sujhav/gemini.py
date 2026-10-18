"""Paaji's brain, powered by Google Gemini (optional).

- chat(): a grounded conversation. Our own ML first retrieves real candidate sweets
  from the catalog; Gemini may only recommend from that list (no invented sweets,
  prices or stock). Returns Paaji's reply in Hinglish (for the bubble) and in
  Devanagari (for the Hindi voice), plus the picked sweet ids.
- to_devanagari(): converts Paaji's built-in Hinglish lines for the Azure Hindi voice.

Set GEMINI_API_KEY in backend/.env to enable. Without it, callers fall back to the
rule-based Ask Paaji. The key never leaves the server.
"""
from __future__ import annotations

import json
import logging
import os
import time
from collections import OrderedDict

import httpx

from . import config  # noqa: F401  (loads backend/.env before reading keys)

log = logging.getLogger("swaad.gemini")

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PERSONA = """You are "Paaji", the warm, proud and kind Punjabi halwai of Swaad Sujhaav, a festive mithai shop in Muzaffarnagar, Uttar Pradesh.
How you talk:
- Friendly Hinglish with a light Punjabi touch ("ji", "haan ji", "wah ji wah", "chalo ji"). Short: 1–3 sentences, max ~45 words.
- Respectful and warm; never rude, never make fun of anyone, no stereotypes, no religious or political opinions.
- Your own original words only — never quote poets, songs or films.
- Only talk about sweets, the shop, festivals, gifting and ordering. Politely steer other topics back to mithai.
Hard rules:
- Recommend ONLY sweets from the CANDIDATES list, using their exact ids. Never invent sweets, prices, stock, offers or delivery promises.
- Respect diet needs strictly (sugar-free, vegan, Jain, gluten-free, eggless) — only pick candidates that match.
- If nothing fits, say so kindly and suggest the closest candidate.
- Shop facts you may use: Mix & Save gives 5% off on 3 different sweets and 10% off on 5+; free Deepawali gift box on orders above Rs 999; Cash on Delivery or Pay at Shop; free delivery in Muzaffarnagar.
Return JSON only."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "reply": {"type": "STRING", "description": "Paaji's reply in Hinglish (Roman script)."},
        "reply_hi": {"type": "STRING", "description": "The same reply written in Devanagari script, for a Hindi text-to-speech voice."},
        "picks": {"type": "ARRAY", "items": {"type": "INTEGER"}, "description": "Up to 4 candidate sweet ids, best first."},
    },
    "required": ["reply", "reply_hi", "picks"],
}

_translit_cache: "OrderedDict[str, str]" = OrderedDict()
_cooldown_until = 0.0     # back off after quota errors


def enabled() -> bool:
    return bool(API_KEY) and time.time() >= _cooldown_until


async def _generate(client: httpx.AsyncClient, contents: list, system: str, schema: dict | None, timeout: float = 20.0) -> str:
    global _cooldown_until
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.8, "maxOutputTokens": 512},
    }
    if schema:
        body["generationConfig"]["responseMimeType"] = "application/json"
        body["generationConfig"]["responseSchema"] = schema
    r = await client.post(URL.format(model=MODEL), params={"key": API_KEY}, json=body, timeout=timeout)
    if r.status_code == 429:
        _cooldown_until = time.time() + 60          # free-tier limit hit: rest a minute
        raise RuntimeError("Gemini rate limit")
    if r.status_code >= 400:
        raise RuntimeError(f"Gemini error {r.status_code}: {r.text[:200]}")
    data = r.json()
    parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise RuntimeError("Gemini returned no text")
    return text


def _candidate_lines(sweets: list[dict]) -> str:
    rows = []
    for s in sweets:
        diet = ", ".join(k for k, v in (("sugar-free", s["is_sugar_free"]), ("vegan", s["is_vegan"]), ("jain", s["is_jain"]),
                                        ("gluten-free", s["is_gluten_free"]), ("eggless", s["is_eggless"])) if v) or "-"
        price = f"from Rs {int(s['min_price'])}" if s.get("min_price") else "price on page"
        rows.append(f"- id {s['id']}: {s['name']} ({s['region']}, {s['category']}) · {price} · sweetness {s['sweetness']}/5 · diet: {diet}"
                    f"{' · NEW' if s['is_new'] else ''} · {(s.get('description') or '')[:110]}")
    return "\n".join(rows)


async def chat(client: httpx.AsyncClient, message: str, history: list[dict], candidates: list[dict],
               user_taste: dict | None = None) -> dict:
    """Return {"reply", "reply_hi", "picks"} grounded in `candidates`."""
    taste = ""
    if user_taste and user_taste.get("quiz_done"):
        taste = (f"\nCustomer's saved taste: sweetness {user_taste.get('sweetness')}/5, likes {', '.join(user_taste.get('categories') or [])}, "
                 f"diet {', '.join(k for k, v in (user_taste.get('diet') or {}).items() if v) or 'none'}.")
    system = f"{PERSONA}{taste}\n\nCANDIDATES (the only sweets you may recommend):\n{_candidate_lines(candidates)}"
    contents = []
    for turn in history[-6:]:
        role = "model" if turn.get("role") == "paaji" else "user"
        txt = str(turn.get("text", ""))[:400]
        if txt:
            contents.append({"role": role, "parts": [{"text": txt}]})
    contents.append({"role": "user", "parts": [{"text": message[:400]}]})
    raw = await _generate(client, contents, system, SCHEMA)
    out = json.loads(raw)
    allowed = {s["id"] for s in candidates}
    out["picks"] = [int(p) for p in out.get("picks", []) if int(p) in allowed][:4]
    out["reply"] = str(out.get("reply", "")).strip()[:400]
    out["reply_hi"] = str(out.get("reply_hi", "")).strip()[:400] or out["reply"]
    return out


async def to_devanagari(client: httpx.AsyncClient, text: str) -> str:
    """Hinglish (Roman) → Devanagari, cached. Returns the input unchanged on failure."""
    if not text or not enabled() or not any("a" <= c.lower() <= "z" for c in text):
        return text
    if text in _translit_cache:
        _translit_cache.move_to_end(text)
        return _translit_cache[text]
    try:
        out = await _generate(
            client, [{"role": "user", "parts": [{"text": text}]}],
            "Transliterate this Hinglish/Punjabi sentence into natural Devanagari script for a Hindi text-to-speech voice. "
            "Keep English brand or dish words that Indians say in English (like 'Mix & Save', 'gift box') readable in Devanagari. "
            "Keep 'Rs' as 'रुपये'. Output only the converted sentence.", None, timeout=12.0)
        out = out.strip().strip('"')[:500] or text
    except Exception as err:  # noqa: BLE001
        log.info("transliteration skipped: %s", err)
        return text
    _translit_cache[text] = out
    if len(_translit_cache) > 2000:
        _translit_cache.popitem(last=False)
    return out
