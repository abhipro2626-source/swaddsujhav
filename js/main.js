// Boot, router, page transitions and app-wide event handling.
import { checkConnection, isConfigured, supabase } from './supabase.js';
import { $, $$, html, toast, rupees, sweetImage, prefersReducedMotion } from './ui.js';
import { store, local } from './state.js';
import { initAuth, isAdmin } from './auth.js';
import { initLang, toggleLang, applyI18n, t, sweetName } from './i18n.js';
import { loadCatalog, getById, search, firstAvailableVariant, variantById, isVariantAvailable } from './catalog.js';
import { syncCart, add, setQty, count, qtyOf } from './cart.js';
import { loadFavorites, toggleFav } from './favorites.js';
import { refreshCards, flyToCart, tickAgo } from './cards.js';
import { startLive } from './live.js';
import { loadSettings } from './feature-config.js';
import { initCartDrawer, openCart, closeCart } from './cartDrawer.js';
import { needsQuiz, openQuiz } from './quiz.js';
import { DIWALI } from './pages/home.js';
import { loadDeals } from './deals.js';
import { initTrio } from './trio.js';

const app = $('#app');
let currentRoute = null;     // { name, params }
let rendering = 0;

// ------------------------------------------------------------------ routes
const ROUTES = [
  { name: 'home', re: /^\/?$/, load: () => import('./pages/home.js').then((m) => m.renderHome) },
  { name: 'catalog', re: /^\/catalog$/, load: () => import('./pages/catalog.js').then((m) => m.renderCatalog) },
  { name: 'profile', re: /^\/profile$/, load: () => import('./pages/profile.js').then((m) => m.renderProfile) },
  { name: 'checkout', re: /^\/checkout$/, load: () => import('./pages/checkout.js').then((m) => m.renderCheckout) },
  { name: 'order', re: /^\/order\/([\w-]+)$/, load: () => import('./pages/order.js').then((m) => m.renderOrder) },
  { name: 'gift-box', re: /^\/gift-box$/, load: () => import('./pages/giftbox.js').then((m) => m.renderGiftBox) },
  { name: 'budget', re: /^\/budget$/, load: () => import('./pages/budget.js').then((m) => m.renderBudget) },
  { name: 'map', re: /^\/map$/, load: () => import('./pages/worldmap.js').then((m) => m.renderWorldMap) },
  { name: 'admin', re: /^\/admin(?:\/(\w+))?$/, load: () => import('./pages/admin.js').then((m) => m.renderAdmin) },
  { name: 'owner', re: /^\/owner$/, load: () => import('./pages/owner.js').then((m) => m.renderOwner) },
  { name: 'festivals', re: /^\/festivals$/, load: () => import('./pages/festivals.js').then((m) => m.renderFestivals) },
  { name: 'gift-planner', re: /^\/gift-planner$/, load: () => import('./pages/giftplanner.js').then((m) => m.renderGiftPlanner) },
  { name: 'bhooli', re: /^\/bhooli-mithai$/, load: () => import('./pages/bhooli.js').then((m) => m.renderBhooli) },
];

function parseHash() {
  const raw = decodeURIComponent((location.hash || '#/').slice(1));
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(qs) };
}

async function router() {
  const { path, params } = parseHash();

  // Sweet overview opens as a modal on top of the current page.
  const sweetMatch = path.match(/^\/sweet\/([\w-]+)$/);
  if (sweetMatch) {
    if (!currentRoute) await renderRoute(ROUTES[0], [], new URLSearchParams());
    const { openSweet } = await import('./pages/detail.js');
    const back = currentRoute?.hash || '#/';
    const m = await openSweet(sweetMatch[1], {
      onClose: (reason) => {
        if (reason !== 'route' && reason !== 'replace' && location.hash.startsWith('#/sweet/')) {
          history.replaceState(null, '', back);
        }
      },
    });
    if (!m) { toast('Ye mithai nahi mili ji.', 'error'); history.replaceState(null, '', back); }
    return;
  }
  import('./pages/detail.js').then((m) => m.closeSweet()).catch(() => {});

  const route = ROUTES.find((r) => r.re.test(path)) || ROUTES[0];
  const args = path.match(route.re)?.slice(1) || [];
  await renderRoute(route, args, params);
}

