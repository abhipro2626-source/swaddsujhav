// Gift Box Builder: pick 4 / 9 / 16, tap or drag sweets into the box, let Paaji
// fill the rest, choose a ribbon and write a card. Price is live and matches the server.
import { html, raw, rupees, sweetImage, rangoliLoader, toast, $, prefersReducedMotion } from '../ui.js';
import { sweetName } from '../i18n.js';
import { loadCatalog, search, getById, CATEGORY_LABELS } from '../catalog.js';
import { addBox, piecePrice, BOX_FEE } from '../cart.js';
import { forUser, related } from '../recommend.js';
import { openCart } from '../cartDrawer.js';

const RIBBONS = [
  { key: 'gold', label: 'Sona', color: '#F5C542' },
  { key: 'rani', label: 'Rani pink', color: '#E6197A' },
  { key: 'maroon', label: 'Maroon', color: '#6B0F1A' },
  { key: 'pista', label: 'Pista', color: '#8DC63F' },
];
// Sweets that pack well as single pieces in a box.
const BOXABLE = new Set(['barfi', 'laddoo', 'dry-fruit', 'bengali', 'milk-based', 'brittle', 'fried', 'baked', 'world', 'syrup-soaked', 'steamed']);
const say = (text, mood = 'talk') => document.dispatchEvent(new CustomEvent('ss:say', { detail: { text, mood, group: 'box' } }));

