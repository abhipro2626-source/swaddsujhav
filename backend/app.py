"""Swaad Sujhaav server.

    python backend/app.py            # http://localhost:8130

- Serves the static frontend (index.html, css/, js/, assets/).
- /api/recommend, /api/upsell, /api/similar — live ML recommendations
  (the frontend falls back to Supabase whenever this server is unreachable).
- /api/tts — Paaji's studio voice (ElevenLabs, optional, cached).
- /api/admin/retrain — retrain the model now (shop admins only).
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import Body, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from swaad_sujhav import db, ml, tts
from swaad_sujhav.config import FRONTEND_DIR, settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
for noisy in ("httpx", "huggingface_hub", "sentence_transformers"):
    logging.getLogger(noisy).setLevel(logging.WARNING)
log = logging.getLogger("swaad")

ML_TOKEN = os.getenv("ML_TOKEN", "").strip()
state: dict = {"model": ml.Model(), "training": False, "last_error": None, "last_run": None}


async def retrain(trigger: str = "schedule") -> dict:
    """Pull training data, fit the model in a worker thread, publish results to Supabase."""
    if state["training"]:
        return {"status": "busy"}
    if not ML_TOKEN:
        state["last_error"] = "ML_TOKEN missing in backend/.env"
        return {"status": "disabled", "error": state["last_error"]}
    state["training"] = True
    try:
        data = await db.rpc("ml_training_data", {"p_token": ML_TOKEN}, timeout=120)
        model = await asyncio.to_thread(ml.train, data)
        state["model"] = model
        out = await asyncio.to_thread(ml.export_results, model)
        run_id = await db.rpc("ml_store_results", {
            "p_token": ML_TOKEN, "p_similar": out["similar"], "p_user_recos": out["user_recos"],
            "p_embeddings": out["embeddings"], "p_metrics": model.metrics, "p_trigger": trigger,
        }, timeout=180)
        state["last_error"] = None
        state["last_run"] = {"run_id": run_id, **model.metrics}
        log.info("ML run %s stored (%d similar, %d user picks)", run_id, len(out["similar"]), len(out["user_recos"]))
        return {"status": "ok", **state["last_run"]}
    except Exception as err:  # noqa: BLE001
        state["last_error"] = str(err)
        log.exception("ML training failed")
        return {"status": "failed", "error": str(err)}
    finally:
        state["training"] = False


async def scheduler():
    await asyncio.sleep(2)
    while True:
        await retrain("schedule")
        await asyncio.sleep(max(5, settings.retrain_every_minutes) * 60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(scheduler())
    yield
    task.cancel()
    await db.close()


app = FastAPI(title="Swaad Sujhaav API", version="1.0.0", lifespan=lifespan)

# The frontend may be hosted elsewhere (Netlify/Vercel) and call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


async def current_user(authorization: str | None) -> dict | None:
    """Return the Supabase user for a 'Bearer <jwt>' header, or None for guests."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return await db.user_from_token(authorization.split(" ", 1)[1].strip())


def _ids(raw: str | None) -> list[int]:
    return [int(x) for x in (raw or "").split(",") if x.strip().isdigit()][:100]


def _model() -> ml.Model:
    m = state["model"]
    if not m.ready:
        raise HTTPException(503, "Model is warming up")
    return m


@app.get("/api/health")
async def health():
    m = state["model"]
    return {"ok": True, "model_ready": m.ready, "training": state["training"], "last_run": state["last_run"],
            "last_error": state["last_error"], "tts": tts.enabled()}


@app.get("/api/recommend")
async def recommend(limit: int = Query(12, ge=1, le=48), occasion: str | None = None, mood: str | None = None,
                    exclude: str | None = None, authorization: str | None = Header(default=None)):
    user = await current_user(authorization)
    m = _model()
    items = ml.recommend(m, user["id"] if user else None, limit=limit, occasion=occasion, mood=mood, exclude=set(_ids(exclude)))
    return {"items": items, "model": m.embedder, "personal": bool(user and user["id"] in m.user_rows)}


@app.get("/api/upsell")
async def upsell(limit: int = Query(3, ge=1, le=12), cart: str | None = None, authorization: str | None = Header(default=None)):
    user = await current_user(authorization)
    return {"items": ml.upsell(_model(), user["id"] if user else None, _ids(cart), limit)}


