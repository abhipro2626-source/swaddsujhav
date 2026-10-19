// Mithai + Namkeen pairing: asks Postgres (suggest_combos) which namkeen goes
// best with what's in the thaali — owner rules + bought-together + spice taste.
import { html, sweetImage, rupees } from './ui.js';
import { supabase } from './supabase.js';
import { loadCatalog, getById, firstAvailableVariant } from './catalog.js';
import { sweetName } from './i18n.js';

const memo = new Map();

/** [{ sweet, reason, score }] best first. */
export async function comboPicks(sweetIds, limit = 3) {
  const ids = [...new Set((sweetIds || []).map(Number))].filter((id) => getById(id)?.product_type !== 'namkeen');
  if (!ids.length || !supabase) return [];
  const key = `${ids.sort().join(',')}:${limit}`;
  if (memo.has(key)) return memo.get(key);
  const p = (async () => {
    await loadCatalog();
    const { data, error } = await supabase.rpc('suggest_combos', { p_sweet_ids: ids, p_limit: limit });
    if (error) return [];
    return (data || []).map((r) => ({ sweet: getById(r.namkeen_id), reason: r.reason, score: Number(r.score) }))
      .filter((r) => r.sweet && r.sweet.in_stock && firstAvailableVariant(r.sweet));
  })();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
}

/** Compact one-tap combo card(s). */
export function comboHTML(picks) {
  return html`<div class="combo-row">${picks.map(({ sweet, reason }) => {
    const v = firstAvailableVariant(sweet);
    return html`<div class="combo-pick">
      <a href="#/sweet/${sweet.slug}" data-open="${sweet.slug}" tabindex="-1">${sweetImage(sweet, { size: 'thumb' })}</a>
      <div><p class="combo-pick__name">${sweetName(sweet)} <span class="muted small">· ${rupees(v.price)} / ${v.weight_label}</span></p>
        <p class="combo-pick__why">🥨 ${reason}</p></div>
      <button type="button" class="btn btn--gold btn--sm" data-add="${sweet.id}" data-variant="${v.id}" data-combo="1"
        aria-label="Add ${sweet.name} ${v.weight_label}">+ Add</button>
    </div>`;
  })}</div>`;
}
