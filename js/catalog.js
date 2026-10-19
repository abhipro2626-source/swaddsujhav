// Catalog data: loaded once, cached in memory, searched and filtered locally.
import { supabase } from './supabase.js';

let catalogPromise = null;
let byId = new Map();
let bySlug = new Map();

const COLUMNS = `id, slug, name, name_hi, description, origin_story, region, country, category, base,
  ingredients, sweetness, richness, texture, tags, occasions, is_sugar_free, is_vegan, is_jain,
  is_eggless, is_gluten_free, allergens, price_unit, base_price, rating, rating_count, popularity,
  is_new, is_festive, in_stock, image_url, image_credit, created_at, product_type, shelf_life_days, aliases,
  shape, colours, served_temp, key_flavours, has_syrup, has_filling, is_fried, spice_level, taste_tags,
  variants:sweet_variants(id, weight_label, grams, price, stock_qty, sort_order)`;

/** All sweets (with variants). Cached; pass { force: true } to refetch (admin edits). */
export function loadCatalog({ force = false } = {}) {
  if (catalogPromise && !force) return catalogPromise;
  catalogPromise = (async () => {
    if (!supabase) throw new Error('Shop is not configured.');
    const { data, error } = await supabase.from('sweets').select(COLUMNS).order('popularity', { ascending: false });
    if (error) throw error;
    const list = (data || []).map(normalize);
    byId = new Map(list.map((s) => [s.id, s]));
    bySlug = new Map(list.map((s) => [s.slug, s]));
    window.__ssCatalog = list;   // read by the in-browser similarity fallback
    return list;
  })();
  catalogPromise.catch(() => { catalogPromise = null; });   // allow retry after a failure
  return catalogPromise;
}

function normalize(s) {
  s.variants = (s.variants || []).sort((a, b) => a.sort_order - b.sort_order);
  s.min_price = Math.min(...s.variants.map((v) => Number(v.price)), Number(s.base_price));
  s.search = fold([s.name, s.name_hi, s.region, s.country, s.category, s.base,
    ...(s.tags || []), ...(s.ingredients || []), ...(s.occasions || [])].join(' '));
  return s;
}

export const getById = (id) => byId.get(Number(id));
export const getBySlug = (slug) => bySlug.get(slug);
export const variantById = (sweet, id) => sweet?.variants.find((v) => v.id === Number(id));
export const isVariantAvailable = (v) => v && (v.stock_qty == null || v.stock_qty > 0);
export const firstAvailableVariant = (s) => s?.variants.find(isVariantAvailable) || null;

/** Lower-case, accent-free text for matching ("Crème" → "creme"). */
export function fold(text) {
  return String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Common spellings people type for the same sweet.
const ALIASES = {
  rosogolla: 'rasgulla', roshogolla: 'rasgulla', rasagola: 'rasgulla', rasgula: 'rasgulla',
  laddu: 'laddoo', ladoo: 'laddoo', ladu: 'laddoo', burfi: 'barfi', barfee: 'barfi',
  halva: 'halwa', jilebi: 'jalebi', jilapi: 'jalebi', gulabjamun: 'gulab jamun',
  kajukatli: 'kaju katli', kaju: 'kaju', soanpapdi: 'soan papdi', sohan: 'soan',
  mysorepak: 'mysore pak', modakam: 'modak', baklawa: 'baklava', knafeh: 'kunafa', kunafeh: 'kunafa',
  sugarfree: 'sugar free', diabetic: 'sugar free',
};

/** Score-based search over name, Hindi name, tags, ingredients and region. */
export function search(list, query) {
  const q = fold(query).trim();
  if (!q) return list;
  const terms = q.split(/\s+/).map((t) => ALIASES[t] || t);
  const joined = ALIASES[q.replace(/\s+/g, '')] || q;
  const scored = [];
  for (const s of list) {
    const name = fold(s.name);
    let score = 0;
    if (name === joined) score += 100;
    else if (name.startsWith(joined)) score += 60;
    else if (name.includes(joined)) score += 40;
    if (s.name_hi && s.name_hi.includes(query.trim())) score += 50;
    for (const t of terms) {
      if (t.length < 2) continue;
      if (name.includes(t)) score += 15;
      else if (s.search.includes(t)) score += 6;
      else if (t.length > 3 && fuzzyIncludes(name, t)) score += 4;
    }
    if (t_is_sugarfree(terms) && s.is_sugar_free) score += 30;
    if (score > 0) scored.push([score + Math.min(s.popularity, 500) / 100, s]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, s]) => s);
}