@app.get("/api/similar")
async def similar(sweet_id: int, kind: str = "content", limit: int = Query(8, ge=1, le=24)):
    return {"items": ml.similar(_model(), sweet_id, kind, limit)}


@app.get("/api/ask")
async def ask_paaji(q: str = Query(..., max_length=300), authorization: str | None = Header(default=None)):
    """Ask Paaji: free-text wish (Hinglish/English) → picks + reply + where to go."""
    from swaad_sujhav import ask
    user = await current_user(authorization)
    return await asyncio.to_thread(ask.ask, _model(), q, user["id"] if user else None)


@app.post("/api/admin/retrain")
async def admin_retrain(authorization: str | None = Header(default=None)):
    token = (authorization or "").split(" ", 1)[-1].strip()
    if not token or not await db.rpc("is_admin", {}, user_token=token):
        raise HTTPException(403, "Admins only")
    return await retrain("manual")


@app.get("/api/tts/status")
async def tts_status():
    return {"enabled": tts.enabled(), "voice": tts.active_voice()}


@app.post("/api/chat")
async def chat(request: Request, payload: dict = Body(...), authorization: str | None = Header(default=None)):
    """Talk to Paaji. Our ML retrieves real candidate sweets; Gemini (if configured)
    writes Paaji's reply and picks only from those. Falls back to rule-based Ask Paaji."""
    from swaad_sujhav import ask, gemini
    ip = request.client.host if request.client else "?"
    if not tts.allowed(f"chat:{ip}", per_minute=20):
        raise HTTPException(429, "Thoda saans le lo ji — too many messages.")
    message = str(payload.get("message", "")).strip()[:400]
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    if not message:
        raise HTTPException(400, "Empty message")
    m = _model()
    user = await current_user(authorization)
    uid = user["id"] if user else None
    base = await asyncio.to_thread(ask.ask, m, message, uid, 12)       # parse + semantic retrieval
    if base["go"] and base["go"]["type"] != "sweet":                    # budget / gift box / cart / orders
        return {**base, "reply_hi": base["reply"], "engine": "rules"}
    if not gemini.enabled() or not base["items"]:
        return {**base, "reply_hi": base["reply"], "engine": "rules"}
    candidates = []
    for it in base["items"]:
        s = dict(m.sweets[m.idx[it["sweet_id"]]])
        candidates.append(s)
    taste = (m.user_rows.get(uid) or {}).get("profile") if uid else None
    try:
        out = await gemini.chat(db.client(), message, history, candidates, taste)
    except Exception as err:  # noqa: BLE001 — never break the chat; fall back
        log.info("Gemini fallback: %s", err)
        return {**base, "reply_hi": base["reply"], "engine": "rules"}
    picks = out["picks"] or [base["items"][0]["sweet_id"]]
    items = [{"sweet_id": p, "reason": "Paaji's pick"} for p in picks]
    top = m.sweets[m.idx[picks[0]]]
    return {"reply": out["reply"], "reply_hi": out["reply_hi"], "items": items, "filters": base["filters"],
            "go": {"type": "sweet", "slug": ask._slug(top["name"])}, "engine": "gemini"}


@app.post("/api/tts")
async def tts_speak(request: Request, payload: dict = Body(...)):
    """Paaji's studio voice (ElevenLabs). Returns MP3; cached per line."""
    ip = request.client.host if request.client else "?"
    if not tts.allowed(ip):
        raise HTTPException(429, "Too many voice requests, ji. Thoda ruk jao.")
    try:
        audio = await tts.synthesize(str(payload.get("text", "")), db.client())
    except tts.TTSError as err:
        raise HTTPException(err.status, str(err)) from err
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=604800"})


class NoCacheStatic(StaticFiles):
    """Serve the site with revalidation so edits show up immediately."""
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers.setdefault("Cache-Control", "no-cache")
        return resp


# Only these public folders are served. Never the project root: it holds
# backend/.env (secrets), seed caches and source files that must stay private.
for public_dir in ("css", "js", "assets", "docs/voice-samples"):
    if (FRONTEND_DIR / public_dir).is_dir():
        app.mount(f"/{public_dir}", NoCacheStatic(directory=FRONTEND_DIR / public_dir), name=public_dir.replace("/", "-"))
app.mount("/supabase/templates", NoCacheStatic(directory=FRONTEND_DIR / "supabase" / "templates"), name="templates")


@app.get("/", include_in_schema=False)
async def index():
    from fastapi.responses import FileResponse
    return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=settings.port, reload=False)
