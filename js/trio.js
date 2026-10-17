// "Make it a Trio" — after an add, a slim bar slides up with two perfect partners
// and one tap to add both (and unlock Mix & Save). Non-blocking, easy to dismiss.
import { html, sweetImage, rupees, $ } from './ui.js';
import { sweetName } from './i18n.js';
import { related } from './recommend.js';
import { add, sweetIdsInCart } from './cart.js';
import { firstAvailableVariant } from './catalog.js';
import { mixSave } from './deals.js';
import { store } from './state.js';

let bar = null;
let hideTimer = 0;
let dismissedAt = 0;

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('aside');
  bar.className = 'trio-bar';
  bar.setAttribute('aria-label', 'Make it a trio');
  bar.hidden = true;
  document.body.appendChild(bar);
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-trio-close]')) { dismissedAt = Date.now(); hide(); return; }
    const all = e.target.closest('[data-trio-all]');
    if (all) {
      const picks = JSON.parse(all.dataset.trioAll);
      let n = 0;
      for (const p of picks) {
        const s = window.__ssCatalog?.find((x) => x.id === p);
        const v = firstAvailableVariant(s);
        if (s && v && add(s, v, 1, { silent: n > 0, from: all })) n++;
      }
      if (n) {
        document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: 'Balle balle! Hun thaali puri ho gayi ji!', mood: 'celebrate', group: 'add' } }));
      }
      hide();
    }
  });
  return bar;
}

function hide() {
  clearTimeout(hideTimer);
  if (!bar) return;
  bar.classList.remove('is-in');
  setTimeout(() => { if (bar) bar.hidden = true; }, 250);
}

/** Offer two partners for `sweet`. Skips if the cart already has 3+ sweets. */
export async function offerTrio(sweet) {
  const inCart = new Set(sweetIdsInCart());
  if (inCart.size >= 3 || Date.now() - dismissedAt < 60000) return;
  const diet = store.get('profile')?.taste_profile?.diet || {};
  const [tog, sim] = await Promise.all([related(sweet, 'together', 6), related(sweet, 'content', 8)]);
  const seen = new Set();
  const picks = [...tog.items, ...sim.items].filter((s) => {
    if (seen.has(s.id) || inCart.has(s.id) || s.id === sweet.id || !s.in_stock || !firstAvailableVariant(s)) return false;
    if (diet.sugar_free && !s.is_sugar_free) return false;
    seen.add(s.id);
    return true;
  }).slice(0, 2);
  if (picks.length < 2) return;

  const distinctAfter = new Set([...inCart, ...picks.map((p) => p.id)]).size;
  const deal = mixSave(distinctAfter);
  const price = picks.reduce((n, s) => n + Number(firstAvailableVariant(s).price), 0);
  const b = ensureBar();
  b.innerHTML = html`
    <div class="trio-bar__inner">
      <div class="trio-bar__thumbs" aria-hidden="true">
        ${sweetImage(sweet, { size: 'thumb' })}<span>+</span>${picks.map((s) => sweetImage(s, { size: 'thumb' }))}
      </div>
      <div class="trio-bar__copy">
        <strong>Trio banao ji! 🍬🍬🍬</strong>
        <span class="muted">${sweetName(picks[0])} + ${sweetName(picks[1])} · ${rupees(price)}${deal.percent ? html` · <b class="trio-bar__save">${deal.percent}% off unlocked</b>` : ''}</span>
      </div>
      <button type="button" class="btn btn--gold btn--sm" data-trio-all="${JSON.stringify(picks.map((p) => p.id))}">Add both</button>
      <button type="button" class="icon-btn icon-btn--sm" data-trio-close aria-label="No thanks"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
    </div>`;
  b.hidden = false;
  requestAnimationFrame(() => b.classList.add('is-in'));
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 14000);
}

export function initTrio() {
  document.addEventListener('ss:added', (e) => {
    if (e.detail?.firstTime) setTimeout(() => offerTrio(e.detail.sweet).catch(() => {}), 1200);
  });
  document.addEventListener('ss:route', (e) => { if (e.detail.name === 'checkout') hide(); });
  document.addEventListener('ss:cart-open', hide);
  return { $ };
}
