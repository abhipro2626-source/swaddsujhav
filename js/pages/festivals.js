// Festival calendar + pre-orders: pick a festival → add its specials → choose a
// pickup/delivery slot → checkout (order_type = 'preorder'). Slot capacity is
// checked again inside place_order, so two people can't take the last spot.
import { html, raw, rupees, rangoliLoader, emptyState, toast, $ } from '../ui.js';
import { supabase } from '../supabase.js';
import { store } from '../state.js';
import { loadCatalog } from '../catalog.js';
import { sweetCard } from '../cards.js';
import { count } from '../cart.js';
import { CONFIG, loadSettings } from '../feature-config.js';
import { paajiSay } from '../lines.js';
import { openAuthModal } from '../account.js';

let timer = 0;

const daysTo = (d) => Math.ceil((new Date(`${d}T00:00:00+05:30`) - Date.now()) / 86400000);
const niceDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export async function renderFestivals(view, params) {
  clearInterval(timer);
  view.innerHTML = html`<div class="page container">${raw(rangoliLoader('Tyohaar ki list bana rahe hain…'))}</div>`;
  await loadSettings().catch(() => null);
  const [list, { data: fests, error }, reminders, mine] = await Promise.all([
    loadCatalog(),
    supabase.from('festivals').select('*').eq('active', true).gte('starts_on', new Date(Date.now() - 86400000).toISOString().slice(0, 10)).order('starts_on'),
    store.get('user') ? supabase.from('festival_reminders').select('festival_id') : Promise.resolve({ data: [] }),
    store.get('user') ? supabase.from('orders').select('id, order_number, status, scheduled_for, delivery_slot, total, festival_id')
      .eq('order_type', 'preorder').order('scheduled_for') : Promise.resolve({ data: [] }),
  ]);
  if (error) { view.innerHTML = emptyState({ icon: '🙏', title: 'Could not load festivals', text: error.message }); return; }
  const remind = new Set((reminders.data || []).map((r) => r.festival_id));
  const selected = fests.find((f) => f.slug === params?.get?.('f')) || null;

  const specialsFor = (f) => list.filter((s) => s.in_stock && (f.featured_categories.includes(s.category) || (s.tags || []).some((t) => f.featured_tags.includes(t))))
    .sort((a, b) => b.popularity - a.popularity).slice(0, 12);

  if (!selected) {
    view.innerHTML = html`
    <div class="page container">
      <h1 class="page-title">🗓️ Festival Pre-orders</h1>
      <p class="muted">Tyohaar ki mithai pehle se book karo — slot chuno, Paaji usi din taaza banayenge. Line nahi, tension nahi.</p>
      ${myPreorders(mine.data || [], fests)}
      <div class="fest-grid">${fests.map((f) => {
        const d = daysTo(f.starts_on);
        const open = d <= f.lead_days;
        return html`<article class="fest-card" style="--accent-c:${f.accent}">
          <span class="fest-card__emoji" aria-hidden="true">${f.emoji}</span>
          <h3>${f.name}</h3>
          <p class="muted small">${niceDate(f.starts_on)}${f.needs_confirmation ? html` <span class="chip chip--warn" title="Lunar date — the shop confirms it">date to be confirmed</span>` : ''}</p>
          <p class="fest-card__count" data-count="${f.starts_on}">${d <= 0 ? 'Aaj hai!' : `${d} din baaki`}</p>
          <p class="small">${f.greeting}</p>
          <div class="fest-card__actions">
            ${open ? html`<a class="btn btn--gold btn--sm" href="#/festivals?f=${f.slug}">Book now</a>`
              : html`<span class="chip chip--sm">Booking opens ${f.lead_days} days before</span>`}
            <button type="button" class="btn btn--sm" data-remind="${f.id}" aria-pressed="${remind.has(f.id) ? 'true' : 'false'}">${remind.has(f.id) ? '🔔 Reminder on' : '🔕 Remind me'}</button>
          </div>
        </article>`;
      })}</div>
    </div>`;
  } else {
    const { data: slots } = await supabase.from('preorder_slots').select('*').eq('festival_id', selected.id).order('slot_date').order('start_time');
    const specials = specialsFor(selected);
    const byDay = new Map();
    for (const s of slots || []) byDay.set(s.slot_date, [...(byDay.get(s.slot_date) || []), s]);
    const cutoff = selected.cutoff_hours || CONFIG.preorder.default_cutoff_hours || 12;
    const closed = (s) => new Date(`${s.slot_date}T${s.start_time}+05:30`) - Date.now() < cutoff * 3600000;
    const full = (s) => s.booked_orders >= s.max_orders || s.booked_kg >= s.max_kg;
    let chosen = null;
    view.innerHTML = html`
    <div class="page container">
      <a class="link-btn" href="#/festivals">← All festivals</a>
      <h1 class="page-title">${selected.emoji} ${selected.name} pre-order</h1>
      <p class="muted">${niceDate(selected.starts_on)} · ${selected.greeting}</p>
      <ol class="steps-bar" aria-label="Steps"><li class="is-on">1 · Festival</li><li class="is-on">2 · Mithai</li><li id="step-slot">3 · Slot</li><li>4 · Confirm</li></ol>
      <section class="panel"><header class="panel__head"><h2>🪔 ${selected.name} specials</h2>
        <span class="muted small" id="cart-note">${count()} items in thaali</span></header>
        <div class="grid grid--compact">${specials.map((s) => sweetCard(s, { reason: { text: `${selected.name} special`, kind: 'occasion' }, compact: true }))}</div>
        <p class="muted small">Want something else? <a href="#/catalog">Browse all mithai</a> — everything in your thaali goes into this pre-order.</p>
      </section>
      <section class="panel" aria-labelledby="slot-title"><header class="panel__head"><h2 id="slot-title">⏰ Choose your slot</h2>
        <span class="muted small">Booking closes ${cutoff} h before each slot</span></header>
        ${byDay.size ? html`<div class="slot-board">${[...byDay.entries()].map(([day, list2]) => html`
          <div class="slot-day"><h4>${niceDate(day)}</h4>
            <div class="slot-grid" role="radiogroup" aria-label="Slots on ${niceDate(day)}">${list2.map((s) => {
              const isFull = full(s);
              const isClosed = closed(s);
              const left = Math.max(0, s.max_orders - s.booked_orders);
              return html`<button type="button" class="slot ${isFull ? 'is-full' : ''}" data-slot-id="${s.id}" role="radio" aria-checked="false" ${isFull || isClosed ? 'disabled' : ''}>
                ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}
                <small>${isFull ? 'Full' : isClosed ? 'Closed' : left <= 3 ? `Sirf ${left} slot bache!` : `${left} left`}</small></button>`;
            })}</div></div>`)}</div>`
          : html`<p class="muted">Slots for this festival open soon. Turn on the reminder and Paaji will tell you.</p>`}
      </section>
      <div class="row-actions"><button type="button" class="btn btn--gold btn--lg" id="go-checkout" disabled>Continue to confirm →</button></div>
    </div>`;
    view.addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot-id]');
      if (b && !b.disabled) {
        chosen = Number(b.dataset.slotId);
        view.querySelectorAll('[data-slot-id]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        view.querySelectorAll('[data-slot-id]').forEach((x) => x.classList.toggle('is-on', x === b));
        $('#step-slot', view)?.classList.add('is-on');
        $('#go-checkout', view).disabled = false;
      }
      if (e.target.closest('#go-checkout')) {
        if (!count()) { toast('Pehle thaali mein kuch mithai daalo ji!', 'info'); return; }
        location.hash = `#/checkout?preorder=${chosen}`;
      }
    });
    const onCart = () => { const n = $('#cart-note', view); if (n) n.textContent = `${count()} items in thaali`; };
    const unsub = store.on('cart', onCart);
    document.addEventListener('ss:route', () => unsub(), { once: true });
    paajiSay('festival_book', { fest: selected.name }, { mood: 'point', group: 'festival' });
  }

  // Reminder toggles and pre-order cancel.
  view.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-remind]');
    if (r) {
      if (!store.get('user')) { openAuthModal('login'); return; }
      const id = Number(r.dataset.remind);
      const on = r.getAttribute('aria-pressed') === 'true';
      const q = on ? supabase.from('festival_reminders').delete().eq('festival_id', id)
        : supabase.from('festival_reminders').insert({ user_id: store.get('user').id, festival_id: id });
      const { error: err } = await q;
      if (err) { toast(err.message, 'error'); return; }
      r.setAttribute('aria-pressed', String(!on));
      r.textContent = on ? '🔕 Remind me' : '🔔 Reminder on';
      toast(on ? 'Reminder hata diya.' : 'Reminder pakka! Booking khulte hi Paaji bataayenge — app kholte hi banner dikhega.', 'success', 3800);
    }
    const c = e.target.closest('[data-cancel-pre]');
    if (c) {
      if (!confirm('Cancel this pre-order?')) return;
      const { error: err } = await supabase.rpc('cancel_preorder', { p_order_id: c.dataset.cancelPre });
      if (err) { toast(err.message, 'error', 4500); return; }
      toast('Pre-order cancel ho gaya ji.', 'success');
      renderFestivals(view, params);
    }
  });

  timer = setInterval(() => {
    view.querySelectorAll('[data-count]').forEach((el) => { const d = daysTo(el.dataset.count); el.textContent = d <= 0 ? 'Aaj hai!' : `${d} din baaki`; });
  }, 60000);
}

