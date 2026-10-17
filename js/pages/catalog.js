// Catalog page: filters, sort, search, paginated grid. State lives in the URL hash.
import { html, raw, rangoliLoader, emptyState, $ } from '../ui.js';
import { t } from '../i18n.js';
import { loadCatalog, filterSweets, search, SORTS, CATEGORY_LABELS, REGIONS, OCCASIONS, sweetsInRegion } from '../catalog.js';
import { sweetCard } from '../cards.js';
import { logEvent } from '../cart.js';

const PAGE = 24;
const DIETS = ['sugar_free', 'vegan', 'jain', 'eggless', 'gluten_free'];
const PRICES = [
  { key: 'u100', label: 'Under ₹100', min: 0, max: 99 },
  { key: '100-200', label: '₹100–200', min: 100, max: 200 },
  { key: '200-350', label: '₹200–350', min: 201, max: 350 },
  { key: '350+', label: '₹350+', min: 351, max: 1e9 },
];

function readState(params) {
  const list = (k) => (params.get(k) ? params.get(k).split(',').filter(Boolean) : []);
  return {
    q: params.get('q') || '',
    category: list('category'),
    region: params.get('region') || '',
    occasion: params.get('occasion') || '',
    sweetness: list('sweetness').map(Number),
    diet: list('diet'),
    price: params.get('price') || '',
    flag: params.get('flag') || '',
    sort: params.get('sort') || 'popular',
    page: Number(params.get('page') || 1),
  };
}

function writeState(st) {
  const p = new URLSearchParams();
  if (st.q) p.set('q', st.q);
  if (st.category.length) p.set('category', st.category.join(','));
  if (st.region) p.set('region', st.region);
  if (st.occasion) p.set('occasion', st.occasion);
  if (st.sweetness.length) p.set('sweetness', st.sweetness.join(','));
  if (st.diet.length) p.set('diet', st.diet.join(','));
  if (st.price) p.set('price', st.price);
  if (st.flag) p.set('flag', st.flag);
  if (st.sort !== 'popular') p.set('sort', st.sort);
  const qs = p.toString();
  history.replaceState(null, '', `#/catalog${qs ? `?${qs}` : ''}`);
}

