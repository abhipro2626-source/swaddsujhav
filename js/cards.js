// Sweet cards, horizontal rows, skeletons and the fly-to-cart animation.
import { html, raw, rupees, sweetImage, prefersReducedMotion, $ } from './ui.js';
import { t, sweetName } from './i18n.js';
import { firstAvailableVariant, isVariantAvailable } from './catalog.js';
import { qtyOf } from './cart.js';
import { isFav } from './favorites.js';
import { store } from './state.js';
import { ordersThisMonth } from './deals.js';
import { dealFor, dealPrice, freshFor } from './live.js';
import { agoText } from './feature-config.js';

export const FLAGS = {
  India: '📍', Turkey: '🇹🇷', 'Middle East': '🌙', Japan: '🇯🇵', China: '🇨🇳', 'Hong Kong': '🇭🇰',
  Korea: '🇰🇷', Thailand: '🇹🇭', Philippines: '🇵🇭', Indonesia: '🇮🇩', Malaysia: '🇲🇾', Spain: '🇪🇸',
  Portugal: '🇵🇹', France: '🇫🇷', Italy: '🇮🇹', Greece: '🇬🇷', Egypt: '🇪🇬', UAE: '🇦🇪', Iran: '🇮🇷',
  Brazil: '🇧🇷', Argentina: '🇦🇷', Mexico: '🇲🇽', USA: '🇺🇸', UK: '🇬🇧', Austria: '🇦🇹', Germany: '🇩🇪',
  Australia: '🇦🇺', Russia: '🇷🇺', Afghanistan: '🇦🇫', 'Sri Lanka': '🇱🇰', Nepal: '🇳🇵',
  Bangladesh: '🇧🇩', 'South Africa': '🇿🇦',
};

export const REASON_ICON = { taste: '💛', together: '🤝', new: '✨', occasion: '🪔', popular: '🔥', similar: '🍬', collab: '👥' };

