// Slide-out cart drawer: lines, weight switch, steppers, remove with undo,
// Paaji's upsell, the free gift-box nudge and the Place Order button.
import { html, raw, rupees, sweetImage, emptyState, toast, $, prefersReducedMotion } from './ui.js';
import { t, sweetName } from './i18n.js';
import { lines, count, subtotal, setQty, remove, undoRemove, changeVariant, boxes, boxPrice, removeBox, sweetIdsInCart } from './cart.js';
import { getById } from './catalog.js';
import { upsell } from './recommend.js';
import { sweetCard } from './cards.js';
import { store } from './state.js';
import { mixSave, discountFor, getRules, qualifiesForSample } from './deals.js';

// Configurable combo rule (also shown on the home page offers).
export const GIFT_BOX_RULE = { threshold: 999, reward: 'a free Deepawali gift box' };

const drawer = () => $('#cart-drawer');
let opener = null;
let upsellTimer = 0;
let lastUpsellHTML = '';      // keep picks visible across redraws (no flicker)

export function openCart() {
  const d = drawer();
  if (!d || d.classList.contains('is-open')) return;
  opener = document.activeElement;
  render();
  d.classList.add('is-open');
  d.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-drawer');
  $('.drawer__panel', d).focus({ preventScroll: true });
  loadUpsell();
  document.dispatchEvent(new CustomEvent('ss:cart-open'));
}

export function closeCart() {
  const d = drawer();
  if (!d?.classList.contains('is-open')) return;
  d.classList.remove('is-open');
  d.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-drawer');
  opener?.focus?.({ preventScroll: true });
}

export const isCartOpen = () => drawer()?.classList.contains('is-open');

