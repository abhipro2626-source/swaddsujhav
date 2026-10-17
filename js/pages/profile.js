// Profile: guest login prompt, or taste profile, favourites, orders (Order Again), addresses.
import { html, raw, rupees, sweetImage, rangoliLoader, emptyState, toast, $ } from '../ui.js';
import { t, sweetName } from '../i18n.js';
import { store } from '../state.js';
import { supabase } from '../supabase.js';
import { signOut, updateProfile, firstName } from '../auth.js';
import { openAuthModal } from '../account.js';
import { openQuiz } from '../quiz.js';
import { loadCatalog, getById, CATEGORY_LABELS } from '../catalog.js';
import { favIds } from '../favorites.js';
import { sweetCard } from '../cards.js';

export const STATUS_STEPS = [
  { key: 'placed', label: 'Placed', emoji: '🧾' },
  { key: 'packing', label: 'Being Packed', emoji: '📦' },
  { key: 'out_for_delivery', label: 'Out for Delivery', emoji: '🛵' },
  { key: 'delivered', label: 'Delivered', emoji: '🎉' },
];

export function tracker(status, fulfilment = 'delivery') {
  const steps = fulfilment === 'pickup'
    ? [STATUS_STEPS[0], STATUS_STEPS[1], { key: 'out_for_delivery', label: 'Ready for pickup', emoji: '🛍️' }, { key: 'delivered', label: 'Picked up', emoji: '🎉' }]
    : STATUS_STEPS;
  if (status === 'cancelled') return html`<p class="chip chip--pink">Cancelled</p>`;
  const idx = steps.findIndex((s) => s.key === status);
  return html`<ol class="tracker" aria-label="Order status: ${steps[idx]?.label || status}">
    ${steps.map((s, i) => html`<li class="tracker__step ${i <= idx ? 'is-done' : ''} ${i === idx ? 'is-current' : ''}"
       ${i === idx ? raw('aria-current="step"') : ''}><span class="tracker__dot" aria-hidden="true">${s.emoji}</span><span>${s.label}</span></li>`)}
  </ol>`;
}

