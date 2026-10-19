// Context engine: what fits *right now* — weather, time of day and day type.
// Weather comes from the free Open-Meteo API (no key). Location is asked only
// when the customer taps "use my location"; otherwise the shop's city is used.
// Never blocks the app: offline or refused → time/day rules still work.
// Judges can force a mode with ?demo=cold | hot | rainy (or Admin → Settings → Demo).
import { supabase } from './supabase.js';
import { local } from './state.js';
import { CONFIG, loadSettings, shopNow } from './feature-config.js';

const CITY_COORDS = {
  Muzaffarnagar: [29.4727, 77.7085], Meerut: [28.9845, 77.7064], Delhi: [28.6139, 77.209], Saharanpur: [29.968, 77.5552],
  Dehradun: [30.3165, 78.0322], Haridwar: [29.9457, 78.1642], Roorkee: [29.8543, 77.888], Shamli: [29.4502, 77.3172],
  Ghaziabad: [28.6692, 77.4538], Noida: [28.5355, 77.391], Lucknow: [26.8467, 80.9462], Kolkata: [22.5726, 88.3639],
  Mumbai: [19.076, 72.8777], Bengaluru: [12.9716, 77.5946], Jaipur: [26.9124, 75.7873], Chandigarh: [30.7333, 76.7794],
};
const KEY = 'ss:weather';
const PLACE_KEY = 'ss:place';           // { city } or { lat, lon, label }
let rules = null;
let festivals = null;
let ctxPromise = null;

export const demoMode = () => {
  const fromUrl = new URLSearchParams((location.hash.split('?')[1] || '')).get('demo') || new URLSearchParams(location.search).get('demo');
  if (fromUrl) local.set('ss:demo-context', ['cold', 'hot', 'rainy', 'humid', 'pleasant'].includes(fromUrl) ? fromUrl : null);
  return local.get('ss:demo-context') || CONFIG.demo?.context || null;
};

export const place = () => local.get(PLACE_KEY) || { city: CONFIG.shop.city };
export function setPlace(p) { local.set(PLACE_KEY, p); local.remove(KEY); ctxPromise = null; }

/** Ask the browser for location (only after the customer chose it). */
export function useMyLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPlace({ lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3), label: 'Aapki location' }); resolve(true); },
      () => resolve(false), { timeout: 8000, maximumAge: 30 * 60 * 1000 });
  });
}

async function fetchWeather() {
  const p = place();
  const [lat, lon] = p.lat != null ? [p.lat, p.lon] : CITY_COORDS[p.city] || [CONFIG.shop.lat, CONFIG.shop.lon];
  const cacheKey = `${lat},${lon}`;
  const cached = local.get(KEY);
  if (cached?.key === cacheKey && Date.now() - cached.at < (CONFIG.weather.cache_minutes || 60) * 60000) return cached.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=3&timezone=auto';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const data = await res.json();
    local.set(KEY, { key: cacheKey, at: Date.now(), data });
    // Share the shop city's forecast with the owner's demand prediction (server keeps it 3 h).
    if (supabase && (p.city || CONFIG.shop.city) === CONFIG.shop.city && p.lat == null) {
      supabase.rpc('save_weather', { p_city: CONFIG.shop.city, p_data: data }).then(() => {}, () => {});
    }
    return data;
  } catch {
    return cached?.data || null;       // offline: last known weather, or none
  } finally {
    clearTimeout(timer);
  }
}

function classify(data) {
  const c = data?.current;
  if (!c) return null;
  const w = CONFIG.weather;
  const t = Math.round(c.temperature_2m);
  const rainy = (c.precipitation || 0) >= w.rain_mm || [61, 63, 65, 80, 81, 82, 95, 96, 99, 51, 53, 55].includes(c.weather_code);
  const kind = rainy ? 'rainy' : t < w.cold_below ? 'cold' : t > w.hot_above ? 'hot' : (c.relative_humidity_2m || 0) > w.humid_above ? 'humid' : 'pleasant';
  return { kind, temp: t, humidity: c.relative_humidity_2m };
}

function timeOfDay(hour) {
  const tod = CONFIG.timeOfDay;
  for (const [k, [a, b]] of Object.entries(tod)) if (hour >= a && hour < b) return k;
  return 'late-night';
}

