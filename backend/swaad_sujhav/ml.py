"""Swaad Sujhaav recommendation engine — free, local machine learning.

Pipeline (see README → "How recommendations work"):
  1. Content model  — sentence-transformer embeddings of each sweet's text
                      (name, story, ingredients, region…) + attribute one-hots.
                      Falls back to TF-IDF + SVD if sentence-transformers is missing.
  2. Collaborative  — implicit-feedback matrix (orders 3, favourites 2, add-to-cart 1)
                      → item-item cosine and truncated SVD user factors.
  3. Basket lift    — sweets that land in the same order ("goes great with").
  4. Ranking        — score = 0.40 taste + 0.25 collaborative + 0.15 popularity
                              + 0.10 new + 0.10 occasion,
                      with diet rules, stock, variety and a human reason per pick.
Outputs are written to Supabase (sweet_similar, user_recos, sweet_embeddings) and kept
in memory for the live /api endpoints.
"""
from __future__ import annotations

import logging
import math
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np

log = logging.getLogger("swaad.ml")

WEIGHTS = {"taste": 0.40, "collab": 0.25, "popularity": 0.15, "new": 0.10, "occasion": 0.10}
ACTION_WEIGHT = {"add_to_cart": 1.0, "favorite": 2.0, "view": 0.3}
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def _norm_rows(m: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(m, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return m / n


def _minmax(v: np.ndarray) -> np.ndarray:
    lo, hi = float(v.min()), float(v.max())
    return np.zeros_like(v) if hi - lo < 1e-9 else (v - lo) / (hi - lo)


def is_festive_season(now: datetime | None = None) -> bool:
    return (now or datetime.now(timezone.utc)).month in (10, 11)


@dataclass
class Model:
    sweets: list[dict] = field(default_factory=list)
    idx: dict[int, int] = field(default_factory=dict)          # sweet id → row
    content: np.ndarray | None = None                            # item × item content cosine
    collab: np.ndarray | None = None                             # item × item collaborative cosine
    together: np.ndarray | None = None                           # item × item basket cosine
    user_rows: dict[str, dict] = field(default_factory=dict)     # user id → {liked, taste, collab}
    pop: np.ndarray | None = None
    new: np.ndarray | None = None
    festive: np.ndarray | None = None
    in_stock: np.ndarray | None = None
    embedder: str = "none"
    embeddings: np.ndarray | None = None
    trained_at: float = 0.0
    metrics: dict = field(default_factory=dict)

    @property
    def ready(self) -> bool:
        return self.content is not None and len(self.sweets) > 0


# ---------------------------------------------------------------- features
def _sweet_text(s: dict) -> str:
    return (f"{s['name']}. A {s['category']} sweet from {s['region']}, {s['country']}. "
            f"Made from {s['base']}: {', '.join(s.get('ingredients') or [])}. "
            f"Texture {s.get('texture') or 'soft'}. {s.get('description') or ''} "
            f"{s.get('origin') or ''} Tags: {', '.join(s.get('tags') or [])}. "
            f"Occasions: {', '.join(s.get('occasions') or [])}.")


_TEXT_MODEL = None   # loaded once, reused for catalog embeddings and Ask Paaji queries


class _FastEmbedAdapter:
    """fastembed (ONNX, ~5× lighter than torch) with the same .encode() shape we use."""
    def __init__(self, name: str):
        from fastembed import TextEmbedding
        self._m = TextEmbedding(name)

    def encode(self, texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False):  # noqa: ARG002
        vecs = np.asarray(list(self._m.embed(list(texts), batch_size=batch_size)), dtype=np.float32)
        return _norm_rows(vecs) if normalize_embeddings else vecs


def get_text_model():
    """The MiniLM text model, loaded lazily. Prefers fastembed (fits small servers
    like Render's free tier), falls back to sentence-transformers; None if neither."""
    global _TEXT_MODEL
    if _TEXT_MODEL is None:
        _TEXT_MODEL = False
        try:
            _TEXT_MODEL = _FastEmbedAdapter(EMBED_MODEL)
        except Exception as err:  # noqa: BLE001
            log.info("fastembed unavailable (%s); trying sentence-transformers", err)
            try:
                from sentence_transformers import SentenceTransformer  # heavy import, optional
                _TEXT_MODEL = SentenceTransformer(EMBED_MODEL, device="cpu")
            except Exception as err2:  # noqa: BLE001
                log.warning("no text model available (%s)", err2)
    return _TEXT_MODEL or None


def _embed(texts: list[str]) -> tuple[np.ndarray, str]:
    try:
        model = get_text_model()
        if model is None:
            raise RuntimeError("no text model")
        vecs = model.encode(texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False)
        return np.asarray(vecs, dtype=np.float32), EMBED_MODEL
    except Exception as err:  # noqa: BLE001 — any failure → classic fallback
        log.warning("sentence-transformers unavailable (%s); using TF-IDF", err)
        from sklearn.decomposition import TruncatedSVD
        from sklearn.feature_extraction.text import TfidfVectorizer
        tf = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True).fit_transform(texts)
        k = max(2, min(128, tf.shape[1] - 1, len(texts) - 1))
        vecs = TruncatedSVD(n_components=k, random_state=7).fit_transform(tf)
        return _norm_rows(vecs.astype(np.float32)), "tfidf-svd"


def _attributes(sweets: list[dict]) -> np.ndarray:
    cats = sorted({s["category"] for s in sweets})
    bases = sorted({s["base"] for s in sweets})
    regions = sorted({s["region"] for s in sweets})
    textures = sorted({s.get("texture") or "" for s in sweets})
    cols = len(cats) + len(bases) + len(regions) + len(textures) + 7
    a = np.zeros((len(sweets), cols), dtype=np.float32)
    for i, s in enumerate(sweets):
        o = 0
        a[i, o + cats.index(s["category"])] = 1.0; o += len(cats)
        a[i, o + bases.index(s["base"])] = 1.0; o += len(bases)
        a[i, o + regions.index(s["region"])] = 0.7; o += len(regions)
        a[i, o + textures.index(s.get("texture") or "")] = 0.5; o += len(textures)
        a[i, o] = s["sweetness"] / 5; a[i, o + 1] = s["richness"] / 5
        a[i, o + 2] = float(s["is_sugar_free"]); a[i, o + 3] = float(s["is_vegan"])
        a[i, o + 4] = float(s["is_gluten_free"]); a[i, o + 5] = float(s["country"] != "India")
        a[i, o + 6] = float(s["is_festive"])
    return _norm_rows(a)


def _quiz_match(taste: dict, sweets: list[dict]) -> np.ndarray:
    """How well each sweet matches the quiz answers, in [0, 1]."""
    if not taste:
        return np.zeros(len(sweets), dtype=np.float32)
    sw = float(taste.get("sweetness") or 3)
    cats = set(taste.get("categories") or [])
    bases = set(taste.get("bases") or [])
    regions = set(taste.get("regions") or [])
    prefers = taste.get("prefers") or "both"
    out = np.zeros(len(sweets), dtype=np.float32)
    for i, s in enumerate(sweets):
        milky = s["base"] in ("milk", "khoya", "chhena") or s["category"] in ("milk-based", "bengali")
        nutty = s["base"] == "dry-fruit" or s["category"] == "dry-fruit"
        pref = 1.0 if prefers == "both" else float(milky if prefers == "milky" else nutty)
        out[i] = (0.35 * (1 - abs(s["sweetness"] - sw) / 4) + 0.25 * (s["category"] in cats)
                  + 0.15 * (s["base"] in bases) + 0.15 * (s["region"] in regions) + 0.10 * pref)
    return out


def passes_diet(s: dict, diet: dict) -> bool:
    diet = diet or {}
    return not ((diet.get("sugar_free") and not s["is_sugar_free"]) or (diet.get("vegan") and not s["is_vegan"])
                or (diet.get("jain") and not s["is_jain"]) or (diet.get("gluten_free") and not s["is_gluten_free"])
                or (diet.get("eggless") and not s["is_eggless"]))


# ---------------------------------------------------------------- training
def train(data: dict) -> Model:
    t0 = time.time()
    sweets = sorted(data["sweets"], key=lambda s: s["id"])
    m = Model(sweets=sweets, idx={s["id"]: i for i, s in enumerate(sweets)})
    n = len(sweets)

    # 1. Content
    emb, m.embedder = _embed([_sweet_text(s) for s in sweets])
    m.embeddings = emb
    content_vec = _norm_rows(np.hstack([0.75 * emb, 0.25 * _attributes(sweets)]))
    m.content = content_vec @ content_vec.T
    np.fill_diagonal(m.content, 0.0)

    # 2. Implicit feedback matrix (users × items)
    weights: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for b in data.get("baskets", []):
        for sid in b["items"]:
            if sid in m.idx:
                weights[b["user_id"]][m.idx[sid]] += 3.0
    for f in data.get("favorites", []):
        if f["sweet_id"] in m.idx:
            weights[f["user_id"]][m.idx[f["sweet_id"]]] += ACTION_WEIGHT["favorite"]
    for e in data.get("events", []):
        w = ACTION_WEIGHT.get(e["action"])
        if w and e["sweet_id"] in m.idx:
            weights[e["user_id"]][m.idx[e["sweet_id"]]] += w
    users = sorted(weights)
    X = np.zeros((len(users), n), dtype=np.float32)
    for r, u in enumerate(users):
        for c, w in weights[u].items():
            X[r, c] = math.log1p(w)          # dampen heavy repeat buyers

    # item-item collaborative cosine with shrinkage toward 0 for tiny overlaps
    if len(users) >= 2:
        cols = X / np.maximum(np.linalg.norm(X, axis=0, keepdims=True), 1e-9)
        sim = cols.T @ cols
        co = (X > 0).astype(np.float32).T @ (X > 0).astype(np.float32)
        m.collab = sim * (co / (co + 2.0))
        np.fill_diagonal(m.collab, 0.0)
    else:
        m.collab = np.zeros((n, n), dtype=np.float32)

    # 3. Basket co-occurrence ("bought together")
    B = np.zeros((max(1, len(data.get("baskets", []))), n), dtype=np.float32)
    for r, b in enumerate(data.get("baskets", [])):
        for sid in b["items"]:
            if sid in m.idx:
                B[r, m.idx[sid]] = 1.0
    cnt = B.sum(axis=0)
    co = B.T @ B
    denom = np.sqrt(np.outer(cnt, cnt))
    with np.errstate(divide="ignore", invalid="ignore"):
        m.together = np.where(denom > 0, co / denom, 0.0).astype(np.float32)
    np.fill_diagonal(m.together, 0.0)

    # SVD user factors for personal collaborative scores
    svd_scores = {}
    if len(users) >= 3 and (X > 0).sum() >= 10:
        from scipy.sparse.linalg import svds
        k = max(1, min(12, min(X.shape) - 1))
        U, S, Vt = svds(X.astype(np.float64), k=k)
        pred = (U * S) @ Vt
        for r, u in enumerate(users):
            svd_scores[u] = _minmax(pred[r].astype(np.float32))

    # Item signals
    pops = np.array([s["popularity"] for s in sweets], dtype=np.float32)
    m.pop = pops / max(1.0, float(pops.max()))
    now = datetime.now(timezone.utc)
    m.new = np.array([1.0 if s["is_new"] or _days_since(s["created_at"], now) < 30 else 0.0 for s in sweets], dtype=np.float32)
    m.festive = np.array([1.0 if s["is_festive"] or "diwali" in (s.get("occasions") or []) else 0.0 for s in sweets], dtype=np.float32)
    m.in_stock = np.array([bool(s["in_stock"]) for s in sweets])

    # 4. Per-user components
    profiles = {p["user_id"]: p.get("taste") or {} for p in data.get("profiles", [])}
    for u in set(profiles) | set(users):
        taste = profiles.get(u, {})
        liked = {c: w for c, w in weights.get(u, {}).items()} if u in weights else {}
        quiz = _quiz_match(taste, sweets)
        if liked:
            idxs = np.array(list(liked.keys()))
            w = np.array(list(liked.values()), dtype=np.float32)
            uvec = _norm_rows((content_vec[idxs] * w[:, None]).sum(axis=0, keepdims=True))[0]
            emb_match = np.clip(content_vec @ uvec, 0, 1)
            taste_score = 0.6 * _minmax(emb_match) + 0.4 * quiz
        else:
            taste_score = quiz
        if u in svd_scores:
            collab_score = svd_scores[u]
        elif liked:
            collab_score = _minmax(m.collab[list(liked.keys())].max(axis=0))
        else:
            collab_score = np.zeros(n, dtype=np.float32)
        m.user_rows[u] = {"liked": liked, "taste": taste_score.astype(np.float32),
                          "collab": collab_score.astype(np.float32), "diet": taste.get("diet") or {},
                          "profile": taste}

    m.trained_at = time.time()
    m.metrics = {
        "sweets": n, "users": len(m.user_rows), "interacting_users": len(users),
        "baskets": len(data.get("baskets", [])), "embedder": m.embedder,
        "seconds": round(time.time() - t0, 2), "catalog_coverage": _coverage(m),
    }
    log.info("model trained: %s", m.metrics)
    return m


def _days_since(iso: str, now: datetime) -> float:
    try:
        return (now - datetime.fromisoformat(iso.replace("Z", "+00:00"))).days
    except Exception:  # noqa: BLE001
        return 999


def _coverage(m: Model) -> float:
    """Share of the catalog that appears in someone's top-12 (higher = less popularity bias)."""
    seen = set()
    for u in m.user_rows:
        seen.update(r["sweet_id"] for r in recommend(m, u, limit=12))
    return round(len(seen) / max(1, len(m.sweets)), 3)


# ---------------------------------------------------------------- inference
def recommend(m: Model, user_id: str | None, limit: int = 12, occasion: str | None = None,
              mood: str | None = None, exclude: set[int] | None = None) -> list[dict]:
    if not m.ready:
        return []
    exclude = exclude or set()
    n = len(m.sweets)
    row = m.user_rows.get(user_id) if user_id else None
    taste = row["taste"] if row else np.zeros(n, dtype=np.float32)
    collab = row["collab"] if row else np.zeros(n, dtype=np.float32)
    diet = row["diet"] if row else {}
    liked = row["liked"] if row else {}

    if occasion:
        occ = np.array([1.0 if occasion in (s.get("occasions") or []) else 0.0 for s in m.sweets], dtype=np.float32)
    elif is_festive_season():
        occ = m.festive
    else:
        occ = np.zeros(n, dtype=np.float32)

    parts = {"taste": WEIGHTS["taste"] * taste, "collab": WEIGHTS["collab"] * collab,
             "popularity": WEIGHTS["popularity"] * m.pop, "new": WEIGHTS["new"] * m.new,
             "occasion": WEIGHTS["occasion"] * occ}
    score = sum(parts.values())

    # Mood re-ranking (home page mood picker)
    if mood == "light":
        score = score + np.array([0.5 if (s["is_sugar_free"] or "healthy" in (s.get("tags") or [])) else
                                  (0.15 if s["sweetness"] <= 2 else 0.05 if s["sweetness"] == 3 else -0.2) for s in m.sweets])
    elif mood == "latenight":
        score = score + np.array([0.15 if s["category"] in ("syrup-soaked", "world", "milk-based") else 0 for s in m.sweets])
    elif mood == "celebrating":
        score = score + 0.12 * m.festive
    elif mood == "guests":
        score = score + np.array([0.12 if "guests" in (s.get("occasions") or []) else 0 for s in m.sweets])

    # Already-bought items stay possible but slightly lower, so discovery wins ties.
    for c in liked:
        score[c] *= 0.85

    order = np.argsort(-score)
    out, per_cat = [], defaultdict(int)
    cap = max(2, math.ceil(limit / 3))
    for i in order:
        s = m.sweets[i]
        if s["id"] in exclude or not m.in_stock[i] or not passes_diet(s, diet):
            continue
        if per_cat[s["category"]] >= cap:
            continue
        per_cat[s["category"]] += 1
        out.append({"sweet_id": s["id"], "score": round(float(score[i]), 4), **_reason(m, i, parts, liked, occasion)})
        if len(out) >= limit:
            break
    return out


def _reason(m: Model, i: int, parts: dict, liked: dict, occasion: str | None) -> dict:
    best = max(parts, key=lambda k: float(parts[k][i]))
    if float(parts[best][i]) <= 0:
        best = "popularity"
    if best == "taste" and liked:
        src = max(liked, key=lambda c: m.content[c, i])
        return {"reason": f"Because you loved {m.sweets[src]['name']}", "reason_kind": "taste"}
    if best == "taste":
        return {"reason": "Matches your taste", "reason_kind": "taste"}
    if best == "collab":
        if liked:
            src = max(liked, key=lambda c: m.collab[c, i])
            if m.collab[src, i] > 0:
                return {"reason": f"People who love {m.sweets[src]['name']} love this", "reason_kind": "collab"}
        return {"reason": "Customers like you loved this", "reason_kind": "collab"}
    if best == "new":
        return {"reason": "Naya hai!", "reason_kind": "new"}
    if best == "occasion":
        label = {"diwali": "Deepawali", "rakhi": "Raksha Bandhan", "guests": "guests", "office": "office gifting", "puja": "puja"}.get(occasion or "diwali", (occasion or "").title())
        return {"reason": f"Perfect for {label}", "reason_kind": "occasion"}
    return {"reason": "Bestseller", "reason_kind": "popular"}


def similar(m: Model, sweet_id: int, kind: str = "content", limit: int = 8) -> list[dict]:
    if not m.ready or sweet_id not in m.idx:
        return []
    i = m.idx[sweet_id]
    name = m.sweets[i]["name"]
    if kind == "together":
        mat, label, rk = m.together, f"Goes with {name}", "together"
    elif kind in ("also", "collab"):
        mat, label, rk = m.collab, "Customers also loved this", "collab"
    else:
        mat, label, rk = m.content, f"Like {name}", "similar"
    out = []
    for j in np.argsort(-mat[i]):
        if mat[i, j] <= 0 or not m.in_stock[j]:
            continue
        out.append({"sweet_id": m.sweets[j]["id"], "score": round(float(mat[i, j]), 4), "reason": label, "reason_kind": rk})
        if len(out) >= limit:
            break
    return out


def upsell(m: Model, user_id: str | None, cart: list[int], limit: int = 3) -> list[dict]:
    """Paaji's "ye bhi le lo": what completes this cart."""
    if not m.ready:
        return []
    rows = [m.idx[c] for c in cart if c in m.idx]
    row = m.user_rows.get(user_id) if user_id else None
    diet = row["diet"] if row else {}
    n = len(m.sweets)
    if rows:
        tog = m.together[rows].max(axis=0)
        col = m.collab[rows].max(axis=0)
        con = m.content[rows].max(axis=0)
        via = [rows[int(k)] for k in m.together[rows].argmax(axis=0)]
    else:
        tog = col = con = np.zeros(n, dtype=np.float32)
        via = [None] * n
    score = 0.40 * _minmax(tog) + 0.20 * _minmax(col) + 0.20 * _minmax(con) + 0.12 * m.new + 0.08 * m.pop
    cart_set = set(cart)
    cart_cats = {m.sweets[r]["category"] for r in rows}
    out, used_cats = [], set()
    for j in np.argsort(-score):
        s = m.sweets[j]
        if s["id"] in cart_set or not m.in_stock[j] or not passes_diet(s, diet):
            continue
        if s["category"] in used_cats and len(out) < limit - 1:
            continue                      # three different kinds of sweets, not three laddoos
        used_cats.add(s["category"])
        if tog[j] > 0 and via[j] is not None:
            reason, kind = f"Goes with {m.sweets[via[j]]['name']}", "together"
        elif m.new[j] and s["category"] not in cart_cats:
            reason, kind = "Naya hai!", "new"
        else:
            reason, kind = "Completes your thaali", "similar"
        out.append({"sweet_id": s["id"], "score": round(float(score[j]), 4), "reason": reason, "reason_kind": kind})
        if len(out) >= limit:
            break
    return out


def export_results(m: Model, top_similar: int = 12, top_user: int = 24) -> dict:
    sim = []
    for s in m.sweets:
        for kind, k in (("content", top_similar), ("collab", 10), ("together", 10)):
            for r in similar(m, s["id"], kind, k):
                sim.append({"sweet_id": s["id"], "similar_id": r["sweet_id"], "kind": kind, "score": r["score"]})
    recos = []
    for u in m.user_rows:
        for r in recommend(m, u, limit=top_user):
            recos.append({"user_id": u, "sweet_id": r["sweet_id"], "score": r["score"], "reason": r["reason"], "reason_kind": r["reason_kind"]})
    emb = []
    if m.embeddings is not None and m.embeddings.shape[1] == 384:
        emb = [{"sweet_id": s["id"], "embedding": "[" + ",".join(f"{x:.5f}" for x in m.embeddings[i]) + "]", "model": m.embedder}
               for i, s in enumerate(m.sweets)]
    return {"similar": sim, "user_recos": recos, "embeddings": emb}