const t_is_sugarfree = (terms) => terms.join(' ').includes('sugar free');

// One typo allowed per word (Levenshtein ≤ 1 against any word in the name).
function fuzzyIncludes(name, term) {
  return name.split(/[^a-z0-9]+/).some((w) => Math.abs(w.length - term.length) <= 1 && lev1(w, term));
}
function lev1(a, b) {
  if (a === b) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

/** Apply catalog filters. Every filter is optional. */
export function filterSweets(list, f = {}) {
  return list.filter((s) => {
    if (f.category?.length && !f.category.includes(s.category)) return false;
    if (f.region?.length && !f.region.includes(s.region) && !f.region.includes(s.country)) return false;
    if (f.occasion && !(s.occasions || []).includes(f.occasion)) return false;
    if (f.sweetness?.length && !f.sweetness.includes(s.sweetness)) return false;
    if (f.minPrice != null && s.min_price < f.minPrice) return false;
    if (f.maxPrice != null && s.min_price > f.maxPrice) return false;
    if (f.inStock && !s.in_stock) return false;
    for (const d of f.diet || []) {
      if (d === 'sugar_free' && !s.is_sugar_free) return false;
      if (d === 'vegan' && !s.is_vegan) return false;
      if (d === 'jain' && !s.is_jain) return false;
      if (d === 'eggless' && !s.is_eggless) return false;
      if (d === 'gluten_free' && !s.is_gluten_free) return false;
    }
    if (f.flag === 'new' && !s.is_new) return false;
    if (f.flag === 'festive' && !s.is_festive) return false;
    if (f.flag === 'bestseller' && !(s.tags || []).includes('bestseller')) return false;
    if (f.flag === 'world' && s.country === 'India') return false;
    return true;
  });
}

export const SORTS = {
  popular: (a, b) => b.popularity - a.popularity,
  rating: (a, b) => b.rating - a.rating || b.rating_count - a.rating_count,
  'price-asc': (a, b) => a.min_price - b.min_price,
  'price-desc': (a, b) => b.min_price - a.min_price,
  new: (a, b) => (b.is_new - a.is_new) || (new Date(b.created_at) - new Date(a.created_at)),
  name: (a, b) => a.name.localeCompare(b.name),
};

export const CATEGORY_LABELS = {
  'milk-based': 'Milk-based', 'dry-fruit': 'Dry fruit', 'syrup-soaked': 'Syrup-soaked',
  fried: 'Fried', halwa: 'Halwa', laddoo: 'Laddoo', barfi: 'Barfi', bengali: 'Bengali',
  baked: 'Baked', world: 'World desserts', steamed: 'Steamed', brittle: 'Chikki & gajak', namkeen: '🥨 Namkeen',
};

// Region tiles for "Shop by Region" and the world map.
export const REGIONS = [
  { key: 'Bengal', label: 'Bengal', match: ['Bengal'], emoji: '🐟' },
  { key: 'Odisha', label: 'Odisha', match: ['Odisha'], emoji: '🛕' },
  { key: 'Punjab', label: 'Punjab', match: ['Punjab'], emoji: '🌾' },
  { key: 'UP', label: 'UP & Delhi', match: ['North India', 'Uttar Pradesh', 'Uttarakhand'], emoji: '🕌' },
  { key: 'Rajasthan', label: 'Rajasthan', match: ['Rajasthan', 'Madhya Pradesh'], emoji: '🏜️' },
  { key: 'Gujarat', label: 'Gujarat', match: ['Gujarat'], emoji: '🪁' },
  { key: 'Maharashtra', label: 'Maharashtra & Goa', match: ['Maharashtra', 'Goa'], emoji: '🐘' },
  { key: 'South', label: 'South India', match: ['South India', 'Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh'], emoji: '🌴' },
  { key: 'Hyderabad', label: 'Hyderabad & Awadh', match: ['Hyderabad', 'Awadh'], emoji: '🏰' },
  { key: 'East', label: 'Bihar & North-East', match: ['Bihar', 'Assam', 'Manipur'], emoji: '🍵' },
  { key: 'MiddleEast', label: 'Middle East & Turkey', match: ['Turkey', 'Middle East', 'Egypt', 'Iran', 'UAE', 'Afghanistan'], emoji: '🌙' },
  { key: 'Europe', label: 'Europe', match: ['France', 'Italy', 'Spain', 'Portugal', 'Greece', 'Austria', 'Germany', 'UK', 'Russia'], emoji: '🏰' },
  { key: 'EastAsia', label: 'East & South-East Asia', match: ['Japan', 'China', 'Hong Kong', 'Korea', 'Thailand', 'Philippines', 'Indonesia', 'Malaysia'], emoji: '🏮' },
  { key: 'Americas', label: 'Americas & more', match: ['USA', 'Mexico', 'Brazil', 'Argentina', 'Australia', 'South Africa', 'India', 'Sri Lanka', 'Nepal', 'Bangladesh'], emoji: '🌎' },
];

export const OCCASIONS = [
  { key: 'diwali', label: 'Deepawali', emoji: '🪔' },
  { key: 'wedding', label: 'Wedding', emoji: '💍' },
  { key: 'birthday', label: 'Birthday', emoji: '🎂' },
  { key: 'rakhi', label: 'Raksha Bandhan', emoji: '🧵' },
  { key: 'guests', label: 'Guests at home', emoji: '🏡' },
  { key: 'office', label: 'Office gifting', emoji: '💼' },
  { key: 'puja', label: 'Puja & Prasad', emoji: '🙏' },
];

export function sweetsInRegion(list, regionKey) {
  const r = REGIONS.find((x) => x.key === regionKey);
  if (!r) return [];
  // "Americas & more" should not swallow Indian regional sweets.
  return list.filter((s) => (regionKey === 'Americas'
    ? s.country !== 'India' && r.match.includes(s.country)
    : r.match.includes(s.region)));
}

/** The same sweet all day for everyone, changing at midnight IST. */
export function mithaiOfTheDay(list) {
  const pool = list.filter((s) => s.in_stock && s.image_url);
  if (!pool.length) return null;
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const day = Math.floor(ist.getTime() / 86400000);
  return pool[(day * 2654435761) % pool.length];
}

/** Milliseconds until the next midnight in IST. */
export function msUntilNextMithai() {
  const ist = Date.now() + 5.5 * 3600 * 1000;
  return 86400000 - (ist % 86400000);
}

/** Shayari for a sweet: its own, else its category's, else a general purchase line. */
export async function shayariFor(sweet, occasion = 'purchase') {
  if (!supabase) return null;
  const pick = (rows) => (rows?.length ? rows[Math.floor(Math.random() * rows.length)] : null);
  if (sweet && occasion === 'purchase') {
    const own = await supabase.from('shayari').select('*').eq('sweet_id', sweet.id);
    if (own.data?.length) return pick(own.data);
    const cat = await supabase.from('shayari').select('*').is('sweet_id', null).eq('category', sweet.category);
    if (cat.data?.length) return pick(cat.data);
  }
  const gen = await supabase.from('shayari').select('*').is('sweet_id', null).is('category', null).eq('occasion', occasion);
  return pick(gen.data);
}
