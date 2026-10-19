// Feature Pack 2 — every number and rule in one place.
// These are the defaults; the owner edits the live values in Admin → Settings
// (table app_settings). loadSettings() merges the database values over these.
// Prices, discounts and prizes are always calculated again in Postgres.
import { supabase } from './supabase.js';

export const CONFIG = {
  shop: { name: 'Swaad Sujhaav', city: 'Muzaffarnagar', lat: 29.4727, lon: 77.7085, timezone: 'Asia/Kolkata', open: '09:00', close: '22:00' },
  deals: { window_minutes: 90, preview_minutes: 30, steps: [10, 20, 30], max_percent: 30, min_stock_kg: 1, max_shelf_days: 2 },
  scratch: { start: '2026-10-10', end: '2026-11-20', daily_budget: 3000, coupon_days: 30 },
  freshness: { fresh_hours: 24 },
  // score = Σ weight × signal (signals are 0–1). The same weights live in app_settings.reco_weights.
  reco_weights: { taste: 0.35, together: 0.20, popularity: 0.10, new: 0.10, occasion: 0.08, freshness: 0.07, context: 0.06, deal: 0.04 },
  alerts: { max_per_day: 3, reserve_max_grams: 500, reserve_minutes: 30 },
  prediction: { safety_buffer_kg: 0.5, history_weeks: 8 },
  combos: { jodi_discount_percent: 8 },
  preorder: { default_cutoff_hours: 12 },
  demo: { context: null, deal_window: false },
  // Weather thresholds for the context engine (°C, mm of rain, % humidity).
  weather: { cold_below: 18, hot_above: 32, rain_mm: 1, humid_above: 80, cache_minutes: 60 },
  // Hours (24h, shop time) for time-of-day suggestions.
  timeOfDay: { morning: [6, 11], afternoon: [11, 16], evening: [16, 20], night: [20, 24] },
  // Gift planner box sizes and how many people each serves.
  giftSizes: [
    { label: '4 pc', pieces: 4, serves: 2 }, { label: '9 pc', pieces: 9, serves: 4 }, { label: '16 pc', pieces: 16, serves: 7 },
    { label: '250g', grams: 250, serves: 2 }, { label: '500g', grams: 500, serves: 4 }, { label: '1kg', grams: 1000, serves: 8 },
  ],
  importanceWeight: { very: 1.6, normal: 1, token: 0.55 },
  cities: ['Muzaffarnagar', 'Meerut', 'Delhi', 'Saharanpur', 'Dehradun', 'Haridwar', 'Roorkee', 'Shamli', 'Ghaziabad', 'Noida', 'Lucknow', 'Kolkata', 'Mumbai', 'Bengaluru', 'Jaipur', 'Chandigarh'],
};

let loaded = null;

/** Merge the owner's live settings over the defaults (cached for the session). */
export function loadSettings({ force = false } = {}) {
  if (loaded && !force) return loaded;
  loaded = (async () => {
    if (!supabase) return CONFIG;
    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) { console.debug('[settings]', error.message); return CONFIG; }
    for (const row of data || []) {
      if (row.value && typeof row.value === 'object' && !Array.isArray(row.value)) CONFIG[row.key] = { ...(CONFIG[row.key] || {}), ...row.value };
      else CONFIG[row.key] = row.value;
    }
    return CONFIG;
  })();
  loaded.catch(() => { loaded = null; });
  return loaded;
}

/** "Now" in the shop's time zone as { date: 'YYYY-MM-DD', hour, minute, dow }. */
export function shopNow(at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.shop.timezone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(at).map((p) => [p.type, p.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute), dow };
}

/** Relative time in friendly Hinglish: "2 ghante pehle", "abhi abhi". */
export function agoText(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return 'abhi abhi';
  if (mins < 60) return `${mins} minute pehle`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} ghante pehle` : `${Math.round(h / 24)} din pehle`;
}

/** "12:05" style countdown from milliseconds. */
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}