export async function renderGiftBox(view) {
  view.innerHTML = html`<div class="page container">${raw(rangoliLoader('Dabba saja rahe hain…'))}</div>`;
  const all = (await loadCatalog()).filter((s) => s.in_stock && BOXABLE.has(s.category) && !/halwa|kheer|payasam|doi|rabri|basundi|shrikhand/i.test(s.name));
  const st = { size: 9, slots: Array(9).fill(null), ribbon: 'gold', message: '', q: '', cat: '' };

  view.innerHTML = html`
  <div class="page page--giftbox container">
    <header class="gb-head">
      <h1 class="page-title">🎁 Gift Box Builder</h1>
      <p class="muted">Apna dabba khud sajao — pick a size, fill it with love, Paaji helps with the rest.</p>
    </header>
    <div class="gb">
      <section class="gb__box-col" aria-labelledby="gb-box-title">
        <h2 id="gb-box-title" class="sr-only">Your box</h2>
        <div class="gb-sizes" role="radiogroup" aria-label="Box size">
          ${[4, 9, 16].map((n) => html`<button type="button" class="chip chip--toggle ${n === st.size ? 'is-on' : ''}" data-size="${n}" role="radio" aria-checked="${n === st.size ? 'true' : 'false'}">${n} pieces · ${rupees(BOX_FEE[n])} box</button>`)}
        </div>
        <div class="gift-box" id="gift-box">
          <div class="gift-box__lid" aria-hidden="true"><span class="gift-box__bow"></span></div>
          <div class="gift-box__grid" id="gb-grid" role="list" aria-label="Box slots"></div>
          <div class="gift-box__ribbon gift-box__ribbon--v" aria-hidden="true"></div>
          <div class="gift-box__ribbon gift-box__ribbon--h" aria-hidden="true"></div>
        </div>
        <div class="gb-actions">
          <button type="button" class="btn" data-fill>🧔🏽 Paaji, bharo!</button>
          <button type="button" class="btn" data-clear>Khaali karo</button>
        </div>
        <fieldset class="gb-ribbons">
          <legend>Ribbon</legend>
          ${RIBBONS.map((r) => html`<label class="ribbon-opt"><input type="radio" name="ribbon" value="${r.key}" ${r.key === st.ribbon ? 'checked' : ''}>
            <span class="ribbon-opt__swatch" style="--c:${r.color}"></span>${r.label}</label>`)}
        </fieldset>
        <label class="field"><span>Message card (optional)</span>
          <textarea name="gb-message" maxlength="200" placeholder="Shubh Deepawali! Mooh meetha karo 🪔"></textarea></label>
        <div class="gb-total" aria-live="polite" id="gb-total"></div>
        <button type="button" class="btn btn--gold btn--lg btn--block" data-add-box disabled>Add box to thaali</button>
      </section>

      <section class="gb__pick-col" aria-labelledby="gb-pick-title">
        <h2 id="gb-pick-title" class="row__title">Mithai chuno</h2>
        <p class="muted small">Tap a sweet to drop it in the next empty slot (or drag it in). Tap a filled slot to remove.</p>
        <div class="gb-filters">
          <label class="search gb-search"><svg class="search__icon" aria-hidden="true"><use href="#i-search"/></svg>
            <span class="sr-only">Search sweets for the box</span><input type="search" id="gb-q" placeholder="Search kaju, laddoo, baklava…"></label>
          <div class="chips" id="gb-cats">
            <button type="button" class="chip chip--toggle is-on" data-cat="">All</button>
            ${['barfi', 'laddoo', 'dry-fruit', 'bengali', 'world', 'brittle'].map((c) => html`<button type="button" class="chip chip--toggle" data-cat="${c}">${CATEGORY_LABELS[c]}</button>`)}
          </div>
        </div>
        <ul class="gb-palette" id="gb-palette" aria-label="Sweets you can add"></ul>
      </section>
    </div>
  </div>`;

  const grid = $('#gb-grid', view);
  const palette = $('#gb-palette', view);

  const total = () => BOX_FEE[st.size] + st.slots.reduce((n, id) => n + (id ? piecePrice(getById(id)) : 0), 0);
  const filled = () => st.slots.filter(Boolean).length;

  function drawBox() {
    grid.className = `gift-box__grid gift-box__grid--${st.size}`;
    $('#gift-box', view).dataset.ribbon = st.ribbon;
    grid.innerHTML = html`${st.slots.map((id, i) => {
      const s = id ? getById(id) : null;
      return s
        ? html`<button type="button" class="gb-slot is-filled" role="listitem" data-slot="${i}" aria-label="Slot ${i + 1}: ${s.name}. Tap to remove">
            ${sweetImage(s, { size: 'thumb' })}<span class="gb-slot__name">${s.name}</span></button>`
        : html`<div class="gb-slot" role="listitem" data-slot="${i}" aria-label="Slot ${i + 1}: empty"><span aria-hidden="true">+</span></div>`;
    })}`;
    const f = filled();
    $('#gb-total', view).innerHTML = html`<span>${f}/${st.size} filled · ${[...new Set(st.slots.filter(Boolean))].length} kinds</span><strong>${rupees(total())}</strong>`;
    $('[data-add-box]', view).disabled = f !== st.size;
    $('[data-add-box]', view).textContent = f === st.size ? `Add box to thaali · ${rupees(total())}` : `Fill ${st.size - f} more slot${st.size - f === 1 ? '' : 's'}`;
  }

  function drawPalette() {
    let list = st.cat ? all.filter((s) => s.category === st.cat) : all;
    if (st.q) list = search(list, st.q);
    palette.innerHTML = html`${list.slice(0, 60).map((s) => html`
      <li><button type="button" class="gb-pick" draggable="true" data-pick="${s.id}" aria-label="Add ${s.name} to the box, ${rupees(piecePrice(s))} per piece">
        ${sweetImage(s, { size: 'thumb' })}<span class="gb-pick__name">${sweetName(s)}</span><span class="gb-pick__price">${rupees(piecePrice(s))}/pc</span></button></li>`)}`;
  }

  function put(id, at = st.slots.indexOf(null)) {
    if (at < 0) { toast('Dabba bhar gaya ji! Tap a slot to swap.', 'info', 1800); return; }
    st.slots[at] = Number(id);
    drawBox();
    const el = grid.querySelector(`[data-slot="${at}"]`);
    if (el && !prefersReducedMotion()) el.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.08)' }, { transform: 'scale(1)', opacity: 1 }], { duration: 360, easing: 'ease-out' });
    if (filled() === st.size) say('Wah ji, dabba taiyaar! Ribbon chuniye aur thaali mein daaliye.', 'celebrate');
  }

  function resize(n) {
    const kept = st.slots.filter(Boolean).slice(0, n);
    st.size = n;
    st.slots = [...kept, ...Array(n - kept.length).fill(null)];
    view.querySelectorAll('button[data-size]').forEach((b) => { const on = Number(b.dataset.size) === n; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
    drawBox();
  }

  async function paajiFill() {
    const empty = st.slots.map((v, i) => (v ? null : i)).filter((i) => i != null);
    if (!empty.length) { say('Dabba toh pehle hi bhara hai ji!'); return; }
    say('Rukiye ji, main sajaata hoon…', 'think');
    const chosen = st.slots.filter(Boolean).map(getById);
    let picks = [];
    try {
      if (chosen.length) {
        const rel = await Promise.all(chosen.slice(0, 3).map((s) => related(s, 'together', 6).then((r) => r.items).catch(() => [])));
        picks.push(...rel.flat());
      }
      picks.push(...(await forUser({ limit: 24 })).items);
    } catch { /* fall back to bestsellers */ }
    picks.push(...[...all].sort((a, b) => b.popularity - a.popularity));
    // Variety: prefer kinds not already in the box, at most 2 of any category.
    const inBox = new Set(st.slots.filter(Boolean));
    const perCat = {};
    st.slots.filter(Boolean).forEach((id) => { const c = getById(id)?.category; perCat[c] = (perCat[c] || 0) + 1; });
    const allowed = new Set(all.map((s) => s.id));
    const queue = [];
    for (const s of picks) {
      if (!allowed.has(s.id) || inBox.has(s.id) || queue.includes(s.id)) continue;
      if ((perCat[s.category] || 0) >= Math.max(2, Math.ceil(st.size / 4))) continue;
      perCat[s.category] = (perCat[s.category] || 0) + 1;
      queue.push(s.id);
      if (queue.length >= empty.length) break;
    }
    empty.forEach((slot, k) => { if (queue[k]) setTimeout(() => put(queue[k], slot), prefersReducedMotion() ? 0 : k * 90); });
  }

  view.addEventListener('click', async (e) => {
    const size = e.target.closest('button[data-size]');
    if (size) { resize(Number(size.dataset.size)); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { put(pick.dataset.pick); return; }
    const slot = e.target.closest('.gb-slot.is-filled');
    if (slot) { st.slots[Number(slot.dataset.slot)] = null; drawBox(); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      st.cat = cat.dataset.cat;
      view.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('is-on', b === cat));
      drawPalette();
      return;
    }
    if (e.target.closest('[data-fill]')) { paajiFill(); return; }
    if (e.target.closest('[data-clear]')) { st.slots = Array(st.size).fill(null); drawBox(); return; }
    if (e.target.closest('[data-add-box]')) {
      const btn = e.target.closest('[data-add-box]');
      btn.disabled = true;
      try {
        await addBox({ size: st.size, ribbon: st.ribbon, message: st.message, items: st.slots });
        say(`Sundar dabba ji! ${st.size} mithaiyan, ${RIBBONS.find((r) => r.key === st.ribbon).label} ribbon ke saath.`, 'celebrate');
        st.slots = Array(st.size).fill(null);
        drawBox();
        openCart();
      } catch (err) {
        toast(err.message || 'Could not add the box.', 'error');
        btn.disabled = false;
      }
    }
  });
  view.addEventListener('change', (e) => {
    if (e.target.name === 'ribbon') { st.ribbon = e.target.value; drawBox(); }
  });
  view.addEventListener('input', (e) => {
    if (e.target.name === 'gb-message') st.message = e.target.value;
    if (e.target.id === 'gb-q') { st.q = e.target.value; drawPalette(); }
  });

  // Desktop drag & drop (tap works everywhere).
  view.addEventListener('dragstart', (e) => {
    const p = e.target.closest?.('[data-pick]');
    if (p) { e.dataTransfer.setData('text/plain', p.dataset.pick); e.dataTransfer.effectAllowed = 'copy'; }
  });
  grid.addEventListener('dragover', (e) => { e.preventDefault(); e.target.closest?.('.gb-slot')?.classList.add('is-over'); });
  grid.addEventListener('dragleave', (e) => e.target.closest?.('.gb-slot')?.classList.remove('is-over'));
  grid.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const slot = e.target.closest?.('.gb-slot');
    if (id) put(id, slot ? Number(slot.dataset.slot) : undefined);
  });

  drawBox();
  drawPalette();
  say('Apna dabba khud sajao ji! Khaali jagah rahi toh main bhar dunga.', 'wave');
}
