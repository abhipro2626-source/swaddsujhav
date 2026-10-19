// Order confirmation + live tracking (Supabase Realtime), and "Paaji's next sujhaav".
import { html, raw, rupees, sweetImage, rangoliLoader, emptyState } from '../ui.js';
import { sweetName } from '../i18n.js';
import { supabase } from '../supabase.js';
import { store } from '../state.js';
import { loadCatalog, getById } from '../catalog.js';
import { row } from '../cards.js';
import { forUser } from '../recommend.js';
import { tracker } from './profile.js';
import { mountScratch } from '../scratch.js';

let channel = null;

export async function renderOrder(view, id, params) {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  if (!store.get('user')) { location.hash = '#/profile'; return; }
  view.innerHTML = html`<div class="page container">${raw(rangoliLoader('Order dhoond rahe hain…'))}</div>`;
  await loadCatalog().catch(() => null);
  const { data: o, error } = await supabase.from('orders')
    .select('*, order_items(sweet_id, variant_id, quantity, price, is_free), order_gift_boxes(size, ribbon, message, items, price)').eq('id', id).maybeSingle();
  if (error || !o) {
    view.innerHTML = html`<div class="page container">${raw(emptyState({ icon: '🔍', title: 'Order not found',
      text: 'It may belong to another account.', action: '<a class="btn btn--gold" href="#/profile">Your orders</a>' }))}</div>`;
    return;
  }
  const isNew = params?.get('new') === '1';
  const items = (o.order_items || []).map((i) => ({ ...i, sweet: getById(i.sweet_id) })).filter((i) => i.sweet);

  const draw = (order) => {
    view.innerHTML = html`
    <div class="page page--order container page--narrow">
      ${isNew ? html`<section class="order-hero">
        <p class="order-hero__emoji" aria-hidden="true">🪔🎉🪔</p>
        <h1 class="page-title">Wah ji wah! Order ho gaya.</h1>
        <p class="muted">${order.order_type === 'preorder' ? 'Booking pakki! Paaji will make it fresh for your slot.' : 'Thank you! Paaji is packing your thaali with love.'}</p>
      </section>` : html`<h1 class="page-title">Order ${order.order_number}</h1>`}
      <div id="scratch-slot"></div>

      <section class="panel">
        <header class="panel__head">
          <h2>${order.order_number}</h2>
          <span class="muted">${new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </header>
        <div id="tracker-slot">${tracker(order.status, order.fulfilment)}</div>
        <p class="muted small live-note">🔴 Live — this updates by itself when the shop changes your order status.</p>
        <dl class="order-meta">
          <div><dt>${order.fulfilment === 'delivery' ? 'Delivery to' : 'Pickup at'}</dt>
            <dd>${order.fulfilment === 'delivery' && order.address
              ? `${order.address.name}, ${order.address.line1}${order.address.line2 ? `, ${order.address.line2}` : ''}, ${order.address.city} ${order.address.pincode || ''}`
              : 'Swaad Sujhaav, Main Bazaar, Muzaffarnagar'}</dd></div>
          <div><dt>Time</dt><dd>${order.delivery_slot || '—'}</dd></div>
          <div><dt>Payment</dt><dd>${order.payment_method === 'cod' ? '💵 Cash on Delivery' : '🏪 Pay at Shop'}</dd></div>
          ${order.gift_message ? html`<div><dt>Gift card</dt><dd class="gift-msg">“${order.gift_message}”</dd></div>` : ''}
        </dl>
        <ul class="summary-lines">
          ${items.map((i) => html`<li>${sweetImage(i.sweet, { size: 'thumb' })}
            <span class="summary-lines__name"><a href="#/sweet/${i.sweet.slug}" data-open="${i.sweet.slug}">${sweetName(i.sweet)}</a>
              <small class="muted">${i.sweet.variants.find((v) => v.id === i.variant_id)?.weight_label || ''} × ${i.quantity}</small></span>
            <strong>${i.is_free ? 'Free 🎟️' : rupees(i.price * i.quantity)}</strong></li>`)}
          ${(order.order_gift_boxes || []).map((b) => html`<li><span class="summary-box" aria-hidden="true">🎁</span>
            <span class="summary-lines__name">Gift box of ${b.size}<small class="muted">${b.ribbon} ribbon${b.message ? ` · “${b.message}”` : ''}</small></span>
            <strong>${rupees(b.price)}</strong></li>`)}
        </ul>
        ${Number(order.discount) > 0 ? html`<div class="summary-row"><span>Subtotal</span><span>${rupees(order.subtotal)}</span></div>
          ${Number(order.deal_discount) ? html`<div class="summary-row summary-row--save"><span>⏰ Last-hour deals</span><span>−${rupees(order.deal_discount)}</span></div>` : ''}
          ${Number(order.combo_discount) ? html`<div class="summary-row summary-row--save"><span>🥨 Jodi combo</span><span>−${rupees(order.combo_discount)}</span></div>` : ''}
          ${Number(order.mix_discount) || (!Number(order.deal_discount) && !Number(order.combo_discount) && !Number(order.coupon_discount)) ? html`<div class="summary-row summary-row--save"><span>🍬 Mix & Save</span><span>−${rupees(Number(order.mix_discount) || order.discount)}</span></div>` : ''}
          ${Number(order.coupon_discount) ? html`<div class="summary-row summary-row--save"><span>🎟️ Coupon</span><span>−${rupees(order.coupon_discount)}</span></div>` : ''}` : ''}
        ${order.free_sample_sweet_id && getById(order.free_sample_sweet_id) ? html`<div class="summary-row summary-row--gift">
          <span>✨ Free taste: ${sweetName(getById(order.free_sample_sweet_id))}</span><span>Free</span></div>` : ''}
        <div class="summary-row summary-row--total"><span>Total</span><strong>${rupees(order.total)}</strong></div>
        <div class="order-card__actions">
          <a class="btn" href="#/profile">All orders</a>
          <button type="button" class="btn btn--gold" data-reorder="${order.id}">🔁 Order again</button>
        </div>
      </section>
      <div id="next-slot"></div>
    </div>`;
  };
  draw(o);
  mountScratch(view.querySelector('#scratch-slot'), o.id).catch((e) => console.debug('[scratch]', e));

  // Paaji's next sujhaav (excludes what was just bought).
  forUser({ limit: 10 }).then(({ items: recs, reasons }) => {
    const bought = new Set(items.map((i) => i.sweet_id));
    const list = recs.filter((s) => !bought.has(s.id));
    const slot = view.querySelector('#next-slot');
    if (slot && list.length) slot.innerHTML = row({ id: 'row-next', title: "Paaji's next sujhaav for you", items: list, reasons });
    if (isNew) {
      document.dispatchEvent(new CustomEvent('ss:order-placed', { detail: { order: o, next: list[0]?.name } }));
      history.replaceState(null, '', `#/order/${o.id}`);
    }
  }).catch(() => {
    if (isNew) document.dispatchEvent(new CustomEvent('ss:order-placed', { detail: { order: o } }));
  });

  // Live status updates.
  channel = supabase.channel(`order-${o.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${o.id}` }, (payload) => {
      const slot = view.querySelector('#tracker-slot');
      if (slot) slot.innerHTML = tracker(payload.new.status, payload.new.fulfilment);
      document.dispatchEvent(new CustomEvent('ss:say', { detail: {
        text: { packing: 'Tuhadi mithai pack ho rahi hai ji!', out_for_delivery: 'Mithai raste vich hai ji, bas pahunchne wali!', delivered: 'Mithai pahunch gayi! Mooh mitha karo ji!' }[payload.new.status] || 'Order update aaya hai ji!',
        mood: payload.new.status === 'delivered' ? 'celebrate' : 'point' } }));
    })
    .subscribe();
}
