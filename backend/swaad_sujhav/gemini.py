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
# Flash-Lite first: fast, good for short replies, and a much bigger free daily limit
# than full Flash (which is only 20 requests/day on the free tier).
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip()
FALLBACK_MODEL = "gemini-flash-latest"   # Google's alias; used if MODEL is retired
BACKUP_MODELS = ["gemini-flash-lite-latest", "gemini-3.8-flash"]   # used when a model is busy, retired or out of quota
FAST_MODELS = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"]     # quick jobs (transliteration): no "thinking" delay
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PERSONA = """You are "Paaji", the warm, proud and kind Punjabi halwai of Swaad Sujhaav, a festive mithai shop in Muzaffarnagar, Uttar Pradesh.
How you talk:
- Friendly Hinglish with a light Punjabi touch ("ji", "haan ji", "wah ji wah", "chalo ji"). Short: 1–3 sentences, max ~45 words.
- Respectful and warm; never rude, never make fun of anyone, no stereotypes, no religious or political opinions.
- Greet ONLY when the situation is a welcome or someone arriving; then say "Jai Shree Ram ji" (never "Sat Sri Akal"). Otherwise jump straight into what you want to say. Write "Deepawali" (never "Diwali") and the shop name as "Swaad Sujhaav".
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
_cooldown_until = 0.0     # all models out of quota → rest
_model_rest: dict = {}     # model → resting until (its own daily limit hit)


def enabled() -> bool:
    return bool(API_KEY) and time.time() >= _cooldown_until


async def _generate(client: httpx.AsyncClient, contents: list, system: str, schema: dict | None, timeout: float = 20.0,
                    models: list[str] | None = None) -> str:
    global _cooldown_until
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        # Newer Gemini models spend part of the budget "thinking" before answering,
        # so leave plenty of room or the JSON reply gets cut off mid-string.
        "generationConfig": {"temperature": 0.8, "maxOutputTokens": 4096},
    }
    if schema:
        body["generationConfig"]["responseMimeType"] = "application/json"
        body["generationConfig"]["responseSchema"] = schema
    # Try the configured model, then backups. Models that are retired (404), overloaded
    # (5xx) or out of free quota (429) are skipped, so Paaji keeps talking.
    r = None
    now = time.time()
    tried = 0
    for model in dict.fromkeys(models or [MODEL, FALLBACK_MODEL, *BACKUP_MODELS]):
        if _model_rest.get(model, 0) > now:
            continue
        tried += 1
        r = await client.post(URL.format(model=model), params={"key": API_KEY}, json=body, timeout=timeout)
        if r.status_code == 429:
            _model_rest[model] = now + 3600          # this model's free quota is used up; retry in an hour
            log.info("Gemini %s quota reached; trying next model", model)
            continue
        if r.status_code in (404, 500, 503):
            log.info("Gemini %s returned %s; trying next model", model, r.status_code)
            continue
        break
    if r is None or (r.status_code == 429):
        _cooldown_until = now + 300                  # every model is out of quota: rest 5 minutes
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
            "Keep 'Rs' as 'रुपये'. Output only the converted sentence.", None, timeout=12.0,
            models=[*FAST_MODELS, MODEL])
        out = out.strip().strip('"')[:500] or text
    except Exception as err:  # noqa: BLE001
        log.info("transliteration skipped: %s", err)
        return text
    _translit_cache[text] = out
    if len(_translit_cache) > 2000:
        _translit_cache.popitem(last=False)
    return out


# ---------------------------------------------------------------- fresh lines for every moment
# One request writes several variations at once (kind to the free quota); the server
# hands them out one by one so Paaji never sounds canned.
MOMENTS = {
    "welcome": "A customer just walked into the shop. Greet them warmly and invite them to look around{name_part}. It's the Deepawali season.",
    "return": "{name} is back at the shop again. Greet them like a regular you're happy to see.",
    "add": "The customer just added {sweet} to their thaali (tray). Praise their choice in a fun, warm way.",
    "upsell_new": "Suggest the customer also take {sweet}, which is a NEW arrival. Sometimes use the phrase 'poore Muzaffarnagar mein nayi hai'.",
    "upsell_pair": "The customer has {added}. Suggest also taking {sweet} because they taste great together.",
    "upsell_similar": "The customer liked {added}. Suggest {sweet}, which is similar, as something they'd also love.",
    "mix_nudge": "Tell the customer that adding {n} more different sweet(s) gives {pct}% off the whole order (Mix & Save).",
    "mix_unlocked": "Celebrate: the customer just unlocked {pct}% off with Mix & Save.",
    "cart_idle": "The customer has sweets in their cart but hasn't ordered for a while. Gently and playfully nudge them to place the order.",
    "cart_open": "The customer opened their cart. Say something warm about their thaali.",
    "order": "The customer just placed their order. Thank them joyfully and wish them a happy Deepawali.",
    "no_result": "The customer searched for something we don't have. Apologise kindly and invite them to try our suggestions.",
    "removed": "The customer removed a sweet from their cart. Say it's no problem, lightly and kindly.",
    "quiz_done": "The customer finished the taste quiz. Say you now know their taste and will suggest perfectly.",
    "mood": "The customer picked the mood '{mood}'. React to it and say you'll show matching sweets.",
}
LINES_SCHEMA = {
    "type": "OBJECT",
    "properties": {"lines": {"type": "ARRAY", "items": {
        "type": "OBJECT",
        "properties": {"roman": {"type": "STRING"}, "hi": {"type": "STRING"}},
        "required": ["roman", "hi"]}}},
    "required": ["lines"],
}


async def fresh_lines(client: httpx.AsyncClient, moment: str, ctx: dict, n: int = 6) -> list[dict]:
    """Return up to n fresh {"roman", "hi"} lines for a moment (Hinglish + Devanagari)."""
    if moment not in MOMENTS:
        raise ValueError("unknown moment")
    c = {k: str(v)[:60] for k, v in (ctx or {}).items() if v not in (None, "")}
    c.setdefault("name", "ji")
    c["name_part"] = f" (their name is {c['name']})" if ctx.get("name") else ""
    try:
        situation = MOMENTS[moment].format(**{**{"sweet": "this sweet", "added": "their sweet", "n": "1", "pct": "5", "mood": "happy"}, **c})
    except (KeyError, IndexError):
        situation = MOMENTS[moment]
    prompt = (f"Situation: {situation}\nWrite {n} different things Paaji could say right now. Each: ONE short sentence (max 18 words), "
              "fresh and varied (different openings, different jokes/warmth), natural spoken Hinglish with a light Punjabi touch. "
              "Mention the sweet's exact name when one is given. No hashtags, no emojis, no quotes from songs/films. "
              "For each line give 'roman' (Hinglish in Roman script) and 'hi' (the same line in Devanagari for a Hindi voice).")
    raw = await _generate(client, [{"role": "user", "parts": [{"text": prompt}]}], PERSONA, LINES_SCHEMA, timeout=15.0,
                          models=[*FAST_MODELS, MODEL])
    out = []
    for line in (json.loads(raw).get("lines") or [])[:n]:
        roman = str(line.get("roman", "")).strip().strip('"')[:220]
        if roman:
            out.append({"roman": roman, "hi": str(line.get("hi", "")).strip().strip('"')[:260] or roman})
    return out