async function renderRoute(route, args, params) {
  const id = ++rendering;
  closeCart();
  if ((route.name === 'admin' || route.name === 'owner') && !isAdmin()) {
    toast(store.get('user') ? 'Admins only, ji.' : 'Please log in as the shop admin.', 'info');
    location.hash = '#/profile';
    return;
  }
  const view = document.createElement('div');
  view.className = 'view';
  let render;
  try {
    render = await route.load();
  } catch (err) {
    console.warn(`[router] ${route.name} not available yet`, err);
    render = (v) => {
      v.innerHTML = html`<div class="page container"><div class="empty-state">
        <div class="empty-state__icon" aria-hidden="true">🛠️</div><h2>Paaji is still setting this up</h2>
        <p class="muted">This part of the shop opens very soon.</p><a class="btn btn--gold" href="#/">Back to home</a></div></div>`;
    };
  }
  if (id !== rendering) return;
  const transition = !prefersReducedMotion() && currentRoute && currentRoute.name !== route.name;
  if (transition) app.classList.add('is-leaving');
  if (transition) await new Promise((r) => setTimeout(r, 140));
  app.replaceChildren(view);
  app.classList.remove('is-leaving');
  currentRoute = { name: route.name, args, params, hash: location.hash || '#/' };
  document.body.dataset.route = route.name;
  $$('#bottom-nav [data-route]').forEach((a) => a.classList.toggle('is-active', a.dataset.route === route.name));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  try {
    await render(view, ...(args.length ? args : [params]), params);
  } catch (err) {
    console.error(`[router] ${route.name} failed`, err);
    view.innerHTML = html`<div class="page container"><div class="empty-state"><div class="empty-state__icon">🙏</div>
      <h2>${t('error_load')}</h2><p class="muted">${err.message}</p>
      <button class="btn btn--gold" type="button" onclick="location.reload()">${t('retry')}</button></div></div>`;
  }
  document.dispatchEvent(new CustomEvent('ss:route', { detail: { name: route.name } }));
}

export const rerender = () => {
  if (!currentRoute) return;
  const route = ROUTES.find((r) => r.name === currentRoute.name);
  if (route) renderRoute(route, currentRoute.args, currentRoute.params);
};

