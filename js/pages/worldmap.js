// Mithai World Map — hex-tile maps of India and the world (original artwork).
// Tap a region to see and add its sweets.
import { html, raw, rangoliLoader, $ } from '../ui.js';
import { loadCatalog } from '../catalog.js';
import { sweetCard } from '../cards.js';

// [label, emoji, col, row, regions/countries it covers]
const INDIA = [
  ['Punjab', '🌾', 3, 0, ['Punjab']],
  ['Uttarakhand', '🏔️', 4, 0, ['Uttarakhand']],
  ['Rajasthan', '🏜️', 2, 1, ['Rajasthan']],
  ['UP, Delhi & Awadh', '🕌', 4, 1, ['North India', 'Uttar Pradesh', 'Awadh']],
  ['Bihar', '🍵', 5, 1, ['Bihar']],
  ['North-East', '🌿', 7, 1, ['Assam', 'Manipur']],
  ['Gujarat', '🪁', 1, 2, ['Gujarat']],
  ['Madhya Pradesh', '🐅', 3, 2, ['Madhya Pradesh']],
  ['Bengal', '🐟', 6, 2, ['Bengal']],
  ['Maharashtra', '🐘', 2, 3, ['Maharashtra']],
  ['Odisha', '🛕', 5, 3, ['Odisha']],
  ['Goa', '🏖️', 1, 4, ['Goa']],
  ['Hyderabad', '🏰', 3, 4, ['Hyderabad']],
  ['Andhra', '🌶️', 4, 4, ['Andhra Pradesh']],
  ['Karnataka', '☕', 2, 5, ['Karnataka']],
  ['South India', '🌴', 3, 5, ['South India']],
  ['Kerala', '🛶', 2, 6, ['Kerala']],
  ['Tamil Nadu', '🪔', 3, 6, ['Tamil Nadu']],
];
const WORLD = [
  ['Europe', '🏰', 3, 0, ['France', 'Italy', 'Spain', 'Portugal', 'Greece', 'Austria', 'Germany', 'UK', 'Russia']],
  ['Turkey & Middle East', '🌙', 4, 1, ['Turkey', 'Middle East', 'Iran', 'UAE', 'Afghanistan']],
  ['East Asia', '🏮', 7, 1, ['Japan', 'China', 'Hong Kong', 'Korea']],
  ['North America', '🗽', 0, 1, ['USA', 'Mexico']],
  ['Africa', '🌍', 3, 2, ['Egypt', 'South Africa']],
  ['South Asia', '🛺', 5, 2, ['India', 'Nepal', 'Sri Lanka', 'Bangladesh']],
  ['South-East Asia', '🥭', 6, 3, ['Thailand', 'Philippines', 'Indonesia', 'Malaysia']],
  ['South America', '💃', 1, 3, ['Brazil', 'Argentina']],
  ['Oceania', '🦘', 7, 4, ['Australia']],
];

function sweetsFor(list, tile, world) {
  return list.filter((s) => (world ? s.country !== 'India' && tile[4].includes(s.country) : s.country === 'India' && tile[4].includes(s.region)));
}

function hexMap(list, tiles, world, id) {
  const max = Math.max(1, ...tiles.map((t) => sweetsFor(list, t, world).length));
  const cols = Math.max(...tiles.map((t) => t[2])) + 1.5;
  const rows = Math.max(...tiles.map((t) => t[3])) + 1;
  return html`
  <div class="hexmap" id="${id}" style="--cols:${cols};--rows:${rows}" role="group" aria-label="${world ? 'World' : 'India'} sweet regions">
    ${tiles.map((t, i) => {
      const n = sweetsFor(list, t, world).length;
      const heat = n / max;
      return html`<button type="button" class="hex ${n ? '' : 'is-empty'}" data-tile="${world ? 'w' : 'i'}${i}"
        style="--x:${t[2] + (t[3] % 2 ? 0.5 : 0)};--r:${t[3]};--heat:${heat.toFixed(2)}" ${n ? '' : raw('disabled')}
        aria-label="${t[0]}: ${n} sweets">
        <span class="hex__emoji" aria-hidden="true">${t[1]}</span>
        <span class="hex__label">${t[0]}</span>
        <span class="hex__count">${n}</span>
      </button>`;
    })}
  </div>`;
}

export async function renderWorldMap(view) {
  view.innerHTML = html`<div class="page container">${raw(rangoliLoader('Naksha bana rahe hain…'))}</div>`;
  const list = await loadCatalog();
  view.innerHTML = html`
  <div class="page page--map container">
    <h1 class="page-title">🗺️ Mithai World Map</h1>
    <p class="muted">Bengal se Baklava tak — tap a region to taste it. Brighter tiles have more sweets.</p>
    <div class="maps">
      <section class="map-card" aria-labelledby="map-india"><h2 id="map-india">🪔 Bharat</h2>${hexMap(list, INDIA, false, 'hex-india')}</section>
      <section class="map-card" aria-labelledby="map-world"><h2 id="map-world">🌏 Duniya</h2>${hexMap(list, WORLD, true, 'hex-world')}</section>
    </div>
    <section id="map-results" class="map-results" aria-live="polite"></section>
  </div>`;

  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tile]');
    if (!b) return;
    const world = b.dataset.tile[0] === 'w';
    const tile = (world ? WORLD : INDIA)[Number(b.dataset.tile.slice(1))];
    const sweets = sweetsFor(list, tile, world).sort((a, c) => c.popularity - a.popularity);
    view.querySelectorAll('.hex').forEach((h) => h.classList.toggle('is-active', h === b));
    const out = $('#map-results', view);
    out.innerHTML = html`
      <header class="row__head"><h2 class="row__title">${tile[1]} ${tile[0]} <small class="muted">· ${sweets.length} sweets</small></h2></header>
      <div class="grid">${sweets.map((s) => sweetCard(s))}</div>`;
    out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: `${tile[0]} ki mithaiyan! ${sweets[0] ? `${sweets[0].name} zaroor chakhiye ji.` : ''}`, mood: 'point', group: 'map' } }));
  });
}
