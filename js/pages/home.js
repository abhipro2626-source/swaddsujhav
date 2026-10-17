// Home page: hero, mood picker, "your usual", Mithai of the Day and the rows.
import { html, raw, rupees, sweetImage, rangoliLoader, emptyState, $, prefersReducedMotion } from '../ui.js';
import { t, sweetName } from '../i18n.js';
import { loadCatalog, filterSweets, SORTS, REGIONS, OCCASIONS, sweetsInRegion, mithaiOfTheDay, msUntilNextMithai } from '../catalog.js';
import { row } from '../cards.js';
import { forUser } from '../recommend.js';
import { store } from '../state.js';
import { supabase } from '../supabase.js';

// Diwali 2026: Sunday 8 November (Kartik Amavasya). Lakshmi Puja muhurat in the
// Delhi–NCR region (nearest to Muzaffarnagar) begins about 5:30 PM IST.
export const DIWALI = new Date('2026-11-08T17:30:00+05:30');

const MOODS = [
  { key: 'celebrating', label: 'Celebrating', emoji: '🎉', occasion: 'diwali' },
  { key: 'light', label: 'Feeling light', emoji: '🍃', occasion: null },
  { key: 'guests', label: 'Guests coming', emoji: '🏡', occasion: 'guests' },
  { key: 'latenight', label: 'Late-night craving', emoji: '🌙', occasion: null },
];

const OFFERS = [
  '🎁 Free Diwali gift box on orders above ₹999',
  '🪔 Diwali Special: 15 festive mithai, freshly made daily',
  '🩺 New sugar-free range — kaju katli, anjeer, gulab jamun',
  '🚚 Same-day delivery across Muzaffarnagar',
];

let timers = [];
const clearTimers = () => { timers.forEach(clearInterval); timers = []; };