// ------------------------------------------------------------------ header
function updateBadges() {
  const n = count();
  for (const id of ['cart-count', 'bn-cart-count']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  }
  $('#cart-btn')?.setAttribute('aria-label', `Open cart, ${n} item${n === 1 ? '' : 's'}`);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  store.set({ theme });
  const btn = $('#theme-btn');
  if (btn) {
    btn.querySelector('use')?.setAttribute('href', theme === 'night' ? '#i-sun' : '#i-moon');
    btn.setAttribute('aria-label', theme === 'night' ? t('theme_day') : t('theme_night'));
    btn.setAttribute('aria-pressed', theme === 'night' ? 'true' : 'false');
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#2C0B1E' : '#FFB800');
}

/** Festival Mode: near Deepawali, evenings open in Deepawali Night unless the user chose otherwise. */
function initialTheme() {
  const saved = local.get('ss:theme');
  if (saved === 'night' || saved === 'day') return saved;
  const days = (DIWALI - Date.now()) / 86400000;
  const hour = new Date().getHours();
  return days < 7 && days > -3 && (hour >= 18 || hour < 5) ? 'night' : 'day';
}

function initSearch() {
  const form = $('#search-form');
  const input = $('#search-input');
  const list = $('#search-suggest');
  if (!form || !input || !list) return;
  let timer = 0;
  let active = -1;
  const close = () => { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const suggest = async () => {
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    const all = await loadCatalog().catch(() => []);
    const found = search(all, q).slice(0, 6);
    if (!found.length) {
      list.innerHTML = html`<li class="search__none">Koi mithai nahi mili — press Enter to search all</li>`;
    } else {
      list.innerHTML = html`${found.map((s, i) => html`
        <li role="option" id="sg-${i}" aria-selected="false">
          <a href="#/sweet/${s.slug}" data-open="${s.slug}">${sweetImage(s, { size: 'thumb' })}
            <span><strong>${sweetName(s)}</strong><small class="muted">${s.region} · ${rupees(s.min_price)}</small></span></a></li>`)}`;
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(suggest, 150); });
  input.addEventListener('keydown', (e) => {
    const opts = $$('li[role=option]', list);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opts.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', opts[active].id);
    } else if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && active >= 0 && opts[active]) {
      e.preventDefault();
      location.hash = opts[active].querySelector('a').getAttribute('href');
      close();
      input.blur();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    close();
    input.blur();
    location.hash = q ? `#/catalog?q=${encodeURIComponent(q)}` : '#/catalog';
  });
  list.addEventListener('click', () => { close(); });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
  $('#bn-search')?.addEventListener('click', () => {
    document.body.classList.add('search-open');
    input.focus();
  });
  input.addEventListener('blur', () => setTimeout(() => document.body.classList.remove('search-open'), 200));
}

// ------------------------------------------------------------------ global actions
async function reorder(orderId) {
  const { data, error } = await supabase.from('order_items').select('sweet_id, variant_id, quantity').eq('order_id', orderId);
  if (error || !data?.length) { toast('Could not load that order.', 'error'); return; }
  await loadCatalog();
  let added = 0;
  const missing = [];
  for (const it of data) {
    const s = getById(it.sweet_id);
    const v = variantById(s, it.variant_id);
    const usable = v && isVariantAvailable(v) && s.in_stock ? v : firstAvailableVariant(s);
    if (s && usable && add(s, usable, it.quantity, { silent: true })) added++;
    else if (s) missing.push(s.name);
  }
  if (added) {
    openCart();
    document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: 'Wahi purani pasand? Bilkul ji, thaali taiyaar hai!', mood: 'point' } }));
  }
  if (missing.length) toast(`Out of stock right now: ${missing.join(', ')}`, 'info', 5000);
}

function initGlobalClicks() {
  document.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
      e.preventDefault();
      await loadCatalog();
      const s = getById(addBtn.dataset.add);
      const v = (addBtn.dataset.variant && variantById(s, addBtn.dataset.variant)) || firstAvailableVariant(s);
      if (s && v && addBtn.dataset.combo) {
        // Namkeen pairing: Paaji says the combo line instead of the usual add line.
        if (add(s, v, 1, { silent: true })) {
          flyToCart(addBtn);
          const { paajiSay } = await import('./lines.js');
          const { lines } = await import('./cart.js');
          const mithai = lines().find((l) => l.sweet.product_type !== 'namkeen')?.sweet;
          paajiSay('combo', { sweet: mithai?.name || 'Mithai', added: s.name }, { mood: 'celebrate', group: 'add' });
        }
        return;
      }
      if (s && v) add(s, v, 1, { from: addBtn });
      return;
    }
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    if (inc || dec) {
      const id = Number((inc || dec).dataset[inc ? 'inc' : 'dec']);
      setQty(id, qtyOf(id) + (inc ? 1 : -1));
      return;
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav); return; }
    const re = e.target.closest('[data-reorder]');
    if (re) { e.preventDefault(); reorder(re.dataset.reorder); return; }
    const sc = e.target.closest('[data-scroll]');
    if (sc) {
      const track = sc.closest('.row')?.querySelector('.row__track');
      track?.scrollBy({ left: Number(sc.dataset.scroll) * track.clientWidth * 0.85, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  });

  $('#cart-btn')?.addEventListener('click', openCart);
  $('#bn-cart')?.addEventListener('click', openCart);
  $('#theme-btn')?.addEventListener('click', () => {
    const next = store.get('theme') === 'night' ? 'day' : 'night';
    local.set('ss:theme', next);
    applyTheme(next);
    if (next === 'night') document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: 'Deepawali ki raat! Diye jala diye hain ji 🪔', mood: 'celebrate' } }));
  });
  $('#lang-btn')?.addEventListener('click', toggleLang);
}