export function render() {
  const body = $('#cart-body');
  const foot = $('#cart-foot');
  if (!body || !foot) return;
  const ls = lines();
  const bx = boxes();
  if (!ls.length && !bx.length) {
    body.innerHTML = emptyState({ icon: '🍽️', title: 'Thaali khaali hai ji!', text: 'Add a few sweets and Paaji will do the rest.',
      action: '<a class="btn btn--gold" href="#/catalog" data-close-drawer>Browse mithai</a>' });
    foot.innerHTML = '';
    return;
  }
  const sub = subtotal();
  const distinct = sweetIdsInCart().length;
  const deal = mixSave(distinct);
  const discount = discountFor(sub, distinct);
  const threshold = getRules().gift_box_threshold || GIFT_BOX_RULE.threshold;
  const left = Math.max(0, threshold - sub);
  const pct = Math.min(100, (sub / threshold) * 100);
  const mixPct = Math.min(100, (distinct / deal.max.distinct) * 100);
  body.innerHTML = html`
    <ul class="cart-lines">
      ${ls.map((l) => html`
      <li class="cart-line" data-variant="${l.variant.id}">
        <a class="cart-line__img" href="#/sweet/${l.sweet.slug}" data-open="${l.sweet.slug}" tabindex="-1">${sweetImage(l.sweet, { size: 'thumb' })}</a>
        <div class="cart-line__info">
          <a class="cart-line__name" href="#/sweet/${l.sweet.slug}" data-open="${l.sweet.slug}">${sweetName(l.sweet)}</a>
          <label class="cart-line__weight">
            <span class="sr-only">Weight for ${l.sweet.name}</span>
            <select data-weight="${l.variant.id}">
              ${l.sweet.variants.map((v) => html`<option value="${v.id}" ${v.id === l.variant.id ? 'selected' : ''}
                 ${v.stock_qty === 0 ? 'disabled' : ''}>${v.weight_label} · ${rupees(v.price)}${v.stock_qty === 0 ? ' (sold out)' : ''}</option>`)}
            </select>
          </label>
          <div class="cart-line__row">
            <div class="stepper stepper--sm" role="group" aria-label="Quantity of ${l.sweet.name}">
              <button type="button" data-line-dec="${l.variant.id}" aria-label="One less"><svg aria-hidden="true"><use href="#i-minus"/></svg></button>
              <output>${l.quantity}</output>
              <button type="button" data-line-inc="${l.variant.id}" aria-label="One more"><svg aria-hidden="true"><use href="#i-plus"/></svg></button>
            </div>
            <strong>${rupees(l.total)}</strong>
          </div>
        </div>
        <button type="button" class="icon-btn icon-btn--sm cart-line__remove" data-line-remove="${l.variant.id}" aria-label="Remove ${l.sweet.name}">
          <svg aria-hidden="true"><use href="#i-trash"/></svg></button>
      </li>`)}
      ${bx.map((b) => html`
      <li class="cart-line cart-line--box ribbon--${b.ribbon}">
        <div class="box-mini box-mini--${b.size}" aria-hidden="true">${b.items.map((id) => sweetImage(getById(id) || { name: '?' }, { size: 'thumb' }))}</div>
        <div class="cart-line__info">
          <span class="cart-line__name">🎁 Gift box of ${b.size}</span>
          <span class="muted small">${[...new Set(b.items)].length} kinds · ${b.ribbon} ribbon${b.message ? html` · “${b.message.slice(0, 40)}${b.message.length > 40 ? '…' : ''}”` : ''}</span>
          <strong>${rupees(boxPrice(b))}</strong>
        </div>
        <button type="button" class="icon-btn icon-btn--sm cart-line__remove" data-box-remove="${String(b.id)}" aria-label="Remove gift box of ${b.size}">
          <svg aria-hidden="true"><use href="#i-trash"/></svg></button>
      </li>`)}
    </ul>
    <section class="combo combo--mix" aria-live="polite">
      ${deal.next
        ? html`<p>🍬 Add <strong>${deal.next.needed} more ${deal.next.needed === 1 ? 'sweet' : 'different sweets'}</strong> and get <strong>${deal.next.percent}% off</strong> the whole thaali${deal.percent ? html` (now ${deal.percent}% off)` : ''}!</p>`
        : html`<p>🎉 Mix & Save maxed — <strong>${deal.percent}% off</strong> your thaali!</p>`}
      <div class="combo__bar combo__bar--steps" role="progressbar" aria-valuemin="0" aria-valuemax="${deal.max.distinct}" aria-valuenow="${distinct}" aria-label="Different sweets for Mix and Save">
        <span style="--p:${mixPct}%"></span>
        ${getRules().tiers.map((t) => html`<i class="combo__tick ${distinct >= t.distinct ? 'is-on' : ''}" style="--at:${(t.distinct / deal.max.distinct) * 100}%">${t.percent}%</i>`)}
      </div>
      ${qualifiesForSample(distinct) ? html`<p class="combo__sample">🎁 Paaji adds a <strong>free taste of a new arrival</strong> to your order!</p>` : ''}
    </section>
    <section class="combo" aria-live="polite">
      ${left > 0
        ? html`<p>🎁 <strong>${rupees(left)}</strong> more and get ${GIFT_BOX_RULE.reward}!</p>`
        : html`<p>🎉 Wah! You've unlocked ${GIFT_BOX_RULE.reward}.</p>`}
      <div class="combo__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="Progress to free gift box">
        <span style="--p:${pct}%"></span></div>
    </section>
    <section class="upsell" id="upsell" aria-labelledby="upsell-title">
      <h3 id="upsell-title">🧔🏽 Paaji kehte hain: ye bhi le lo!</h3>
      <div class="upsell__list" id="upsell-list">${lastUpsellHTML ? raw(lastUpsellHTML) : html`<p class="muted">Soch rahe hain…</p>`}</div>
    </section>`;
  foot.innerHTML = html`
    ${discount ? html`<div class="cart-total cart-total--sub"><span>Subtotal</span><span>${rupees(sub)}</span></div>
      <div class="cart-total cart-total--save"><span>Mix & Save ${deal.percent}%</span><span>−${rupees(discount)}</span></div>` : ''}
    <div class="cart-total"><span>Total (${count()} items)</span><strong>${rupees(sub - discount)}</strong></div>
    <p class="muted cart-note">Cash on Delivery or Pay at Shop. Delivery free in Muzaffarnagar.</p>
    <a class="btn btn--gold btn--lg btn--block place-btn" href="#/checkout" data-close-drawer>Place Order 🪔</a>`;
}

async function loadUpsell() {
  clearTimeout(upsellTimer);
  upsellTimer = setTimeout(async () => {
    const list = $('#upsell-list');
    if (!list) return;
    try {
      const { items, reasons } = await upsell(3);
      lastUpsellHTML = items.length
        ? String(html`${items.map((s) => sweetCard(s, { reason: reasons.get(s.id), compact: true }))}`)
        : '';
      if (!$('#upsell-list')) return;
      $('#upsell-list').innerHTML = lastUpsellHTML;
      if (!items.length) $('#upsell')?.remove();
    } catch {
      $('#upsell')?.remove();
    }
  }, 150);
}

export function initCartDrawer() {
  const d = drawer();
  if (!d) return;
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-drawer]')) { closeCart(); return; }
    const boxRm = e.target.closest('[data-box-remove]');
    if (boxRm) {
      const raw = boxRm.dataset.boxRemove;
      removeBox(/^\d+$/.test(raw) ? Number(raw) : raw);
      return;
    }
    const inc = e.target.closest('[data-line-inc]');
    const dec = e.target.closest('[data-line-dec]');
    const rm = e.target.closest('[data-line-remove]');
    if (inc) { const id = Number(inc.dataset.lineInc); setQty(id, (lines().find((l) => l.variant.id === id)?.quantity || 0) + 1); }
    if (dec) { const id = Number(dec.dataset.lineDec); setQty(id, (lines().find((l) => l.variant.id === id)?.quantity || 0) - 1); }
    if (rm) {
      const id = Number(rm.dataset.lineRemove);
      const line = rm.closest('.cart-line');
      const go = () => { remove(id); undoToast(); };
      if (line && !prefersReducedMotion()) { line.classList.add('is-leaving'); setTimeout(go, 200); } else go();
    }
  });
  d.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-weight]');
    if (sel) changeVariant(Number(sel.dataset.weight), Number(sel.value));
  });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

  const onChange = () => {
    if (!isCartOpen()) { lastUpsellHTML = ''; return; }
    render();
    loadUpsell();          // debounced; refreshes picks for the new cart
  };
  store.on('cart', onChange);
  store.on('boxes', onChange);
}

function undoToast() {
  const stack = document.getElementById('toasts');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast toast--undo';
  el.innerHTML = html`<span>Item removed.</span> <button type="button" class="link-btn">Undo</button>`;
  el.querySelector('button').addEventListener('click', () => { undoRemove(); el.remove(); toast('Wapas aa gayi ji!', 'success', 1600); });
  stack.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

export { raw };