export async function renderHome(app) {
  clearTimers();
  app.innerHTML = html`<div class="page page--home">${raw(rangoliLoader(t('loading')))}</div>`;
  let list;
  try {
    list = await loadCatalog();
  } catch (err) {
    console.error(err);
    app.innerHTML = emptyState({ icon: '🙏', title: t('error_load'), text: err.message,
      action: `<button class="btn btn--gold" onclick="location.reload()">${t('retry')}</button>` });
    return;
  }

  const user = store.get('user');
  const motd = mithaiOfTheDay(list);
  const heroSweets = list.filter((s) => s.image_url && (s.is_festive || (s.tags || []).includes('bestseller'))).slice(0, 6);
  const mood = sessionStorage.getItem('ss:mood') || '';

  app.innerHTML = html`
  <div class="page page--home">
    <section class="hero" aria-labelledby="hero-title">
      <div class="toran" aria-hidden="true">${raw(toranSVG())}</div>
      <div class="hero__inner container">
        <div class="hero__copy">
          <p class="hero__kicker">🪔 ${t('hero_kicker')}</p>
          <h1 id="hero-title" class="hero__title">${t('hero_title')}</h1>
          <p class="hero__text">${t('hero_text')}</p>
          <div class="hero__cta">
            <a class="btn btn--gold btn--lg" href="#/catalog?flag=festive">${t('shop_now')}</a>
            <a class="btn btn--lg" href="#/gift-box"><svg aria-hidden="true"><use href="#i-gift"/></svg> Gift Box</a>
          </div>
          <p class="countdown" id="diwali-countdown" aria-live="off"></p>
          <div class="offers" aria-label="Offers"><p class="offers__item" id="offer-text">${OFFERS[0]}</p></div>
        </div>
        <div class="hero__art" aria-hidden="true">
          <div class="hero__plate">
            ${heroSweets.map((s, i) => html`<figure class="float-sweet float-sweet--${i}" data-depth="${(i % 3) + 1}">
              <img src="${s.image_url}" alt="" loading="${i < 2 ? 'eager' : 'lazy'}" referrerpolicy="no-referrer"></figure>`)}
            <span class="hero__sparkle hero__sparkle--a"></span><span class="hero__sparkle hero__sparkle--b"></span>
          </div>
        </div>
      </div>
    </section>

    <div class="container home-body">
      <section class="mood" aria-label="How are you feeling?">
        <p class="mood__label">Aaj ka mood?</p>
        <div class="chips" role="radiogroup" aria-label="Mood">
          ${MOODS.map((m) => html`<button type="button" class="chip chip--toggle ${mood === m.key ? 'is-on' : ''}"
             role="radio" aria-checked="${mood === m.key ? 'true' : 'false'}" data-mood="${m.key}">${m.emoji} ${m.label}</button>`)}
        </div>
      </section>

      <div id="usual-slot"></div>

      <div id="foryou-slot">${row({ id: 'row-foryou', title: user ? t('row_for_you') : t('row_for_you_guest'), items: [] })}</div>

      ${motd ? html`
      <section class="motd" aria-labelledby="motd-title">
        <a class="motd__img" href="#/sweet/${motd.slug}" data-open="${motd.slug}" tabindex="-1">${sweetImage(motd, { size: 'hero' })}</a>
        <div class="motd__copy">
          <p class="motd__kicker">⭐ ${t('motd')}</p>
          <h2 id="motd-title"><a href="#/sweet/${motd.slug}" data-open="${motd.slug}">${sweetName(motd)}</a></h2>
          <p class="muted">${motd.description}</p>
          <p class="motd__price"><strong>${rupees(motd.variants[0]?.price)}</strong> / ${motd.variants[0]?.weight_label}</p>
          <div class="motd__actions">
            <button class="btn btn--gold" data-add="${motd.id}" data-variant="${motd.variants.find((v) => v.stock_qty == null || v.stock_qty > 0)?.id || ''}">${t('add_to_cart')}</button>
            <span class="motd__timer muted">${t('motd_next')} <span id="motd-timer"></span></span>
          </div>
        </div>
      </section>` : ''}

      ${row({ id: 'row-new', title: t('row_new'), sub: 'Bilkul naya, bilkul taaza', href: '#/catalog?flag=new',
              items: filterSweets(list, { flag: 'new', inStock: true }).sort(SORTS.new).slice(0, 14),
              reasons: new Map(list.filter((s) => s.is_new).map((s) => [s.id, { text: 'Naya hai!', kind: 'new' }])) })}
      ${row({ id: 'row-diwali', title: t('row_diwali'), href: '#/catalog?flag=festive',
              items: filterSweets(list, { flag: 'festive', inStock: true }).slice(0, 14) })}
      ${row({ id: 'row-world', title: t('row_world'), sub: 'Gulab jamun se baklava aur mochi tak', href: '#/catalog?flag=world',
              items: filterSweets(list, { flag: 'world', inStock: true }).slice(0, 14) })}
      ${row({ id: 'row-best', title: t('row_best'), href: '#/catalog?sort=popular',
              items: [...list].filter((s) => s.in_stock).sort(SORTS.popular).slice(0, 14),
              reasons: new Map(list.filter((s) => (s.tags || []).includes('bestseller')).map((s) => [s.id, { text: 'Bestseller', kind: 'popular' }])) })}
      ${row({ id: 'row-healthy', title: t('row_healthy'), sub: 'Diabetic-friendly and no added sugar', href: '#/catalog?diet=sugar_free',
              items: list.filter((s) => s.in_stock && (s.is_sugar_free || (s.tags || []).includes('healthy'))).slice(0, 14) })}

      <section class="tiles" aria-labelledby="regions-title">
        <header class="row__head"><h2 id="regions-title" class="row__title">${t('row_region')}</h2>
          <a class="link-btn" href="#/map"><svg aria-hidden="true"><use href="#i-map"/></svg> Mithai World Map</a></header>
        <div class="tile-grid tile-grid--regions">
          ${REGIONS.map((r) => {
            const n = sweetsInRegion(list, r.key).length;
            return n ? html`<a class="tile" href="#/catalog?region=${r.key}">
              <span class="tile__emoji" aria-hidden="true">${r.emoji}</span>
              <span class="tile__label">${r.label}</span><span class="tile__count">${n}</span></a>` : '';
          })}
        </div>
      </section>

      <section class="tiles" aria-labelledby="occasions-title">
        <header class="row__head"><h2 id="occasions-title" class="row__title">${t('row_occasion')}</h2></header>
        <div class="tile-grid tile-grid--occasions">
          ${OCCASIONS.map((o) => html`<a class="tile tile--occasion" href="#/catalog?occasion=${o.key}">
              <span class="tile__emoji" aria-hidden="true">${o.emoji}</span><span class="tile__label">${o.label}</span></a>`)}
        </div>
      </section>

      <section class="extras" aria-label="More from Paaji">
        <a class="extra-card" href="#/gift-box"><span aria-hidden="true">🎁</span><strong>Gift Box Builder</strong><span class="muted">Pick 4, 9 or 16 and fill the box</span></a>
        <a class="extra-card" href="#/budget"><span aria-hidden="true">💰</span><strong>Budget Mode</strong><span class="muted">"₹500 for 10 guests" — Paaji builds the mix</span></a>
        <a class="extra-card" href="#/map"><span aria-hidden="true">🗺️</span><strong>Mithai World Map</strong><span class="muted">Tap a region to taste it</span></a>
      </section>
    </div>
  </div>`;

  startCountdowns();
  startOffers();
  startParallax(app);
  loadForYou(mood);
  loadUsual();

  app.querySelector('.mood')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mood]');
    if (!b) return;
    const next = b.dataset.mood === sessionStorage.getItem('ss:mood') ? '' : b.dataset.mood;
    sessionStorage.setItem('ss:mood', next);
    app.querySelectorAll('[data-mood]').forEach((x) => {
      const on = x.dataset.mood === next;
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const m = MOODS.find((x) => x.key === next);
    if (m) document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: moodLine(m.key), mood: 'point' } }));
    loadForYou(next);
  });
}