// ------------------------------------------------------------------ boot
function safeSession(key, value) {
  try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); } catch { return null; }
  return null;
}

async function showConnection() {
  const pill = $('#db-status');
  if (!pill) return;
  if (!isConfigured) { pill.dataset.state = 'error'; pill.textContent = 'Shop keys missing — see js/config.js'; return; }
  const { ok, count: n, error } = await checkConnection();
  pill.dataset.state = ok ? 'ok' : 'error';
  pill.textContent = ok ? `Dukaan khuli hai · ${n} mithaiyan ready` : 'Could not reach the shop';
  if (!ok) console.warn('[Mithai Mitra] connection check failed:', error);
}

function revealApp() {
  $('#topbar').hidden = false;
  $('#bottom-nav').hidden = false;
  app.hidden = false;
  $('#paaji-root').hidden = false;
}

function enterShop({ instant = false } = {}) {
  const entry = $('#entry');
  safeSession('ss:entered', '1');
  revealApp();
  if (instant) { entry.remove(); return; }
  entry.classList.add('is-lit');
  setTimeout(() => entry.classList.add('is-opening'), prefersReducedMotion() ? 0 : 450);
  setTimeout(() => {
    entry.remove();
    app.focus({ preventScroll: true });
  }, prefersReducedMotion() ? 50 : 1250);
  document.dispatchEvent(new CustomEvent('ss:entered', { detail: { fromButton: true } }));
}

async function boot() {
  initLang();
  applyTheme(initialTheme());
  applyI18n();
  initGlobalClicks();
  initSearch();
  initCartDrawer();
  showConnection();

  // Optional modules (mascot, voice, effects). The shop works without them.
  for (const [path, fn] of [['./paaji.js', 'initPaaji'], ['./voice.js', 'initVoice'], ['./festive.js', 'initFestive'], ['./hotalert.js', 'initHotAlerts']]) {
    import(path).then((m) => m[fn]?.()).catch((err) => console.debug(`[boot] ${path} skipped`, err.message));
  }

  store.on('cart', () => {
    updateBadges();
    refreshCards(null, getById);
  });
  store.on('boxes', updateBadges);
  document.addEventListener('ss:favs', () => refreshCards(null, getById));
  document.addEventListener('ss:added', (e) => flyToCart(e.detail.from));
  store.on('lang', () => {
    applyI18n();
    applyTheme(store.get('theme'));
    $('#lang-btn .lang-label').textContent = store.get('lang') === 'hi' ? 'EN' : 'हि';
    $('#lang-btn')?.setAttribute('aria-label', t('lang_switch'));
    rerender();
  });
  $('#lang-btn .lang-label').textContent = store.get('lang') === 'hi' ? 'EN' : 'हि';

  loadCatalog().catch((err) => console.warn('[boot] catalog', err));
  loadSettings().catch(() => null);
  startLive().catch((err) => console.debug('[boot] live', err));
  document.addEventListener('ss:live', (e) => {
    if (e.detail?.kind === 'tick') tickAgo();
    else if (e.detail?.kind === 'deals' || e.detail?.kind === 'fresh') refreshCards(null, getById);
  });
  loadDeals().then(() => refreshCards(null, getById));   // show social proof once counts arrive
  initTrio();
  await initAuth();
  await Promise.all([syncCart(), loadFavorites()]);
  updateBadges();

  let lastUser = store.get('user')?.id || null;
  document.addEventListener('ss:auth', async () => {
    const uid = store.get('user')?.id || null;
    if (uid === lastUser) return;
    lastUser = uid;
    await Promise.all([syncCart(), loadFavorites()]);
    rerender();
    if (uid) document.dispatchEvent(new CustomEvent('ss:login'));
    if (uid && needsQuiz()) setTimeout(() => openQuiz({ fromSignup: false }), 600);
  });

  window.addEventListener('hashchange', router);
  if (safeSession('ss:entered')) enterShop({ instant: true });
  $('#enter-btn')?.addEventListener('click', () => enterShop(), { once: true });
  await router();
}

boot();
