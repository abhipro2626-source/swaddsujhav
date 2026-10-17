// Budget Mode: "I have ₹500 for 10 guests" → Paaji builds the best mix.
// Transparent greedy planner: enough pieces per guest, variety, diet rules, within budget.
import { html, raw, rupees, sweetImage, toast, $ } from '../ui.js';
import { sweetName } from '../i18n.js';
import { loadCatalog, isVariantAvailable, OCCASIONS } from '../catalog.js';
import { add } from '../cart.js';
import { forUser } from '../recommend.js';
import { mixSave } from '../deals.js';
import { openCart } from '../cartDrawer.js';
import { store } from '../state.js';

// Approximate pieces per pack (≈20 g per piece for weighed sweets).
const PIECES = { '1 pc': 1, 'box of 6': 6, 'box of 12': 12, '250g': 12, '500g': 24, '1kg': 48 };
const say = (text, mood = 'talk') => document.dispatchEvent(new CustomEvent('ss:say', { detail: { text, mood, group: 'budget' } }));

/** Cheapest way to get at least `need` pieces of one sweet: [{variant, qty}], cost, pieces. */
export function cheapestPack(sweet, need) {
  const vs = sweet.variants.filter((v) => isVariantAvailable(v) && PIECES[v.weight_label]);
  if (!vs.length) return null;
  let best = null;
  // Try each variant alone, and the biggest variant topped up with the smallest.
  const options = [];
  for (const v of vs) {
    const qty = Math.max(1, Math.ceil(need / PIECES[v.weight_label]));
    if (v.stock_qty != null && qty > v.stock_qty) continue;
    options.push([{ variant: v, qty }]);
  }
  const big = [...vs].sort((a, b) => PIECES[b.weight_label] - PIECES[a.weight_label])[0];
  const small = [...vs].sort((a, b) => PIECES[a.weight_label] - PIECES[b.weight_label])[0];
  const bigQty = Math.floor(need / PIECES[big.weight_label]);
  if (bigQty > 0 && big !== small) {
    const rest = need - bigQty * PIECES[big.weight_label];
    const combo = [{ variant: big, qty: bigQty }];
    if (rest > 0) combo.push({ variant: small, qty: Math.ceil(rest / PIECES[small.weight_label]) });
    options.push(combo);
  }
  for (const o of options) {
    const cost = o.reduce((n, x) => n + Number(x.variant.price) * x.qty, 0);
    const pieces = o.reduce((n, x) => n + PIECES[x.variant.weight_label] * x.qty, 0);
    if (!best || cost < best.cost || (cost === best.cost && pieces > best.pieces)) best = { packs: o, cost, pieces };
  }
  return best;
}

export function plan(candidates, budget, guests) {
  const kinds = Math.max(3, Math.min(6, Math.round(guests / 4) + 2));
  const perCost = (s) => cheapestPack(s, 12)?.cost / 12 || Infinity;
  const build = (chosen, target) => {
    const share = Math.ceil(Math.ceil(guests * target) / chosen.length);
    const lines = chosen.map((s) => ({ sweet: s, ...cheapestPack(s, share) })).filter((l) => l.packs);
    return { lines, cost: lines.reduce((n, l) => n + l.cost, 0), pieces: lines.reduce((n, l) => n + l.pieces, 0), piecesPerGuest: target };
  };
  // Aim for 2 good pieces per guest first; if the budget is tight, try fewer kinds
  // (fewer packs) before fewer pieces. Only then give more pieces with the SAME picks.
  for (const target of [2, 1.5, 1]) {
    for (let k = kinds; k >= 2; k--) {
      // Diverse picks: walk the ranked list, max 2 per category.
      const chosen = [];
      const perCat = {};
      for (const s of candidates) {
        if ((perCat[s.category] || 0) >= 2) continue;
        perCat[s.category] = (perCat[s.category] || 0) + 1;
        chosen.push(s);
        if (chosen.length >= k) break;
      }
      if (!chosen.length) return null;
      const share = Math.ceil(Math.ceil(guests * target) / chosen.length);
      const packCost = (s) => cheapestPack(s, share)?.cost ?? Infinity;
      // Swap the most expensive pick for the cheapest alternative until it fits.
      const pool = candidates.filter((s) => !chosen.includes(s)).sort((a, b) => packCost(a) - packCost(b) || perCost(a) - perCost(b));
      for (let guard = 0; guard < 30; guard++) {
        const p = build(chosen, target);
        if (p.cost <= budget) {
          for (const more of [3, 2.5]) {
            if (more <= target) continue;
            const bigger = build(chosen, more);
            if (bigger.cost <= budget) return bigger;
          }
          return p;
        }
        const priciest = chosen.reduce((a, b) => (packCost(a) > packCost(b) ? a : b));
        const cheaper = pool.find((s) => packCost(s) < packCost(priciest));
        if (!cheaper) break;
        chosen[chosen.indexOf(priciest)] = cheaper;
        pool.splice(pool.indexOf(cheaper), 1);
      }
    }
  }
  return null;
}