function moodLine(key) {
  return {
    celebrating: 'Jashn hai? Phir toh kaju katli aur motichoor bina gal nahi banni!',
    light: 'Halka-phulka? Sugar-free aur dry fruit wali mithai dikhaunda haan ji.',
    guests: 'Mehmaan aa rahe ne? Rasgulla, barfi te laddoo, sab nu pasand aundi hai!',
    latenight: 'Raat di bhookh? Ek gulab jamun ya brownie, koi gal nahi ji!',
  }[key];
}

async function loadForYou(mood) {
  const slot = $('#foryou-slot');
  if (!slot) return;
  const user = store.get('user');
  const m = MOODS.find((x) => x.key === mood);
  try {
    let { items, reasons } = await forUser({ limit: 18, occasion: m?.occasion || null, mood: mood || null });
    if (mood === 'light') items = items.filter((s) => s.sweetness <= 3 || s.is_sugar_free || (s.tags || []).includes('healthy'));
    if (mood === 'latenight') items = [...items].sort((a, b) => (b.category === 'syrup-soaked' || b.category === 'world') - (a.category === 'syrup-soaked' || a.category === 'world'));
    if (mood === 'light' && items.length < 6) {
      const list = await loadCatalog();
      for (const s of list.filter((x) => x.in_stock && (x.is_sugar_free || (x.tags || []).includes('healthy')))) {
        if (!reasons.has(s.id)) { items.push(s); reasons.set(s.id, { text: 'Halka-phulka', kind: 'taste' }); }
      }
    }
    const title = m ? `${m.emoji} Paaji's picks for "${m.label}"` : user ? t('row_for_you') : t('row_for_you_guest');
    slot.innerHTML = row({ id: 'row-foryou', title, sub: user ? 'Tuhadi pasand de hisaab naal' : 'Log in and take the taste quiz for personal picks',
      items: items.slice(0, 14), reasons, empty: 'Paaji is thinking… try again in a moment.' });
  } catch (err) {
    console.warn('[home] recommendations failed', err);
    slot.innerHTML = '';
  }
}

