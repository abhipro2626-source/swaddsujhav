// Checkout: fulfilment & address → slot → payment (COD / Pay at Shop) → gift message → review → place.
// Real payment gateways can be added later as a new payment_method + a payments table.
import { html, raw, rupees, sweetImage, emptyState, toast, $ } from '../ui.js';
import { sweetName } from '../i18n.js';
import { store } from '../state.js';
import { supabase } from '../supabase.js';
import { lines, subtotal, count, clearLocal, boxes, boxPrice, sweetIdsInCart } from '../cart.js';
import { loadCatalog } from '../catalog.js';
import { updateProfile } from '../auth.js';
import { openAuthModal } from '../account.js';
import { GIFT_BOX_RULE } from '../cartDrawer.js';
import { mixSave, discountFor, getRules, qualifiesForSample } from '../deals.js';
import { priceCart, getCoupon, setCoupon, myCoupons, couponUsable } from '../pricing.js';

const SHOP = { name: 'Swaad Sujhaav', address: 'Main Bazaar, Muzaffarnagar, Uttar Pradesh 251001', hours: '9am – 10pm' };
const DELIVERY_SLOTS = ['10am–12pm', '12pm–3pm', '3pm–6pm', '6pm–9pm'];
const PICKUP_SLOTS = ['10am–1pm', '1pm–5pm', '5pm–9pm'];

function slotDays() {
  const fmt = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const dayAfter = new Date(Date.now() + 2 * 86400000);
  return [['Today', fmt(today), today], ['Tomorrow', fmt(tomorrow), tomorrow], [fmt(dayAfter), '', dayAfter]];
}

/** Slots still available today (at least 1 hour away). */
function slotOpen(day, slot) {
  if (day.toDateString() !== new Date().toDateString()) return true;
  const startHour = (s) => {
    const m = s.match(/^(\d+)(am|pm)/);
    let h = Number(m[1]) % 12;
    if (m[2] === 'pm') h += 12;
    return h;
  };
  return startHour(slot) > new Date().getHours() + 1;
}

/** Money rows from the server's price (falls back to a local estimate while loading). */
function moneyRows(p, est, fulfilment) {
  const sub = p ? Number(p.subtotal) : est.sub;
  const rows = [html`<div class="summary-row"><span>Subtotal</span><span>${rupees(sub)}</span></div>`,
    html`<div class="summary-row"><span>${fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</span><span>Free</span></div>`];
  if (p) {
    if (Number(p.deal_discount)) rows.push(html`<div class="summary-row summary-row--save"><span>⏰ Last-hour deals</span><span>−${rupees(p.deal_discount)}</span></div>`);
    if (Number(p.combo_discount)) rows.push(html`<div class="summary-row summary-row--save"><span>🥨 ${(p.combos || []).map((c) => c.name).join(', ') || 'Jodi combo'}</span><span>−${rupees(p.combo_discount)}</span></div>`);
    if (Number(p.mix_discount)) rows.push(html`<div class="summary-row summary-row--save"><span>🍬 Mix & Save (${p.distinct} sweets, ${p.mix_percent}%)</span><span>−${rupees(p.mix_discount)}</span></div>`);
    const c = p.coupon;
    if (c?.valid && Number(c.discount)) rows.push(html`<div class="summary-row summary-row--save"><span>🎟️ ${c.code} · ${c.message}</span><span>−${rupees(c.discount)}</span></div>`);
    if (c?.valid && c.free_item) rows.push(html`<div class="summary-row summary-row--gift"><span>🎟️ Free ${c.free_item.weight_label} ${c.free_item.name}</span><span>Free</span></div>`);
    if (c?.valid && c.kind === 'free_wrap' && !Number(c.discount)) rows.push(html`<div class="summary-row summary-row--gift"><span>🎟️ Free festive gift wrap</span><span>Free</span></div>`);
  } else if (est.discount) {
    rows.push(html`<div class="summary-row summary-row--save"><span>🍬 Mix & Save (${est.distinct} sweets, ${est.percent}%)</span><span>−${rupees(est.discount)}</span></div>`);
  }
  if (est.giftBox) rows.push(html`<div class="summary-row summary-row--gift"><span>🎁 Deepawali gift box</span><span>Free</span></div>`);
  if (est.sample) rows.push(html`<div class="summary-row summary-row--gift"><span>✨ Free taste of a new arrival</span><span>Free</span></div>`);
  rows.push(html`<div class="summary-row summary-row--total"><span>Total</span><strong>${rupees(p ? p.total : est.sub - est.discount)}</strong></div>`);
  if (!p) rows.push(html`<p class="muted small">Checking today's deals and offers…</p>`);
  return html`${rows}`;
}