export async function renderProfile(view) {
  const user = store.get('user');
  if (!user) {
    view.innerHTML = html`
      <div class="page container page--narrow">
        <section class="guest-card">
          <span class="guest-card__diya" aria-hidden="true">🪔</span>
          <h1 class="page-title">Aao ji, apna account banao</h1>
          <p class="muted">Save your taste, favourites and orders. Paaji will remember what you love.</p>
          <ul class="perks">
            <li>💛 Personal sujhav from Paaji's taste quiz</li>
            <li>❤️ Favourites and one-tap "Order again"</li>
            <li>📦 Live order tracking</li>
          </ul>
          <div class="guest-card__cta">
            <button type="button" class="btn btn--gold btn--lg" data-auth="signup">${t('signup')}</button>
            <button type="button" class="btn btn--lg" data-auth="login">${t('login')}</button>
          </div>
        </section>
      </div>`;
    view.addEventListener('click', (e) => {
      const b = e.target.closest('[data-auth]');
      if (b) openAuthModal(b.dataset.auth);
    });
    return;
  }

  view.innerHTML = html`<div class="page container">${raw(rangoliLoader(t('loading')))}</div>`;
  await loadCatalog().catch(() => null);
  const profile = store.get('profile') || {};
  const taste = profile.taste_profile || {};
  const { data: orders, error } = await supabase.from('orders')
    .select('id, order_number, status, fulfilment, payment_method, total, created_at, delivery_slot, order_items(sweet_id, variant_id, quantity, price)')
    .order('created_at', { ascending: false }).limit(30);
  if (error) console.warn('[profile] orders', error);

  const favs = favIds().map(getById).filter(Boolean);
  const addresses = Array.isArray(profile.addresses) ? profile.addresses : [];

  view.innerHTML = html`
  <div class="page page--profile container">
    <header class="profile-head">
      <div class="avatar" aria-hidden="true">${(firstName() || '?').slice(0, 1).toUpperCase()}</div>
      <div>
        <h1 class="page-title">Jai Shree Ram, ${firstName()} ji!</h1>
        <p class="muted">${user.email}</p>
      </div>
      <div class="profile-head__actions">
        ${profile.is_admin ? html`<a class="btn btn--festive" href="#/admin">🛠️ Admin panel</a>` : ''}
        <button type="button" class="btn" data-logout>${t('logout')}</button>
      </div>
    </header>

    <section class="panel taste-panel" aria-labelledby="taste-title">
      <header class="panel__head"><h2 id="taste-title">💛 Tuhada swaad</h2>
        <button type="button" class="btn btn--sm" data-quiz>${taste.quiz_done ? t('retake_quiz') : t('take_quiz')}</button></header>
      ${taste.quiz_done ? html`
        <div class="taste-grid">
          <div><p class="muted">Sweetness</p>
            <div class="sweet-meter" role="meter" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${taste.sweetness || 3}" aria-label="Sweetness ${taste.sweetness || 3} of 5">
              ${[1, 2, 3, 4, 5].map((n) => html`<span class="${n <= (taste.sweetness || 3) ? 'is-on' : ''}"></span>`)}</div></div>
          <div><p class="muted">Favourite types</p><p class="chips">${(taste.categories || []).map((c) => html`<span class="chip chip--sm">${CATEGORY_LABELS[c] || c}</span>`)}</p></div>
          <div><p class="muted">Style</p><p><strong>${{ milky: '🥛 Doodh wali', dry_fruit: '🌰 Dry fruit', both: '🤝 Dono' }[taste.prefers] || '—'}</strong></p></div>
          <div><p class="muted">Diet</p><p class="chips">${Object.keys(taste.diet || {}).filter((k) => taste.diet[k]).map((d) => html`<span class="chip chip--sm chip--pista">${t(`d_${d}`)}</span>`)}${Object.values(taste.diet || {}).some(Boolean) ? '' : html`<span class="muted">No restrictions</span>`}</p></div>
          <div class="taste-grid__wide"><p class="muted">Regions</p><p class="chips">${(taste.quiz_answers?.regions || taste.regions || []).map((r) => html`<span class="chip chip--sm">${r}</span>`)}</p></div>
        </div>` : html`<p class="muted">Take the 30-second Mithai Taste Quiz so Paaji can suggest sweets you'll love.</p>`}
    </section>

    <section class="panel" aria-labelledby="orders-title">
      <header class="panel__head"><h2 id="orders-title">📦 ${t('orders')}</h2></header>
      ${orders?.length ? html`<ul class="orders">${orders.map((o) => orderCard(o))}</ul>`
        : raw(emptyState({ icon: '🧾', title: 'No orders yet', text: 'Your first thaali is waiting!', action: '<a class="btn btn--gold" href="#/catalog">Browse mithai</a>' }))}
    </section>

    <section class="panel" aria-labelledby="favs-title">
      <header class="panel__head"><h2 id="favs-title">❤️ ${t('favourites')}</h2></header>
      ${favs.length ? html`<div class="grid grid--compact">${favs.map((s) => sweetCard(s, { compact: true }))}</div>`
        : html`<p class="muted">Tap the heart on any sweet to save it here.</p>`}
    </section>

    <section class="panel" aria-labelledby="addr-title">
      <header class="panel__head"><h2 id="addr-title">🏠 Saved addresses</h2></header>
      ${addresses.length ? html`<ul class="addresses">${addresses.map((a, i) => html`
        <li class="address"><p><strong>${a.name || 'Home'}</strong><br>${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city || 'Muzaffarnagar'} ${a.pincode || ''}<br>${a.phone || ''}</p>
          <button type="button" class="icon-btn icon-btn--sm" data-del-addr="${i}" aria-label="Delete address ${a.line1}"><svg aria-hidden="true"><use href="#i-trash"/></svg></button></li>`)}</ul>`
        : html`<p class="muted">Addresses you use at checkout are saved here.</p>`}
    </section>
  </div>`;

  view.addEventListener('click', async (e) => {
    if (e.target.closest('[data-logout]')) {
      await signOut();
      toast('Logged out. Phir milenge ji!', 'success');
      location.hash = '#/';
    }
    if (e.target.closest('[data-quiz]')) {
      const res = await openQuiz();
      if (res) renderProfile(view);
    }
    const del = e.target.closest('[data-del-addr]');
    if (del) {
      const next = addresses.filter((_, i) => i !== Number(del.dataset.delAddr));
      try { await updateProfile({ addresses: next }); renderProfile(view); } catch (err) { toast(err.message, 'error'); }
    }
  });
}

function orderCard(o) {
  const items = (o.order_items || []).map((i) => ({ ...i, sweet: getById(i.sweet_id) })).filter((i) => i.sweet);
  const date = new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return html`
  <li class="order-card">
    <header class="order-card__head">
      <div><strong>${o.order_number}</strong> <span class="muted">· ${date} · ${o.payment_method === 'cod' ? 'Cash on Delivery' : 'Pay at Shop'}</span></div>
      <strong>${rupees(o.total)}</strong>
    </header>
    ${tracker(o.status, o.fulfilment)}
    <div class="order-card__items">
      ${items.slice(0, 5).map((i) => html`<a class="order-item" href="#/sweet/${i.sweet.slug}" data-open="${i.sweet.slug}">
        ${sweetImage(i.sweet, { size: 'thumb' })}<span>${sweetName(i.sweet)} × ${i.quantity}</span></a>`)}
      ${items.length > 5 ? html`<span class="muted">+${items.length - 5} more</span>` : ''}
    </div>
    <div class="order-card__actions">
      <a class="btn btn--sm" href="#/order/${o.id}">Details</a>
      <button type="button" class="btn btn--gold btn--sm" data-reorder="${o.id}">🔁 Order again</button>
    </div>
  </li>`;
}