/** One sweet card. `reason` = { text, kind } from the recommender. */
export function sweetCard(s, { reason = null, compact = false } = {}) {
  const v = firstAvailableVariant(s) || s.variants[0];
  const inCart = v ? qtyOf(v.id) : 0;
  const soldOut = !s.in_stock || !v || !isVariantAvailable(v);
  const low = v && v.stock_qty != null && v.stock_qty > 0 && v.stock_qty <= 5;
  const fav = isFav(s.id);
  const badges = [
    s.is_new ? html`<span class="tag tag--new">New</span>` : '',
    (s.tags || []).includes('bestseller') ? html`<span class="tag tag--best">Bestseller</span>` : '',
    s.is_sugar_free ? html`<span class="tag tag--sf">Sugar-free</span>` : '',
    s.product_type === 'namkeen' ? html`<span class="tag tag--namkeen">Namkeen</span>` : '',
  ].filter(Boolean);
  const fresh = freshFor(s.id);
  const deal = soldOutFree(s, v) ? dealFor(s.id) : null;

  return html`
  <article class="sweet-card ${compact ? 'sweet-card--compact' : ''} ${soldOut ? 'is-soldout' : ''}"
           data-sweet="${s.id}">
    <a class="sweet-card__media" href="#/sweet/${s.slug}" data-open="${s.slug}"
       aria-label="${s.name}, view details">
      ${sweetImage(s)}
      <span class="sweet-card__badges">${badges}</span>
      ${soldOut ? html`<span class="sweet-card__soldout">${t('out_of_stock')}</span>` : ''}
      ${fresh && !soldOut ? html`<span class="taaza-badge" title="Made ${new Date(fresh.made_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}">🔥 Aaj ka Taaza</span>` : ''}
      ${deal ? html`<span class="deal-badge">⏰ ${deal.percent}% off</span>` : ''}
    </a>
    <button type="button" class="fav-btn ${fav ? 'is-on' : ''}" data-fav="${s.id}"
            aria-pressed="${fav ? 'true' : 'false'}" aria-label="${fav ? 'Remove from' : 'Add to'} favourites: ${s.name}">
      <svg aria-hidden="true"><use href="#i-heart${fav ? '-fill' : ''}"/></svg>
    </button>
    <div class="sweet-card__body">
      ${reason ? html`<p class="reason reason--${reason.kind || 'taste'}">
          <span aria-hidden="true">${REASON_ICON[reason.kind] || '💛'}</span> ${reason.text}</p>` : ''}
      <h3 class="sweet-card__name"><a href="#/sweet/${s.slug}" data-open="${s.slug}">${sweetName(s)}</a></h3>
      <p class="sweet-card__sub">
        ${store.get('lang') === 'hi' ? s.name : s.name_hi || ''}
      </p>
      ${fresh && !compact ? html`<p class="taaza-line">Bana: <span data-ago="${fresh.made_at}">${agoText(fresh.made_at)}</span></p>`
        : ordersThisMonth(s.id) >= 3 && !compact ? html`<p class="social-proof">🔥 ${ordersThisMonth(s.id)} orders this month</p>` : ''}
      <p class="sweet-card__meta">
        <span class="region-badge" title="${s.country}">${FLAGS[s.country] || '🌍'} ${s.region}</span>
        <span class="rating" aria-label="Rated ${s.rating} out of 5">
          <svg aria-hidden="true"><use href="#i-star"/></svg>${Number(s.rating).toFixed(1)}</span>
      </p>
      <div class="sweet-card__foot">
        <p class="price">
          ${deal ? html`<s class="price__old">${rupees(v.price)}</s> <strong class="price__deal">${rupees(dealPrice(s.id, v.price))}</strong>`
            : html`<strong>${rupees(v?.price ?? s.base_price)}</strong>`}
          <span class="muted">/ ${v?.weight_label || s.price_unit}</span>
          ${deal && deal.kg_left != null ? html`<span class="low-stock">Sirf ${Number(deal.kg_left).toFixed(1)} kg bacha</span>`
            : low ? html`<span class="low-stock">${t('only_left', { n: v.stock_qty })}</span>` : ''}
        </p>
        ${soldOut ? raw('') : inCart
          ? stepper(v.id, inCart, s.name)
          : html`<button type="button" class="btn btn--gold btn--sm add-btn" data-add="${s.id}"
                   data-variant="${v.id}" aria-label="${t('add')} ${s.name} ${v.weight_label}">
                   <svg aria-hidden="true"><use href="#i-plus"/></svg>${t('add')}</button>`}
      </div>
    </div>
  </article>`;
}

const soldOutFree = (s, v) => s.in_stock && v && isVariantAvailable(v);

/** Keep "Bana: 2 ghante pehle" current without re-rendering cards. */
export function tickAgo(root = document) {
  root.querySelectorAll('[data-ago]').forEach((el) => { el.textContent = agoText(el.dataset.ago); });
}

export function stepper(variantId, qty, label = '') {
  return html`<div class="stepper" role="group" aria-label="Quantity of ${label}">
    <button type="button" data-dec="${variantId}" aria-label="One less ${label}"><svg aria-hidden="true"><use href="#i-minus"/></svg></button>
    <output aria-live="polite">${qty}</output>
    <button type="button" data-inc="${variantId}" aria-label="One more ${label}"><svg aria-hidden="true"><use href="#i-plus"/></svg></button>
  </div>`;
}

export function skeletonCards(n = 6) {
  return raw(Array.from({ length: n }, () => `
    <div class="sweet-card sweet-card--skeleton" aria-hidden="true">
      <div class="sk sk--media"></div>
      <div class="sweet-card__body"><div class="sk sk--line"></div><div class="sk sk--line sk--short"></div><div class="sk sk--btn"></div></div>
    </div>`).join(''));
}