export async function renderBudget(view, params) {
  const diet = store.get('profile')?.taste_profile?.diet || {};
  view.innerHTML = html`
  <div class="page page--budget container page--narrow">
    <h1 class="page-title">💰 Budget Mode</h1>
    <p class="muted">Tell Paaji your budget and guest count — he'll build the tastiest mix that fits.</p>
    <form class="panel budget-form" id="budget-form">
      <div class="form-grid">
        <label class="field"><span>Budget (₹)</span><input name="budget" type="number" min="100" max="50000" step="50" value="500" required inputmode="numeric"></label>
        <label class="field"><span>Guests</span><input name="guests" type="number" min="1" max="200" value="10" required inputmode="numeric"></label>
        <label class="field field--wide"><span>Occasion</span>
          <select name="occasion"><option value="">Any</option>${OCCASIONS.map((o) => html`<option value="${o.key}">${o.emoji} ${o.label}</option>`)}</select></label>
      </div>
      <div class="chips budget-diet" role="group" aria-label="Diet">
        ${[['sugar_free', '🩺 Sugar-free'], ['jain', '🙏 Jain'], ['vegan', '🌱 Vegan'], ['gluten_free', '🌾 Gluten-free']].map(([k, l]) => html`
          <label class="chip chip--toggle ${diet[k] ? 'is-on' : ''}"><input type="checkbox" name="diet" value="${k}" ${diet[k] ? 'checked' : ''} class="sr-only">${l}</label>`)}
      </div>
      <button type="submit" class="btn btn--gold btn--lg btn--block">🧔🏽 Paaji, mix banao!</button>
    </form>
    <div id="budget-result" aria-live="polite"></div>
  </div>`;

  view.addEventListener('change', (e) => {
    if (e.target.name === 'diet') e.target.closest('.chip').classList.toggle('is-on', e.target.checked);
  });

  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const budget = Math.max(100, Number(f.budget.value) || 0);
    const guests = Math.max(1, Number(f.guests.value) || 1);
    const occasion = f.occasion.value || null;
    const diets = [...f.querySelectorAll('[name=diet]:checked')].map((x) => x.value);
    const out = $('#budget-result', view);
    out.innerHTML = html`<p class="muted">Paaji hisaab laga rahe hain…</p>`;
    say(`${rupees(budget)} vich ${guests} mehmaan? Chalo ji, dekhde haan!`, 'think');

    const all = await loadCatalog();
    let ranked = [];
    try { ranked = (await forUser({ limit: 40, occasion })).items; } catch { /* popularity fallback below */ }
    const seen = new Set(ranked.map((s) => s.id));
    const rest = all.filter((s) => !seen.has(s.id)).sort((a, b) => b.popularity - a.popularity);
    // Only sweets you can hand out as pieces (no halwa, kheer, rabri, doi…).
    const pieceable = (s) => !['halwa'].includes(s.category) && !/halwa|kheer|payasam|pradhaman|doi|rabri|basundi|shrikhand|amrakhand|phirni|seviyan|khurma|kulfi|gelato|bingsu|halo|panna|brulee|flan|pudding|tiramisu|cheesecake|pongal|kesari|sheera|dulce|umm ali|qubani/i.test(s.name);
    const candidates = [...ranked, ...rest].filter((s) => s.in_stock && pieceable(s)
      && (!occasion || (s.occasions || []).includes(occasion) || ranked.includes(s))
      && diets.every((d) => s[`is_${d}`])
      && s.variants.some((v) => PIECES[v.weight_label] && isVariantAvailable(v)));

    const p = plan(candidates, budget, guests);
    if (!p) {
      out.innerHTML = html`<div class="panel"><p>Is budget vich ${guests} mehmaanan layi thoda mushkil hai ji. Try a bigger budget or fewer guests — even ₹${Math.ceil(guests * 25 / 50) * 50} works for about 1 piece each.</p></div>`;
      say('Budget thoda tight hai ji, par thoda vadha lo te main kamaal kar dunga!', 'think');
      return;
    }
    const deal = mixSave(p.lines.length);
    const discount = Math.round((p.cost * deal.percent) / 100);
    out.innerHTML = html`
      <section class="panel budget-plan">
        <header class="panel__head"><h2>Paaji's mix for ${guests} guests</h2><span class="chip chip--gold">${p.piecesPerGuest} pcs / guest</span></header>
        <ul class="summary-lines">
          ${p.lines.map((l) => html`<li>${sweetImage(l.sweet, { size: 'thumb' })}
            <span class="summary-lines__name">${sweetName(l.sweet)}
              <small class="muted">${l.packs.map((x) => `${x.qty} × ${x.variant.weight_label}`).join(' + ')} · ~${l.pieces} pcs</small></span>
            <strong>${rupees(l.cost)}</strong></li>`)}
        </ul>
        <div class="summary-row"><span>~${p.pieces} pieces · ${p.lines.length} kinds</span><span>${rupees(p.cost)}</span></div>
        ${discount ? html`<div class="summary-row summary-row--save"><span>🍬 Mix & Save ${deal.percent}%</span><span>−${rupees(discount)}</span></div>` : ''}
        <div class="summary-row summary-row--total"><span>You pay</span><strong>${rupees(p.cost - discount)}</strong></div>
        <p class="muted small">Under budget by ${rupees(budget - (p.cost - discount))}. Piece counts are approximate (about 20 g per piece).</p>
        <button type="button" class="btn btn--gold btn--lg btn--block" data-add-plan>Add all to thaali</button>
      </section>`;
    say(`Ho gaya ji! ${p.lines.length} kisam di mithai, har mehmaan nu ${p.piecesPerGuest} piece, te ${rupees(budget - (p.cost - discount))} bach vi gaye!`, 'celebrate');

    out.querySelector('[data-add-plan]').addEventListener('click', () => {
      let n = 0;
      for (const l of p.lines) for (const x of l.packs) if (add(l.sweet, x.variant, x.qty, { silent: true })) n++;
      if (n) { toast('Paaji ka mix thaali mein!', 'success'); openCart(); }
    });
  });

  // Arrived from Ask Paaji ("Rs 500 mein 10 mehmaan")? Fill in and build the mix right away.
  const p = params instanceof URLSearchParams ? params : null;
  if (p?.get('budget') && p?.get('guests')) {
    const f = view.querySelector('#budget-form');
    f.budget.value = p.get('budget');
    f.guests.value = p.get('guests');
    for (const d of (p.get('diet') || '').split(',').filter(Boolean)) {
      const box = f.querySelector(`[name=diet][value="${d}"]`);
      if (box) { box.checked = true; box.closest('.chip')?.classList.add('is-on'); }
    }
    f.requestSubmit();
  }
  return raw('');
}
