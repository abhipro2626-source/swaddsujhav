// Recommendations. Tries the Python ML service first (backend/app.py), then the
// precomputed ML tables, then the Supabase SQL functions. Every result carries a
// human-readable reason.
import { supabase } from './supabase.js';
import { API_BASE } from './config.js';
import { store } from './state.js';
import { getById, loadCatalog } from './catalog.js';
import { sweetIdsInCart } from './cart.js';

// Weights are explained in README → "How recommendations work".
export const WEIGHTS = { taste: 0.40, together: 0.25, popularity: 0.15, new: 0.10, occasion: 0.10 };

let apiDown = false;          // remember for the session once the ML API is unreachable
const cache = new Map();      // short-lived memo for detail rows

async function api(path, params = {}) {
  if (apiDown || API_BASE === null) return null;   // static hosting without the Python server
  const url = new URL(`${API_BASE}/api/${path}`, location.origin);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, Array.isArray(v) ? v.join(',') : v);
  const headers = {};
  const token = store.get('session')?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) throw new Error(String(res.status));
    return await res.json();
  } catch {
    apiDown = true;
    return null;
  }
}

/** Convert [{sweet_id, reason, reason_kind}] → { items: sweets[], reasons: Map } */
function hydrate(rows, limit) {
  const items = [];
  const reasons = new Map();
  for (const r of rows || []) {
    const s = getById(r.sweet_id);
    if (!s || !s.in_stock || reasons.has(s.id)) continue;
    items.push(s);
    reasons.set(s.id, { text: r.reason, kind: r.reason_kind || r.kind || 'taste' });
    if (items.length >= limit) break;
  }
  return { items, reasons };
}

/** "Paaji's Sujhav for You" (works for guests too). */
export async function forUser({ limit = 12, occasion = null, mood = null } = {}) {
  await loadCatalog();
  const exclude = sweetIdsInCart();
  const ml = await api('recommend', { limit, occasion, mood, exclude });
  if (ml?.items?.length) return hydrate(ml.items, limit);

  // Precomputed ML picks (written by the Python job) for signed-in users.
  if (store.get('user') && !occasion && !mood) {
    const { data } = await supabase.from('user_recos').select('sweet_id, reason, reason_kind').order('score', { ascending: false }).limit(limit * 2);
    const fresh = (data || []).filter((r) => !exclude.includes(r.sweet_id));
    if (fresh.length >= Math.min(6, limit)) return hydrate(fresh, limit);
  }
  const { data, error } = await supabase.rpc('recommend_for_user', { p_limit: limit, p_occasion: occasion, p_exclude: exclude });
  if (error) throw error;
  return hydrate(data, limit);
}

/** Cart upsell: "Paaji kehte hain: ye bhi le lo!" */
export async function upsell(limit = 3) {
  await loadCatalog();
  const cart = sweetIdsInCart();
  const ml = await api('upsell', { limit, cart });
  if (ml?.items?.length) return hydrate(ml.items, limit);
  const { data, error } = await supabase.rpc('upsell_for_cart', { p_limit: limit, p_cart: store.get('user') ? null : cart });
  if (error) throw error;
  return hydrate(data, limit);
}

/** Similar dishes for the overview modal. kind: content | together | also */
export async function related(sweet, kind, limit = 8) {
  const key = `${kind}:${sweet.id}:${limit}`;
  if (cache.has(key)) return cache.get(key);
  await loadCatalog();
  let rows = [];
  const ml = await api('similar', { sweet_id: sweet.id, kind, limit });
  if (ml?.items?.length) rows = ml.items;
  else {
    const mlKind = kind === 'also' ? 'collab' : kind;
    const { data } = await supabase.from('sweet_similar').select('similar_id, score').eq('sweet_id', sweet.id).eq('kind', mlKind)
      .order('score', { ascending: false }).limit(limit);
    if (data?.length) rows = data.map((r) => ({ sweet_id: r.similar_id, reason: reasonFor(kind, sweet), reason_kind: kindIcon(kind) }));
    else if (kind === 'together') {
      const { data: d } = await supabase.rpc('bought_together', { p_sweet_id: sweet.id, p_limit: limit });
      rows = (d || []).map((r) => ({ sweet_id: r.sweet_id, reason: r.reason, reason_kind: 'together' }));
    } else if (kind === 'also') {
      const { data: d } = await supabase.rpc('customers_also_bought', { p_sweet_id: sweet.id, p_limit: limit });
      rows = (d || []).map((r) => ({ sweet_id: r.sweet_id, reason: r.reason, reason_kind: 'collab' }));
    }
    if (kind === 'content' && !rows.length) rows = contentFallback(sweet, limit);
  }
  const out = hydrate(rows.filter((r) => r.sweet_id !== sweet.id), limit);
  cache.set(key, out);
  return out;
}

const kindIcon = (k) => ({ content: 'similar', together: 'together', also: 'collab' }[k] || 'similar');
const reasonFor = (k, s) => ({ content: `Like ${s.name}`, together: `Goes with ${s.name}`, also: 'Customers also loved this' }[k]);

/** Attribute similarity in the browser, used until the ML model has run. */
export function contentFallback(sweet, limit = 8) {
  const all = [...(window.__ssCatalog || [])];
  const ing = new Set(sweet.ingredients || []);
  const scored = all.filter((s) => s.id !== sweet.id && s.in_stock).map((s) => {
    let score = 0;
    if (s.category === sweet.category) score += 3;
    if (s.base === sweet.base) score += 2.5;
    if (s.region === sweet.region) score += 1.5;
    if (s.texture === sweet.texture) score += 1;
    score += 1 - Math.abs(s.sweetness - sweet.sweetness) / 4;
    score += (s.ingredients || []).filter((x) => ing.has(x)).length * 0.6;
    if (s.is_sugar_free === sweet.is_sugar_free) score += 0.5;
    return [score, s];
  }).sort((a, b) => b[0] - a[0]).slice(0, limit);
  return scored.map(([, s]) => ({ sweet_id: s.id, reason: `Like ${sweet.name}`, reason_kind: 'similar' }));
}

/** A pick for Paaji's "ye bhi le jao" line after something is added. */
export async function pickAfterAdd(sweet) {
  const exclude = new Set([...sweetIdsInCart(), sweet.id]);
  const [tog, sim] = await Promise.all([related(sweet, 'together', 6), related(sweet, 'content', 8)]);
  const candidates = [...tog.items, ...sim.items].filter((s) => !exclude.has(s.id));
  const diet = store.get('profile')?.taste_profile?.diet || {};
  const ok = candidates.filter((s) => !diet.sugar_free || s.is_sugar_free);
  const fresh = ok.find((s) => s.is_new);
  if (fresh) return { sweet: fresh, kind: 'new' };
  const pair = ok.find((s) => tog.items.includes(s));
  if (pair) return { sweet: pair, kind: 'together' };
  return ok[0] ? { sweet: ok[0], kind: 'similar' } : null;
}
