// "Ek cheez lene aaya, teen le gaya": Mix & Save tiers, free taste, honest social proof.
// Rules come from the database (mix_save_rules) so the server and UI always agree;
// the server applies the actual discount in place_order.
import { supabase } from './supabase.js';

let rules = { tiers: [{ distinct: 3, percent: 5 }, { distinct: 5, percent: 10 }], gift_box_threshold: 999, free_sample_min_distinct: 3 };
let counts = new Map();
let loaded = null;

export function loadDeals() {
  if (loaded) return loaded;
  loaded = (async () => {
    if (!supabase) return;
    const [r, c] = await Promise.all([
      supabase.rpc('mix_save_rules'),
      supabase.rpc('sweet_order_counts', { p_days: 30 }),
    ]);
    if (r.data) rules = r.data;
    if (c.data) counts = new Map(c.data.map((x) => [x.sweet_id, Number(x.orders)]));
  })().catch((err) => console.debug('[deals]', err));
  return loaded;
}

export const getRules = () => rules;

/** Current Mix & Save state for N different sweets. */
export function mixSave(distinct) {
  const tiers = [...rules.tiers].sort((a, b) => a.distinct - b.distinct);
  const current = tiers.filter((t) => distinct >= t.distinct).pop() || null;
  const next = tiers.find((t) => distinct < t.distinct) || null;
  return {
    percent: current?.percent || 0,
    next: next ? { needed: next.distinct - distinct, percent: next.percent, at: next.distinct } : null,
    max: tiers[tiers.length - 1],
  };
}

export const discountFor = (subtotal, distinct) => Math.round((subtotal * mixSave(distinct).percent) / 100);
export const qualifiesForSample = (distinct) => distinct >= (rules.free_sample_min_distinct || 3);

/** Real orders in the last 30 days that included this sweet (shown only when meaningful). */
export const ordersThisMonth = (sweetId) => counts.get(Number(sweetId)) || 0;