export async function renderCheckout(view, params) {
  await loadCatalog().catch(() => null);
  if (!count()) {
    view.innerHTML = html`<div class="page container page--narrow">${raw(emptyState({ icon: '🍽️', title: 'Thaali khaali hai ji!',
      text: 'Add some sweets first, then come back to place your order.', action: '<a class="btn btn--gold" href="#/catalog">Browse mithai</a>' }))}</div>`;
    return;
  }
  if (!store.get('user')) {
    view.innerHTML = html`
      <div class="page container page--narrow">
        <section class="guest-card">
          <span class="guest-card__diya" aria-hidden="true">🧾</span>
          <h1 class="page-title">Bas ek kadam aur!</h1>
          <p class="muted">Log in or create an account to place your order. Your thaali (${count()} items) stays saved.</p>
          <div class="guest-card__cta">
            <button type="button" class="btn btn--gold btn--lg" data-auth="login">Log in</button>
            <button type="button" class="btn btn--lg" data-auth="signup">Sign up</button>
          </div>
        </section>
      </div>`;
    view.addEventListener('click', (e) => { const b = e.target.closest('[data-auth]'); if (b) openAuthModal(b.dataset.auth); });
    return;
  }

  const profile = store.get('profile') || {};
  const saved = Array.isArray(profile.addresses) ? profile.addresses : [];
  const preSlotId = Number(params?.get?.('preorder')) || null;
  let preSlot = null;
  if (preSlotId) {
    const { data } = await supabase.from('preorder_slots').select('*, festival:festivals(name, emoji, cutoff_hours)').eq('id', preSlotId).maybeSingle();
    preSlot = data;
  }
  let coupons = [];
  const couponChips = () => html`${coupons.map((c) => html`<button type="button" class="chip chip--toggle ${getCoupon() === c.code ? 'is-on' : ''}" data-use-coupon="${c.code}">🎟️ ${c.code} · ${c.label}</button>`)}`;
  myCoupons().then((c) => { coupons = c.filter(couponUsable); const el = $('#coupon-chips', view); if (el) el.innerHTML = couponChips(); }).catch(() => {});
  const days = slotDays();
  const st = {
    fulfilment: 'delivery',
    addrIndex: saved.length ? 0 : -1,
    address: { name: profile.name || '', phone: profile.phone || '', line1: '', line2: '', city: 'Muzaffarnagar', pincode: '' },
    saveAddress: true,
    day: 0,
    slot: null,
    payment: 'cod',
    gift: '',
    price: null,
    priceNote: '',
  };

  const draw = () => {
    const ls = lines();
    const sub = subtotal();
    const distinct = sweetIdsInCart().length;
    const bx = boxes();
    const deal = mixSave(distinct);
    const discount = discountFor(sub, distinct);
    const giftBox = sub >= (getRules().gift_box_threshold || GIFT_BOX_RULE.threshold);
    const slots = st.fulfilment === 'delivery' ? DELIVERY_SLOTS : PICKUP_SLOTS;
    const day = days[st.day][2];
    if (st.slot && !slotOpen(day, st.slot)) st.slot = null;
    view.innerHTML = html`
    <div class="page page--checkout container">
      <h1 class="page-title">Checkout 🪔</h1>
      <div class="checkout">
        <form class="checkout__steps" id="checkout-form" novalidate>
          <section class="checkout-card" aria-labelledby="step1">
            <h2 id="step1"><span class="step-num">1</span> Delivery or pickup?</h2>
            <div class="choice-row" role="radiogroup" aria-label="Delivery or pickup">
              ${[['delivery', '🛵', 'Home delivery', 'Free in Muzaffarnagar'], ['pickup', '🏪', 'Pick up at shop', SHOP.address]].map(([v, e, t, d]) => html`
                <label class="choice ${st.fulfilment === v ? 'is-on' : ''}">
                  <input type="radio" name="fulfilment" value="${v}" ${st.fulfilment === v ? 'checked' : ''}>
                  <span class="choice__e" aria-hidden="true">${e}</span><span><strong>${t}</strong><small class="muted">${d}</small></span>
                </label>`)}
            </div>
            ${st.fulfilment === 'delivery' ? html`
              ${saved.length ? html`<div class="saved-addr" role="radiogroup" aria-label="Saved addresses">
                ${saved.map((a, i) => html`<label class="choice choice--sm ${st.addrIndex === i ? 'is-on' : ''}">
                  <input type="radio" name="addr" value="${i}" ${st.addrIndex === i ? 'checked' : ''}>
                  <span><strong>${a.name}</strong><small class="muted">${a.line1}, ${a.city} ${a.pincode || ''}</small></span></label>`)}
                <label class="choice choice--sm ${st.addrIndex === -1 ? 'is-on' : ''}"><input type="radio" name="addr" value="-1" ${st.addrIndex === -1 ? 'checked' : ''}>
                  <span><strong>+ New address</strong></span></label>
              </div>` : ''}
              ${st.addrIndex === -1 ? html`
              <div class="form-grid">
                <label class="field"><span>Full name</span><input name="name" autocomplete="name" required value="${st.address.name}"></label>
                <label class="field"><span>Phone</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="[0-9+\\s-]{10,15}" value="${st.address.phone}" placeholder="10-digit mobile"></label>
                <label class="field field--wide"><span>House / street</span><input name="line1" autocomplete="address-line1" required value="${st.address.line1}"></label>
                <label class="field field--wide"><span>Landmark (optional)</span><input name="line2" autocomplete="address-line2" value="${st.address.line2}"></label>
                <label class="field"><span>City</span><input name="city" autocomplete="address-level2" required value="${st.address.city}"></label>
                <label class="field"><span>PIN code</span><input name="pincode" inputmode="numeric" autocomplete="postal-code" required pattern="[0-9]{6}" value="${st.address.pincode}"></label>
                <label class="check field--wide"><input type="checkbox" name="save" ${st.saveAddress ? 'checked' : ''}> Save this address for next time</label>
              </div>` : ''}` : html`<p class="pickup-note">📍 ${SHOP.address} · Open ${SHOP.hours}</p>`}
          </section>

          ${preSlot ? html`<section class="checkout-card checkout-card--preorder" aria-labelledby="step2">
            <h2 id="step2"><span class="step-num">2</span> ${preSlot.festival?.emoji || '🪔'} Pre-order slot</h2>
            <p><strong>${preSlot.festival?.name || 'Festival'}</strong> · ${new Date(`${preSlot.slot_date}T00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })},
              ${preSlot.start_time.slice(0, 5)}–${preSlot.end_time.slice(0, 5)}</p>
            <p class="muted small">Made fresh for your slot. You can cancel up to ${preSlot.festival?.cutoff_hours || 12} hours before. <a href="#/festivals">Change slot</a></p>
          </section>` : html`<section class="checkout-card" aria-labelledby="step2">
            <h2 id="step2"><span class="step-num">2</span> ${st.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'} time</h2>
            <div class="chips" role="radiogroup" aria-label="Day">
              ${days.map(([a, b], i) => html`<button type="button" class="chip chip--toggle ${st.day === i ? 'is-on' : ''}" data-day="${i}"
                role="radio" aria-checked="${st.day === i ? 'true' : 'false'}">${a}${b ? html` <small>${b}</small>` : ''}</button>`)}
            </div>
            <div class="slot-grid" role="radiogroup" aria-label="Time slot">
              ${slots.map((s) => {
                const open = slotOpen(day, s);
                return html`<button type="button" class="slot ${st.slot === s ? 'is-on' : ''}" data-slot="${s}" ${open ? '' : 'disabled'}
                  role="radio" aria-checked="${st.slot === s ? 'true' : 'false'}">${s}${open ? '' : html`<small>closed</small>`}</button>`;
              })}
            </div>
          </section>`}

          <section class="checkout-card" aria-labelledby="step3">
            <h2 id="step3"><span class="step-num">3</span> Payment</h2>
            <div class="choice-row" role="radiogroup" aria-label="Payment method">
              ${[['cod', '💵', 'Cash on Delivery', 'Pay when your mithai arrives'], ['pay_at_shop', '🏪', 'Pay at Shop', 'Pay when you pick up']].map(([v, e, t, d]) => html`
                <label class="choice ${st.payment === v ? 'is-on' : ''}">
                  <input type="radio" name="payment" value="${v}" ${st.payment === v ? 'checked' : ''}>
                  <span class="choice__e" aria-hidden="true">${e}</span><span><strong>${t}</strong><small class="muted">${d}</small></span>
                </label>`)}
            </div>
            <p class="muted small">No card or UPI details are ever asked for online.</p>
          </section>

          <section class="checkout-card" aria-labelledby="step4">
            <h2 id="step4"><span class="step-num">4</span> Gift message <small class="muted">(optional)</small></h2>
            <label class="field"><span class="sr-only">Gift message</span>
              <textarea name="gift" maxlength="300" placeholder="Happy Deepawali, Nani! Love, Riya">${st.gift}</textarea></label>
            <p class="muted small"><span id="gift-count">${st.gift.length}</span>/300 · We write it on a festive card inside the box.</p>
          </section>
        </form>

        <aside class="checkout__summary checkout-card" aria-labelledby="summary-title">
          <h2 id="summary-title"><span class="step-num">5</span> Review</h2>
          <ul class="summary-lines">
            ${ls.map((l) => html`<li>${sweetImage(l.sweet, { size: 'thumb' })}
              <span class="summary-lines__name">${sweetName(l.sweet)}<small class="muted">${l.variant.weight_label} × ${l.quantity}</small></span>
              <strong>${rupees(l.total)}</strong></li>`)}
            ${bx.map((b) => html`<li><span class="summary-box" aria-hidden="true">🎁</span>
              <span class="summary-lines__name">Gift box of ${b.size}<small class="muted">${b.ribbon} ribbon · ${[...new Set(b.items)].length} kinds</small></span>
              <strong>${rupees(boxPrice(b))}</strong></li>`)}
          </ul>
          <div id="money" aria-live="polite">${moneyRows(st.price, { sub, discount, distinct, percent: deal.percent, giftBox, sample: qualifiesForSample(distinct) }, st.fulfilment)}</div>
          <div class="coupon-box">
            <label class="field field--inline"><span>🎟️ Coupon</span>
              <input id="coupon-input" autocomplete="off" maxlength="20" placeholder="e.g. SSAB12CD" value="${getCoupon()}"></label>
            <button type="button" class="btn btn--sm" data-apply-coupon>Apply</button>
            ${getCoupon() ? html`<button type="button" class="link-btn" data-clear-coupon>Remove</button>` : ''}
            <p class="coupon-box__msg small" id="coupon-msg" role="status">${st.price?.coupon && !st.price.coupon.valid ? st.price.coupon.message : ''}</p>
            <div class="chips" id="coupon-chips">${couponChips()}</div>
          </div>
          ${st.priceNote ? html`<p class="checkout__note" role="alert">${st.priceNote}</p>` : ''}
          ${deal.next ? html`<p class="summary-nudge">🍬 Add ${deal.next.needed} more different sweet${deal.next.needed > 1 ? 's' : ''} for ${deal.next.percent}% off · <a href="#/catalog">browse</a></p>` : ''}
          <p class="checkout__error" role="alert" hidden></p>
          <button type="button" class="btn btn--gold btn--lg btn--block" id="place-order">Place Order 🪔</button>
          <a class="link-btn" href="#/catalog">← Add more mithai</a>
        </aside>
      </div>
    </div>`;
  };

  async function refreshPrice() {
    const p = await priceCart({ orderType: preSlot ? 'preorder' : 'regular' });
    st.price = p;
    const box = $('#money', view);
    if (!box) return;
    const distinct = sweetIdsInCart().length;
    const est = { sub: subtotal(), discount: discountFor(subtotal(), distinct), distinct, percent: mixSave(distinct).percent,
      giftBox: subtotal() >= (getRules().gift_box_threshold || GIFT_BOX_RULE.threshold), sample: qualifiesForSample(distinct) };
    box.innerHTML = moneyRows(p, est, st.fulfilment);
    const msg = $('#coupon-msg', view);
    if (msg) msg.textContent = p?.coupon && !p.coupon.valid ? p.coupon.message : p?.coupon?.valid ? `✓ ${p.coupon.message}` : '';
  }

  const readForm = () => {
    const f = $('#checkout-form', view);
    if (!f) return;
    const v = (n) => f.elements[n]?.value?.trim() ?? '';
    if (st.addrIndex === -1 && st.fulfilment === 'delivery') {
      st.address = { name: v('name'), phone: v('phone'), line1: v('line1'), line2: v('line2'), city: v('city'), pincode: v('pincode') };
      st.saveAddress = !!f.elements.save?.checked;
    }
    st.gift = f.elements.gift?.value || '';
  };

  view.addEventListener('change', (e) => {
    readForm();
    const t = e.target;
    if (t.name === 'fulfilment') { st.fulfilment = t.value; st.payment = t.value === 'pickup' ? 'pay_at_shop' : 'cod'; st.slot = null; draw(); }
    if (t.name === 'addr') { st.addrIndex = Number(t.value); draw(); }
    if (t.name === 'payment') { st.payment = t.value; draw(); }
  });
  view.addEventListener('input', (e) => {
    if (e.target.name === 'gift') { const c = $('#gift-count', view); if (c) c.textContent = e.target.value.length; }
  });
  view.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-day]');
    if (d) { readForm(); st.day = Number(d.dataset.day); draw(); return; }
    const s = e.target.closest('[data-slot]');
    if (s && !s.disabled) { readForm(); st.slot = s.dataset.slot; draw(); return; }
    if (e.target.closest('[data-apply-coupon]')) {
      readForm(); setCoupon($('#coupon-input', view)?.value); st.priceNote = ''; draw(); refreshPrice();
      return;
    }
    if (e.target.closest('[data-clear-coupon]')) { readForm(); setCoupon(''); draw(); refreshPrice(); return; }
    const uc = e.target.closest('[data-use-coupon]');
    if (uc) { readForm(); setCoupon(uc.dataset.useCoupon); draw(); refreshPrice(); return; }
    if (e.target.closest('#place-order')) { readForm(); await place(); }
  });

  async function place() {
    const err = $('.checkout__error', view);
    const btn = $('#place-order', view);
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    err.hidden = true;
    let address = null;
    if (st.fulfilment === 'delivery') {
      address = st.addrIndex >= 0 ? saved[st.addrIndex] : st.address;
      if (!address?.name || !address?.line1 || !address?.city) return fail('Please fill in your name and full address.');
      if (!/^[0-9+\s-]{10,15}$/.test(address.phone || '')) return fail('Please enter a valid 10-digit phone number.');
      if (!/^[0-9]{6}$/.test(address.pincode || '')) return fail('Please enter a 6-digit PIN code.');
    }
    if (!st.slot && !preSlot) return fail(`Please choose a ${st.fulfilment === 'delivery' ? 'delivery' : 'pickup'} time.`);
    const slotLabel = preSlot ? null : `${days[st.day][0]}${days[st.day][1] ? ` (${days[st.day][1]})` : ''}, ${st.slot}`;
    if (st.price?.coupon && !st.price.coupon.valid) return fail(`Coupon: ${st.price.coupon.message}. Remove it or try another.`);

    btn.disabled = true;
    btn.textContent = 'Order ho raha hai…';
    try {
      const { data, error } = await supabase.rpc('place_order', {
        p_payment_method: st.payment,
        p_fulfilment: st.fulfilment,
        p_address: address,
        p_delivery_slot: slotLabel,
        p_gift_message: st.gift.trim() || null,
        p_coupon_code: getCoupon() || null,
        p_preorder_slot_id: preSlot?.id || null,
        p_expected_total: st.price ? Number(st.price.total) : null,
      });
      if (error) throw error;
      const order = Array.isArray(data) ? data[0] : data;
      if (st.fulfilment === 'delivery' && st.addrIndex === -1 && st.saveAddress) {
        updateProfile({ addresses: [...saved, address].slice(-5), phone: profile.phone || address.phone }).catch(() => {});
      }
      clearLocal();
      setCoupon('');
      await loadCatalog({ force: true }).catch(() => null);   // stock changed
      location.hash = `#/order/${order.id}?new=1`;
    } catch (ex) {
      console.warn('[checkout]', ex);
      const msg = ex.message || '';
      btn.disabled = false;
      btn.textContent = 'Place Order 🪔';
      if (msg.startsWith('PRICE_CHANGED')) {
        // A last-hour deal ended (or stock changed) between cart and checkout: show the new total first.
        await refreshPrice();
        st.priceNote = `⏰ Prices just changed (a last-hour deal ended). New total: ${rupees(st.price?.total)}. Tap Place Order again to confirm.`;
        draw(); refreshPrice();
        document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: 'Ji, deal da time khatam ho gaya — naya total dekh ke confirm karo.', mood: 'think' } }));
        return;
      }
      fail(/stock|limited/i.test(msg) ? `${msg}. Please reduce the quantity in your cart.` : msg || 'Could not place the order. Please try again.');
    }
  }

  draw();
  refreshPrice();
  store.on('cart', () => { if (document.body.dataset.route === 'checkout' && $('#checkout-form', view)) { readForm(); draw(); refreshPrice(); } });
  document.addEventListener('ss:live', (e) => { if (e.detail?.kind === 'deals' && document.body.dataset.route === 'checkout' && $('#money', view)) refreshPrice(); });
}