async function loadUsual() {
  const slot = $('#usual-slot');
  const user = store.get('user');
  if (!slot || !user || !supabase) return;
  const { data } = await supabase.from('orders').select('id, created_at, order_items(sweet_id, variant_id, quantity)')
    .order('created_at', { ascending: false }).limit(1);
  const last = data?.[0];
  if (!last?.order_items?.length) return;
  const list = await loadCatalog();
  const sweets = last.order_items.map((i) => list.find((s) => s.id === i.sweet_id)).filter(Boolean);
  if (!sweets.length) return;
  slot.innerHTML = html`
    <section class="usual" aria-label="${t('row_usual')}">
      <div class="usual__thumbs" aria-hidden="true">${sweets.slice(0, 4).map((s) => sweetImage(s, { size: 'thumb' }))}</div>
      <div class="usual__copy">
        <h2>${t('row_usual')}</h2>
        <p class="muted">${sweets.map((s) => sweetName(s)).join(', ')}</p>
      </div>
      <button type="button" class="btn btn--gold" data-reorder="${last.id}">Order again</button>
    </section>`;
}

function startCountdowns() {
  const cd = $('#diwali-countdown');
  const mt = $('#motd-timer');
  const tick = () => {
    const ms = DIWALI - Date.now();
    if (cd) {
      if (ms > 0) {
        const total = Math.floor(ms / 1000);
        const d = Math.floor(total / 86400);
        const h = Math.floor((total % 86400) / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const two = (n) => String(n).padStart(2, '0');
        cd.innerHTML = html`
          <span class="countdown__unit"><span class="countdown__num">${d}</span> din</span>
          <span class="countdown__unit"><span class="countdown__num">${two(h)}</span> ghante</span>
          <span class="countdown__unit"><span class="countdown__num">${two(m)}</span> min</span>
          <span class="countdown__unit"><span class="countdown__num">${two(s)}</span> sec</span>
          <span class="countdown__label">Lakshmi Puja tak · Ravivaar, 8 Nov, shaam 5:30</span>`;
        cd.setAttribute('aria-label', `${d} days ${h} hours ${m} minutes until Diwali Lakshmi Puja, Sunday 8 November, 5:30 PM`);
      } else if (ms > -2 * 86400000) {
        cd.textContent = '🪔 Shubh Deepavali! Lakshmi Puja ki dher saari shubhkaamnayein 🪔';
      } else cd.textContent = '';
    }
    if (mt) {
      const left = msUntilNextMithai();
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      mt.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  };
  tick();
  timers.push(setInterval(tick, 1000));
}

function startOffers() {
  const el = $('#offer-text');
  if (!el) return;
  let i = 0;
  timers.push(setInterval(() => {
    i = (i + 1) % OFFERS.length;
    el.classList.remove('is-in');
    void el.offsetWidth;
    el.textContent = OFFERS[i];
    el.classList.add('is-in');
  }, 4200));
}

function startParallax(app) {
  if (prefersReducedMotion() || matchMedia('(hover: none)').matches) return;
  const hero = app.querySelector('.hero');
  const floats = [...app.querySelectorAll('.float-sweet')];
  if (!hero || !floats.length) return;
  let raf = 0;
  hero.addEventListener('pointermove', (e) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      for (const f of floats) {
        const d = Number(f.dataset.depth);
        f.style.translate = `${x * d * 14}px ${y * d * 10}px`;
      }
    });
  });
}

/** Marigold garland with hanging bells, drawn in code (original artwork). */
function toranSVG() {
  const flowers = [];
  const W = 1200;
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * W;
    const y = 18 + Math.sin((i / 40) * Math.PI) * 26;
    const c = i % 3 === 0 ? '#FF6B1A' : i % 3 === 1 ? '#FFB800' : '#FF9933';
    flowers.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${c}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#C8961E"/>`);
    if (i % 5 === 0 && i > 0 && i < 40) {
      flowers.push(`<g class="toran__drop" style="transform-origin:${x.toFixed(1)}px ${y.toFixed(1)}px">
        <path d="M${x.toFixed(1)} ${y.toFixed(1)}v26" stroke="#8DC63F" stroke-width="2"/>
        <circle cx="${x.toFixed(1)}" cy="${(y + 30).toFixed(1)}" r="6" fill="#FFB800"/>
        <path d="M${(x - 5).toFixed(1)} ${(y + 38).toFixed(1)}h10l-5 9z" fill="#E6197A"/></g>`);
    }
  }
  return `<svg viewBox="0 0 ${W} 90" preserveAspectRatio="none">${flowers.join('')}</svg>`;
}