/** A horizontal snap-scrolling row of cards. */
export function row({ id, title, sub = '', items = [], href = '', reasons = null, empty = '' }) {
  const body = items.length
    ? items.map((s) => sweetCard(s, { reason: reasons?.get(s.id) || null }))
    : [empty ? html`<p class="row__empty muted">${empty}</p>` : skeletonCards(5)];
  return html`
  <section class="row" id="${id}" aria-labelledby="${id}-title">
    <header class="row__head">
      <div>
        <h2 id="${id}-title" class="row__title">${title}</h2>
        ${sub ? html`<p class="row__sub muted">${sub}</p>` : ''}
      </div>
      <div class="row__tools">
        ${href ? html`<a class="link-btn" href="${href}">${t('view_all')} <svg aria-hidden="true"><use href="#i-arrow"/></svg></a>` : ''}
        <button type="button" class="icon-btn icon-btn--sm row__nav hide-mobile" data-scroll="-1" aria-label="Scroll ${title} left">‹</button>
        <button type="button" class="icon-btn icon-btn--sm row__nav hide-mobile" data-scroll="1" aria-label="Scroll ${title} right">›</button>
      </div>
    </header>
    <div class="row__track" tabindex="0" aria-label="${title}">${body}</div>
  </section>`;
}

/** Re-render every visible card for a sweet (after add / qty change / favourite). */
export function refreshCards(sweetIds, lookup) {
  const ids = new Set((sweetIds || []).map(Number));
  document.querySelectorAll('.sweet-card[data-sweet]').forEach((el) => {
    const id = Number(el.dataset.sweet);
    if (sweetIds && !ids.has(id)) return;
    const s = lookup(id);
    if (!s) return;
    const reasonEl = el.querySelector('.reason');
    const reason = reasonEl ? { text: reasonEl.textContent.trim().replace(/^\S+\s/, ''), kind: [...reasonEl.classList].find((c) => c.startsWith('reason--'))?.slice(8) } : null;
    const tmp = document.createElement('div');
    tmp.innerHTML = sweetCard(s, { reason, compact: el.classList.contains('sweet-card--compact') });
    el.replaceWith(tmp.firstElementChild);
  });
}

/** Animate a small copy of the sweet's photo along a curve into the cart icon. */
export function flyToCart(fromEl) {
  const cartBtn = window.matchMedia('(max-width: 767px)').matches ? $('#bn-cart') : $('#cart-btn');
  bump();
  if (!fromEl || !cartBtn || prefersReducedMotion()) return;
  const card = fromEl.closest('.sweet-card, .detail');
  const img = card?.querySelector('.sweet-img img, .sweet-img .sweet-ph');
  if (!img) return;
  const a = img.getBoundingClientRect();
  const b = cartBtn.getBoundingClientRect();
  const ghost = img.cloneNode(true);
  const size = Math.min(72, a.width);
  Object.assign(ghost.style, {
    position: 'fixed', left: `${a.left + a.width / 2 - size / 2}px`, top: `${a.top + a.height / 2 - size / 2}px`,
    width: `${size}px`, height: `${size}px`, objectFit: 'cover', borderRadius: '50%', zIndex: 120,
    pointerEvents: 'none', boxShadow: '0 8px 24px rgba(255,153,51,.5)', margin: 0,
  });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const lift = Math.min(-80, dy * 0.5 - 120);
  ghost.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.45}px, ${lift}px) scale(.8) rotate(-12deg)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(8deg)`, opacity: 0.6 },
  ], { duration: 720, easing: 'cubic-bezier(.5,0,.3,1)' }).finished.then(() => {
    ghost.remove();
    bump();
    document.dispatchEvent(new CustomEvent('ss:sparkle', { detail: { x: b.left + b.width / 2, y: b.top + b.height / 2 } }));
  });
}

export function bump() {
  for (const id of ['cart-count', 'bn-cart-count']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.remove('is-bump');
    void el.offsetWidth;   // restart animation
    el.classList.add('is-bump');
  }
}
