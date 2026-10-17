// Tiny app-wide store with subscriptions. Keep it boring and predictable.
//   import { store } from './state.js';
//   store.set({ user });  store.on('user', (user) => …);

const listeners = new Map();   // key → Set<fn>
const state = {
  session: null,     // Supabase session
  user: null,        // auth user
  profile: null,     // public.profiles row
  cart: [],          // [{ sweet_id, variant_id, quantity }]
  boxes: [],         // custom gift boxes [{ id, size, ribbon, message, items }]
  lang: 'en',        // 'en' | 'hi'
  theme: 'day',      // 'day' | 'night'
  muted: false,
};

export const store = {
  get(key) { return key ? state[key] : { ...state }; },

  set(patch) {
    const changed = [];
    for (const [k, v] of Object.entries(patch)) {
      if (state[k] !== v) { state[k] = v; changed.push(k); }
    }
    for (const k of changed) listeners.get(k)?.forEach((fn) => safe(fn, state[k]));
    if (changed.length) listeners.get('*')?.forEach((fn) => safe(fn, state, changed));
  },

  /** Subscribe to a key (or '*'). Returns an unsubscribe function. */
  on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key)?.delete(fn);
  },
};

function safe(fn, ...args) {
  try { fn(...args); } catch (err) { console.error('[store listener]', err); }
}

/** localStorage that never throws (private mode, blocked storage, previews). */
export const local = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};