export async function renderCatalog(app, params) {
  app.innerHTML = html`<div class="page container">${raw(rangoliLoader(t('loading')))}</div>`;
  let all;
  try { all = await loadCatalog(); } catch (err) {
    app.innerHTML = emptyState({ icon: '🙏', title: t('error_load'), text: err.message,
      action: `<button class="btn btn--gold" onclick="location.reload()">${t('retry')}</button>` });
    return;
  }
  const st = readState(params);
  if (st.q) logEvent('search', null, st.q);

  app.innerHTML = html`
  <div class="page page--catalog container">
    <header class="catalog__head">
      <div>
        <h1 class="page-title" id="catalog-title">Saari Mithai</h1>
        <p class="muted" id="catalog-count" aria-live="polite"></p>
      </div>
      <div class="catalog__tools">
        <button type="button" class="btn btn--sm show-mobile" id="filters-toggle" aria-expanded="false" aria-controls="filters">
          <svg aria-hidden="true"><use href="#i-filter"/></svg> ${t('filters')}</button>
        <label class="select">
          <span class="sr-only">${t('sort')}</span>
          <select id="sort-select">
            ${Object.keys(SORTS).map((k) => html`<option value="${k}" ${st.sort === k ? 'selected' : ''}>${t(`s_${k.replace('-', '_')}`)}</option>`)}
          </select>
        </label>
      </div>
    </header>
    <div class="catalog">
      <aside class="filters" id="filters" aria-label="${t('filters')}"></aside>
      <section class="catalog__results" aria-labelledby="catalog-title">
        <div class="active-filters" id="active-filters"></div>
        <div class="grid" id="grid"></div>
        <div class="catalog__more" id="more"></div>
      </section>
    </div>
  </div>`;

  const filtersEl = $('#filters', app);
  const grid = $('#grid', app);

  const apply = (resetPage = true) => {
    if (resetPage) st.page = 1;
    writeState(st);
    renderFilters();
    renderResults();
  };

  function results() {
    let list = all;
    if (st.region) list = sweetsInRegion(list, st.region);
    const pr = PRICES.find((p) => p.key === st.price);
    list = filterSweets(list, {
      category: st.category, occasion: st.occasion || null, sweetness: st.sweetness, diet: st.diet,
      minPrice: pr?.min, maxPrice: pr?.max, flag: st.flag || null,
    });
    if (st.q) {
      const found = search(list, st.q);
      return st.sort === 'popular' ? found : found.sort(SORTS[st.sort]);
    }
    return [...list].sort(SORTS[st.sort] || SORTS.popular);
  }

  function chip(group, value, label, on) {
    return html`<button type="button" class="chip chip--toggle ${on ? 'is-on' : ''}" data-group="${group}"
      data-value="${String(value)}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }

  function renderFilters() {
    filtersEl.innerHTML = html`
      <div class="filters__inner">
        <div class="filter-group"><h3>${t('f_category')}</h3><div class="chips">
          ${Object.entries(CATEGORY_LABELS).map(([k, l]) => chip('category', k, l, st.category.includes(k)))}</div></div>
        <div class="filter-group"><h3>${t('f_diet')}</h3><div class="chips">
          ${DIETS.map((d) => chip('diet', d, t(`d_${d}`), st.diet.includes(d)))}</div></div>
        <div class="filter-group"><h3>${t('f_sweetness')}</h3><div class="chips">
          ${[1, 2, 3, 4, 5].map((n) => chip('sweetness', n, '🍬'.repeat(n), st.sweetness.includes(n)))}</div></div>
        <div class="filter-group"><h3>${t('f_price')}</h3><div class="chips">
          ${PRICES.map((p) => chip('price', p.key, p.label, st.price === p.key))}</div></div>
        <div class="filter-group"><h3>${t('f_region')}</h3><div class="chips">
          ${REGIONS.map((r) => chip('region', r.key, `${r.emoji} ${r.label}`, st.region === r.key))}</div></div>
        <div class="filter-group"><h3>${t('f_occasion')}</h3><div class="chips">
          ${OCCASIONS.map((o) => chip('occasion', o.key, `${o.emoji} ${o.label}`, st.occasion === o.key))}</div></div>
        <button type="button" class="btn btn--sm btn--block" data-clear>${t('clear')}</button>
      </div>`;
  }

  function renderResults() {
    const list = results();
    const shown = list.slice(0, st.page * PAGE);
    $('#catalog-count', app).textContent = t('results', { n: list.length }) + (st.q ? ` · "${st.q}"` : '');
    const active = [
      st.q && ['q', st.q, `🔎 ${st.q}`],
      st.flag && ['flag', st.flag, { new: '✨ New', festive: '🪔 Diwali', world: '🌍 World', bestseller: '🔥 Bestseller' }[st.flag] || st.flag],
      ...st.category.map((c) => ['category', c, CATEGORY_LABELS[c]]),
      ...st.diet.map((d) => ['diet', d, t(`d_${d}`)]),
      ...st.sweetness.map((n) => ['sweetness', n, '🍬'.repeat(n)]),
      st.price && ['price', st.price, PRICES.find((p) => p.key === st.price)?.label],
      st.region && ['region', st.region, REGIONS.find((r) => r.key === st.region)?.label],
      st.occasion && ['occasion', st.occasion, OCCASIONS.find((o) => o.key === st.occasion)?.label],
    ].filter(Boolean);
    $('#active-filters', app).innerHTML = active.length ? html`${active.map(([g, v, l]) => html`
      <button type="button" class="chip chip--active" data-remove="${g}" data-value="${String(v)}" aria-label="Remove filter ${l}">
        ${l} <svg aria-hidden="true"><use href="#i-close"/></svg></button>`)}` : '';

    if (!list.length) {
      const suggestions = [...all].filter((s) => s.in_stock).sort(SORTS.popular).slice(0, 8);
      grid.innerHTML = html`
        ${raw(emptyState({ icon: '🔍', title: t('no_results'), text: t('try_these') }))}
        <div class="grid grid--suggest">${suggestions.map((s) => sweetCard(s))}</div>`;
      document.dispatchEvent(new CustomEvent('ss:say', { detail: { trigger: 'no_result', mood: 'point' } }));
      $('#more', app).innerHTML = '';
      return;
    }
    grid.innerHTML = html`${shown.map((s) => sweetCard(s))}`;
    $('#more', app).innerHTML = shown.length < list.length
      ? html`<button type="button" class="btn" data-more>Aur dikhao (${list.length - shown.length})</button>` : '';
  }

  app.addEventListener('click', (e) => {
    const c = e.target.closest('[data-group]');
    if (c) {
      const { group, value } = c.dataset;
      if (['category', 'diet'].includes(group)) {
        const arr = st[group];
        st[group] = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      } else if (group === 'sweetness') {
        const n = Number(value);
        st.sweetness = st.sweetness.includes(n) ? st.sweetness.filter((x) => x !== n) : [...st.sweetness, n];
      } else {
        st[group] = st[group] === value ? '' : value;
      }
      apply();
      return;
    }
    const r = e.target.closest('[data-remove]');
    if (r) {
      const { remove: g, value } = r.dataset;
      if (Array.isArray(st[g])) st[g] = st[g].filter((x) => String(x) !== value);
      else st[g] = '';
      if (g === 'q') { const si = $('#search-input'); if (si) si.value = ''; }
      apply();
      return;
    }
    if (e.target.closest('[data-clear]')) {
      Object.assign(st, { q: '', category: [], region: '', occasion: '', sweetness: [], diet: [], price: '', flag: '' });
      apply();
      return;
    }
    if (e.target.closest('[data-more]')) { st.page += 1; renderResults(); return; }
    if (e.target.closest('#filters-toggle')) {
      const open = filtersEl.classList.toggle('is-open');
      e.target.closest('#filters-toggle').setAttribute('aria-expanded', String(open));
    }
  });
  $('#sort-select', app).addEventListener('change', (e) => { st.sort = e.target.value; apply(); });

  renderFilters();
  renderResults();
}