const PRE_STATUS = { placed: 'Booked', packing: 'Being prepared', ready: 'Ready for pickup', out_for_delivery: 'Out for delivery', delivered: 'Completed', cancelled: 'Cancelled' };

function myPreorders(orders, fests) {
  if (!orders.length) return '';
  return html`<section class="panel" aria-labelledby="mypre-title"><header class="panel__head"><h2 id="mypre-title">📋 Mere pre-orders</h2></header>
    <ul class="orders">${orders.map((o) => {
      const f = fests.find((x) => x.id === o.festival_id);
      const cancellable = ['placed', 'packing'].includes(o.status) && new Date(o.scheduled_for) - Date.now() > (f?.cutoff_hours || 12) * 3600000;
      return html`<li class="order-card"><header class="order-card__head"><div><strong>${o.order_number}</strong>
        <span class="muted">· ${o.delivery_slot}</span></div><strong>${rupees(o.total)}</strong></header>
        <p><span class="chip chip--sm">${PRE_STATUS[o.status] || o.status}</span></p>
        <div class="order-card__actions"><a class="btn btn--sm" href="#/order/${o.id}">Details</a>
          ${cancellable ? html`<button type="button" class="btn btn--sm" data-cancel-pre="${o.id}">Cancel</button>` : ''}</div></li>`;
    })}</ul></section>`;
}