async function loadRules() {
  if (rules) return rules;
  if (!supabase) return (rules = []);
  const [{ data: r }, { data: f }] = await Promise.all([
    supabase.from('context_rules').select('*').eq('active', true).order('priority', { ascending: false }),
    supabase.from('festivals').select('id, slug, name, starts_on, emoji, greeting, lead_days').eq('active', true).order('starts_on'),
  ]);
  rules = r || [];
  festivals = f || [];
  return rules;
}

/** The full context. Cached per page load; refresh with { force: true }. */
export function getContext({ force = false } = {}) {
  if (ctxPromise && !force) return ctxPromise;
  ctxPromise = (async () => {
    await loadSettings().catch(() => null);
    const [data] = await Promise.all([fetchWeather(), loadRules().catch(() => [])]);
    const now = shopNow();
    const demo = demoMode();
    let weather = classify(data);
    const source = demo ? 'demo' : weather ? 'live' : 'offline';
    if (demo) weather = { kind: demo, temp: { cold: 11, hot: 39, rainy: 24, humid: 31, pleasant: 25 }[demo], demo: true };
    const today = festivals?.find((f) => f.starts_on === now.date);
    const tomorrow = festivals?.find((f) => (new Date(f.starts_on) - new Date(now.date)) / 86400000 === 1);
    const dayType = today ? 'festival' : tomorrow ? 'festival-eve' : [0, 6].includes(now.dow) ? 'weekend' : 'weekday';
    const tod = timeOfDay(now.hour);
    const p = place();
    const facts = { weather: weather?.kind, time: tod, day: dayType };
    const matchedRaw = (rules || []).filter((r) => {
      const [k, v] = r.condition.split('=');
      return facts[k] === v;
    });
    const reasonFor = (r) => {
      const [k] = r.condition.split('=');
      if (k === 'weather') return weather?.kind === 'rainy' ? 'Kyunki bahar baarish ho rahi hai' : `Kyunki bahar ${weather?.temp}°C hai`;
      if (k === 'time') return { morning: 'Subah ka time hai', afternoon: 'Dopahar ka time hai', evening: 'Shaam ki chai ka time', night: 'Raat ho gayi hai', 'late-night': 'Late-night craving' }[tod];
      if (k === 'day') return dayType === 'festival' ? `Aaj ${today?.name} hai` : dayType === 'festival-eve' ? `Kal ${tomorrow?.name} hai` : 'Weekend special';
      return '';
    };
    const matched = matchedRaw.map((r) => ({ ...r, reason: reasonFor(r) }));
    return {
      weather: weather?.kind || null, temp: weather?.temp ?? null, humidity: weather?.humidity ?? null, source,
      city: p.label || p.city || CONFIG.shop.city, timeOfDay: tod, dayType, festival: today || tomorrow || null,
      rules: matched,
      lead: matched.find((r) => r.condition.startsWith('weather')) || matched[0] || null,
    };
  })();
  ctxPromise.catch(() => { ctxPromise = null; });
  return ctxPromise;
}

/** Does a context rule cover this sweet? */
export function ruleMatches(sweet, rule) {
  if (!sweet || !rule) return false;
  return (rule.sweet_ids || []).includes(sweet.id)
    || (rule.categories || []).includes(sweet.category)
    || (rule.tags || []).some((t) => (sweet.tags || []).includes(t));
}

/** 0–1 context signal and the reason, for the recommendation score. */
export function contextFor(sweet, ctx) {
  let best = null;
  for (const r of ctx?.rules || []) if (ruleMatches(sweet, r) && (!best || Number(r.boost) > Number(best.boost))) best = r;
  return best ? { signal: Math.min(1, Number(best.boost)), reason: best.reason } : { signal: 0, reason: null };
}

/** Sweets that fit the lead rule, best first (for the home banner row). */
export function contextPicks(list, ctx, limit = 12) {
  if (!ctx?.lead) return [];
  const r = ctx.lead;
  return list
    .filter((s) => s.in_stock && ruleMatches(s, r))
    .sort((a, b) => ((r.sweet_ids || []).includes(b.id) - (r.sweet_ids || []).includes(a.id)) || b.popularity - a.popularity)
    .slice(0, limit);
}

export const WEATHER_ICON = { cold: '🧣', hot: '☀️', rainy: '🌧️', humid: '💧', pleasant: '🌤️' };
export const CITIES = () => CONFIG.cities;
