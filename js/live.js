// Live shop data that changes during the day: last-hour deals, "Aaj ka Taaza"
// fresh batches and garam hot batches. Kept current with Supabase Realtime so
// every open phone sees a new batch or the shrinking "kitna bacha" instantly.
// Emits `ss:live` ({ kind }) whenever something changes.
import { supabase } from './supabase.js';
import { CONFIG, loadSettings } from './feature-config.js';

const state = {
  deals: new Map(),        // sweet_id → { percent, kg_left, ends_at, kind, phase }
  clock: null,             // { phase: live|soon|closed, close_at, window_start, … }
  fresh: new Map(),        // sweet_id → { made_at, best_before, quantity_kg }
  hot: [],                 // recent hot batches (newest first)
};
let started = false;
let channel = null;
let refreshTimer = 0;

const emit = (kind) => document.dispatchEvent(new CustomEvent('ss:live', { detail: { kind } }));

export async function refreshDeals() {
  if (!supabase) return;
  const [d, c] = await Promise.all([supabase.rpc('current_deals'), supabase.rpc('deal_clock')]);
  if (c.data) state.clock = c.data;
  state.deals = new Map((d.data || []).map((x) => [Number(x.sweet_id), { ...x, kg_left: x.kg_left == null ? null : Number(x.kg_left) }]));
  emit('deals');
}

export async function refreshFresh() {
  if (!supabase) return;
  const { data } = await supabase.rpc('fresh_today');
  state.fresh = new Map((data || []).map((x) => [Number(x.sweet_id), x]));
  emit('fresh');
}

export async function refreshHot() {
  if (!supabase) return;
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data } = await supabase.from('hot_batches').select('*').gte('ready_at', since).order('ready_at', { ascending: false }).limit(5);
  state.hot = data || [];
  emit('hot');
}

/** Start once at boot. Safe to call again. */
export async function startLive() {
  if (started || !supabase) return;
  started = true;
  await loadSettings().catch(() => null);
  await Promise.all([refreshDeals(), refreshFresh(), refreshHot()]).catch((e) => console.debug('[live]', e));
  channel = supabase.channel('shop-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, () => { refreshFresh(); refreshDeals(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => refreshDeals())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sweet_variants' }, () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshDeals, 800);       // stock changed → kg left on deals
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hot_batches' }, (p) => {
      state.hot = [p.new, ...state.hot.filter((h) => h.id !== p.new.id)].slice(0, 5);
      emit('hot');
      document.dispatchEvent(new CustomEvent('ss:hot-batch', { detail: p.new }));
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hot_batches' }, (p) => {
      state.hot = state.hot.map((h) => (h.id === p.new.id ? p.new : h));
      emit('hot');
    })
    .subscribe();
  // The deal discount grows as closing approaches; re-check every minute.
  setInterval(refreshDeals, 60 * 1000);
  setInterval(() => emit('tick'), 30 * 1000);       // relative times ("2 ghante pehle")
}

export const dealFor = (id) => {
  const d = state.deals.get(Number(id));
  return d && d.phase === 'live' ? d : null;
};
export const upcomingDeals = () => [...state.deals.values()].filter((d) => d.phase === 'soon');
export const liveDeals = () => [...state.deals.values()].filter((d) => d.phase === 'live');
export const dealClock = () => state.clock;
export const freshFor = (id) => state.fresh.get(Number(id)) || null;
export const freshList = () => [...state.fresh.values()].sort((a, b) => new Date(b.made_at) - new Date(a.made_at));
export const hotBatches = () => state.hot;

/** 0–1 freshness for the recommendation score (1 = just made, 0 = older than the window). */
export function freshnessSignal(id) {
  const f = freshFor(id);
  if (!f) return 0;
  const hours = (Date.now() - new Date(f.made_at).getTime()) / 3600000;
  return Math.max(0, 1 - hours / (CONFIG.freshness.fresh_hours || 24));
}
export const dealSignal = (id) => Math.min(1, (dealFor(id)?.percent || 0) / (CONFIG.deals.max_percent || 30));

/** Price after a live deal (display only — the database prices the order). */
export function dealPrice(id, price) {
  const d = dealFor(id);
  return d ? Number(price) - Math.round((Number(price) * d.percent) / 100) : Number(price);
}
