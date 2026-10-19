// Admin panel (shop owner). Every write is protected server-side by RLS / admin RPCs.
// Tabs: dashboard · orders · inventory · catalog · import · customers · paaji
import { html, raw, rupees, sweetImage, rangoliLoader, emptyState, toast, openModal, $, $$ } from '../ui.js';
import { supabase } from '../supabase.js';
import { store } from '../state.js';
import { loadCatalog, getById, CATEGORY_LABELS } from '../catalog.js';
import { API_BASE } from '../config.js';
import { tracker } from './profile.js';

const TABS = [
  ['dashboard', '📊', 'Dashboard'], ['orders', '📦', 'Orders'], ['inventory', '🏷️', 'Inventory'],
  ['catalog', '🍬', 'Catalog'], ['import', '📥', 'CSV import'], ['customers', '👥', 'Customers'], ['paaji', '🧔🏽', 'Paaji & shayari'], ['settings', '⚙️', 'Feature settings'],
];
const STATUSES = ['placed', 'packing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
const STATUS_LABEL = { placed: 'Placed', packing: 'Being packed', ready: 'Ready (pre-order)', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
const CATEGORIES = Object.keys(CATEGORY_LABELS);
const err = (e) => toast(e?.message || String(e), 'error', 5000);

export async function renderAdmin(view, tab) {
  if (typeof tab !== 'string' || !TABS.some((t) => t[0] === tab)) tab = 'dashboard';
  view.innerHTML = html`
  <div class="page page--admin container">
    <header class="admin-head">
      <h1 class="page-title">🛠️ Admin · Swaad Sujhaav</h1>
      <div class="row-actions"><a class="btn btn--festive btn--sm" href="#/owner">📈 Owner dashboard</a><a class="link-btn" href="#/">← Back to shop</a></div>
    </header>
    <nav class="admin-tabs" aria-label="Admin sections">
      ${TABS.map(([k, e, l]) => html`<a href="#/admin/${k}" class="admin-tab ${k === tab ? 'is-active' : ''}" ${k === tab ? raw('aria-current="page"') : ''}>
        <span aria-hidden="true">${e}</span> ${l}</a>`)}
    </nav>
    <section class="admin-body" id="admin-body">${raw(rangoliLoader('Loading…'))}</section>
  </div>`;
  const body = $('#admin-body', view);
  try {
    await { dashboard, orders, inventory, catalog, import: importTab, customers, paaji, settings }[tab](body);
  } catch (e) {
    console.error(e);
    body.innerHTML = emptyState({ icon: '⚠️', title: 'Could not load this section', text: e.message });
  }
}

// ------------------------------------------------------------------ dashboard
async function dashboard(body) {
  const [{ data: s, error }, { data: runs }, health] = await Promise.all([
    supabase.rpc('admin_stats'),
    supabase.from('ml_runs').select('id, started_at, finished_at, status, trigger, metrics, error').order('id', { ascending: false }).limit(5),
    API_BASE === null ? Promise.resolve(null) : fetch(`${API_BASE}/api/health`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (error) throw error;
  const bar = (rows, key) => {
    const max = Math.max(1, ...rows.map((r) => Number(r[key])));
    return html`<ul class="bars">${rows.map((r) => html`<li><span class="bars__label">${r.name}</span>
      <span class="bars__track"><span style="--w:${(Number(r[key]) / max) * 100}%"></span></span><strong>${r[key]}</strong></li>`)}</ul>`;
  };
  const last = runs?.[0];
  body.innerHTML = html`
    <div class="stat-tiles">
      <div class="stat"><span class="stat__label">Orders today</span><strong class="stat__value">${s.orders_today}</strong></div>
      <div class="stat"><span class="stat__label">Revenue today</span><strong class="stat__value">${rupees(s.revenue_today)}</strong></div>
      <div class="stat"><span class="stat__label">Low-stock weights</span><strong class="stat__value">${s.low_stock.length}</strong></div>
      <div class="stat"><span class="stat__label">ML model</span><strong class="stat__value stat__value--sm">${health?.model_ready ? '✅ Live' : last?.status === 'ok' ? '🗄️ Saved picks' : '⏳ Not trained'}</strong></div>
    </div>
    <div class="admin-grid">
      <section class="panel"><h2>🔥 Top sweets</h2>${s.top_sweets.length ? bar(s.top_sweets, 'qty') : html`<p class="muted">No orders yet.</p>`}</section>
      <section class="panel"><h2>🛒 Most added to cart</h2>${s.most_added.length ? bar(s.most_added, 'adds') : html`<p class="muted">No cart activity yet.</p>`}</section>
      <section class="panel"><h2>⚠️ Low stock</h2>
        ${s.low_stock.length ? html`<ul class="low-list">${s.low_stock.map((x) => html`<li><span>${x.name} · ${x.weight_label}</span>
          <strong class="${x.stock_qty === 0 ? 'is-out' : ''}">${x.stock_qty === 0 ? 'Sold out' : `${x.stock_qty} left`}</strong></li>`)}</ul>
          <a class="link-btn" href="#/admin/inventory">Restock in Inventory →</a>` : html`<p class="muted">All stocked up. 🎉</p>`}
      </section>
      <section class="panel"><h2>🤖 Recommendation model</h2>
        ${last ? html`<p>Last run <strong>#${last.id}</strong> · ${last.status} · ${new Date(last.started_at).toLocaleString('en-IN')}</p>
          <p class="muted small">${last.metrics?.embedder ? `Embeddings: ${last.metrics.embedder} · ` : ''}${last.metrics?.users ?? '?'} customers · ${last.metrics?.baskets ?? '?'} orders learned from · catalog coverage ${Math.round((last.metrics?.catalog_coverage || 0) * 100)}%</p>`
          : html`<p class="muted">The model has not run yet. Start the Python server (backend/app.py).</p>`}
        ${health ? '' : html`<p class="muted small">Python server not reachable — the shop uses saved picks and SQL fallbacks.</p>`}
        <button type="button" class="btn btn--gold" data-retrain ${health ? '' : 'disabled'}>Retrain now</button>
      </section>
    </div>`;
  body.querySelector('[data-retrain]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = 'Training…';
    try {
      const r = await fetch(`${API_BASE}/api/admin/retrain`, { method: 'POST', headers: { Authorization: `Bearer ${store.get('session')?.access_token}` } });
      const j = await r.json();
      if (!r.ok || j.status === 'failed') throw new Error(j.detail || j.error || 'Training failed');
      toast(`Model retrained (${j.users ?? '?'} customers, ${j.seconds ?? '?'}s)`, 'success');
      dashboard(body);
    } catch (ex) { err(ex); b.disabled = false; b.textContent = 'Retrain now'; }
  });
}

// ------------------------------------------------------------------ orders
async function orders(body) {
  let filter = '';
  const draw = async () => {
    let q = supabase.from('orders').select('id, order_number, user_id, status, fulfilment, payment_method, address, delivery_slot, gift_message, subtotal, discount, total, created_at, free_sample_sweet_id, order_items(sweet_id, quantity, variant_id), order_gift_boxes(size, ribbon, items)')
      .order('created_at', { ascending: false }).limit(60);
    if (filter) q = q.eq('status', filter);
    const { data, error } = await q;
    if (error) throw error;
    await loadCatalog().catch(() => null);
    body.innerHTML = html`
      <div class="admin-toolbar">
        <div class="chips">${['', ...STATUSES].map((st) => html`<button type="button" class="chip chip--toggle ${filter === st ? 'is-on' : ''}" data-filter="${st}">${st ? STATUS_LABEL[st] : 'All'}</button>`)}</div>
        <button type="button" class="btn btn--sm" data-refresh>↻ Refresh</button>
      </div>
      ${data.length ? html`<ul class="orders">${data.map((o) => html`
        <li class="order-card">
          <header class="order-card__head">
            <div><strong>${o.order_number}</strong> <span class="muted">· ${new Date(o.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
            <strong>${rupees(o.total)}${Number(o.discount) ? html` <small class="muted">(−${rupees(o.discount)})</small>` : ''}</strong>
          </header>
          ${tracker(o.status, o.fulfilment)}
          <p class="small">${o.fulfilment === 'delivery' && o.address ? `🛵 ${o.address.name}, ${o.address.line1}, ${o.address.city} ${o.address.pincode || ''} · 📞 ${o.address.phone || '—'}` : '🏪 Pickup'} · ${o.delivery_slot || ''} · ${o.payment_method === 'cod' ? 'COD' : 'Pay at shop'}</p>
          <p class="small">${(o.order_items || []).map((i) => `${getById(i.sweet_id)?.name || '#' + i.sweet_id} ×${i.quantity}`).join(', ')}
            ${(o.order_gift_boxes || []).map((b) => ` · 🎁 box of ${b.size} (${b.ribbon})`).join('')}
            ${o.free_sample_sweet_id ? ` · ✨ free taste: ${getById(o.free_sample_sweet_id)?.name || ''}` : ''}</p>
          ${o.gift_message ? html`<p class="small gift-msg">“${o.gift_message}”</p>` : ''}
          <label class="field field--inline"><span>Status</span>
            <select data-status="${o.id}">${STATUSES.map((st) => html`<option value="${st}" ${o.status === st ? 'selected' : ''}>${STATUS_LABEL[st]}</option>`)}</select></label>
        </li>`)}</ul>` : raw(emptyState({ icon: '🧾', title: 'No orders here yet' }))}`;
  };
  body.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; draw().catch(err); }
    if (e.target.closest('[data-refresh]')) draw().catch(err);
  });
  body.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    const { error } = await supabase.from('orders').update({ status: sel.value }).eq('id', sel.dataset.status);
    if (error) err(error); else { toast(`Order marked "${STATUS_LABEL[sel.value]}". The customer sees it live.`, 'success'); draw().catch(err); }
  });
  await draw();
}

// ------------------------------------------------------------------ inventory
async function inventory(body) {
  let q = '';
  let lowOnly = false;
  const draw = async () => {
    const list = await loadCatalog({ force: true });
    const rows = list.filter((s) => (!q || s.name.toLowerCase().includes(q) || s.slug.includes(q))
      && (!lowOnly || s.variants.some((v) => v.stock_qty != null && v.stock_qty <= 5) || !s.in_stock))
      .sort((a, b) => a.name.localeCompare(b.name));
    body.innerHTML = html`
      <div class="admin-toolbar">
        <label class="search admin-search"><svg class="search__icon" aria-hidden="true"><use href="#i-search"/></svg>
          <span class="sr-only">Search sweets</span><input type="search" data-q value="${q}" placeholder="Search by name…"></label>
        <label class="check"><input type="checkbox" data-low ${lowOnly ? 'checked' : ''}> Low stock / sold out only</label>
        <span class="muted small">${rows.length} sweets · blank stock = not tracked</span>
      </div>
      <div class="table-wrap"><table class="admin-table">
        <thead><tr><th scope="col">Sweet</th><th scope="col">Weights · price · stock</th><th scope="col">Flags</th><th scope="col"></th></tr></thead>
        <tbody>${rows.map((s) => html`
          <tr data-sweet-row="${s.id}">
            <td><div class="cell-sweet">${sweetImage(s, { size: 'thumb' })}<span><strong>${s.name}</strong><small class="muted">${s.slug}</small></span></div></td>
            <td><div class="variant-edit">${s.variants.map((v) => html`
              <label class="variant-cell"><span>${v.weight_label}</span>
                <input type="number" min="0" step="1" class="mini-input" data-price="${v.id}" value="${Number(v.price)}" aria-label="Price of ${s.name} ${v.weight_label}">
                <input type="number" min="0" step="1" class="mini-input ${v.stock_qty === 0 ? 'is-out' : v.stock_qty != null && v.stock_qty <= 5 ? 'is-low' : ''}" data-stock="${v.id}" value="${v.stock_qty ?? ''}" placeholder="∞" aria-label="Stock of ${s.name} ${v.weight_label}">
              </label>`)}</div></td>
            <td><div class="flag-toggles">
              ${[['in_stock', 'In stock'], ['is_new', 'New'], ['is_festive', 'Deepawali']].map(([k, l]) => html`
                <label class="check check--sm"><input type="checkbox" data-flag="${k}" data-id="${s.id}" ${s[k] ? 'checked' : ''}> ${l}</label>`)}
            </div></td>
            <td><button type="button" class="btn btn--sm btn--gold" data-save-row="${s.id}">Save</button></td>
          </tr>`)}</tbody>
      </table></div>`;
  };
  body.addEventListener('input', (e) => {
    if (e.target.matches('[data-q]')) { q = e.target.value.toLowerCase(); clearTimeout(body._t); body._t = setTimeout(() => draw().then(() => { const i = $('[data-q]', body); i.focus(); i.setSelectionRange(q.length, q.length); }), 250); }
  });
  body.addEventListener('change', async (e) => {
    if (e.target.matches('[data-low]')) { lowOnly = e.target.checked; draw().catch(err); return; }
    const flag = e.target.closest('[data-flag]');
    if (flag) {
      const { error } = await supabase.from('sweets').update({ [flag.dataset.flag]: flag.checked }).eq('id', flag.dataset.id);
      if (error) err(error); else toast('Updated', 'success', 1200);
    }
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save-row]');
    if (!b) return;
    const row = b.closest('tr');
    b.disabled = true;
    try {
      for (const inp of $$('[data-stock]', row)) {
        const id = Number(inp.dataset.stock);
        const price = Number($(`[data-price="${id}"]`, row).value);
        const stock = inp.value === '' ? null : Math.max(0, Math.floor(Number(inp.value)));
        const { error } = await supabase.from('sweet_variants').update({ stock_qty: stock, price }).eq('id', id);
        if (error) throw error;
      }
      toast('Stock & prices saved', 'success');
      draw().catch(err);
    } catch (ex) { err(ex); b.disabled = false; }
  });
  await draw();
}

// ------------------------------------------------------------------ catalog (add / edit / delete / photo)
async function catalog(body) {
  let q = '';
  const draw = async () => {
    const list = await loadCatalog({ force: true });
    const rows = list.filter((s) => !q || s.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    body.innerHTML = html`
      <div class="admin-toolbar">
        <label class="search admin-search"><svg class="search__icon" aria-hidden="true"><use href="#i-search"/></svg>
          <span class="sr-only">Search</span><input type="search" data-q value="${q}" placeholder="Search…"></label>
        <button type="button" class="btn btn--gold" data-new>+ New sweet</button>
      </div>
      <div class="grid grid--compact admin-cards">${rows.map((s) => html`
        <button type="button" class="admin-card" data-edit="${s.id}">${sweetImage(s, { size: 'thumb' })}
          <span><strong>${s.name}</strong><small class="muted">${CATEGORY_LABELS[s.category] || s.category} · ${s.region}</small></span></button>`)}</div>`;
  };
  body.addEventListener('input', (e) => {
    if (e.target.matches('[data-q]')) { q = e.target.value.toLowerCase(); clearTimeout(body._t); body._t = setTimeout(() => draw().then(() => { const i = $('[data-q]', body); i.focus(); }), 250); }
  });
  body.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) editSweet(getById(ed.dataset.edit), draw);
    if (e.target.closest('[data-new]')) editSweet(null, draw);
  });
  await draw();
}

function editSweet(s, onDone) {
  const isNew = !s;
  s = s || { name: '', slug: '', name_hi: '', description: '', origin_story: '', region: '', country: 'India', category: 'barfi', base: 'milk', ingredients: [], sweetness: 3, richness: 3, texture: '', tags: [], occasions: [], is_sugar_free: false, is_vegan: false, is_jain: true, is_eggless: true, is_gluten_free: false, allergens: [], price_unit: '250g', base_price: 200, is_new: true, is_festive: false, in_stock: true, image_url: null, variants: [] };
  const variants = s.variants?.length ? s.variants.map((v) => `${v.weight_label}:${Number(v.price)}:${v.stock_qty ?? ''}`).join('|') : '250g:200:30|500g:390:20|1kg:760:10';
  const field = (name, label, value, attrs = '') => html`<label class="field"><span>${label}</span><input name="${name}" value="${value ?? ''}" ${raw(attrs)}></label>`;
  const m = openModal({ title: isNew ? 'New sweet' : `Edit ${s.name}`, size: 'lg' });
  m.body.innerHTML = html`
    <form class="sweet-form" novalidate>
      <h2>${isNew ? '🍬 New sweet' : `✏️ ${s.name}`}</h2>
      <div class="sweet-form__photo">
        ${sweetImage(s, { size: 'card' })}
        <label class="btn btn--sm">📷 Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" data-photo hidden></label>
        <p class="muted small">JPG/PNG/WebP up to 3 MB. Stored in Supabase Storage.</p>
      </div>
      <div class="form-grid">
        ${field('name', 'Name', s.name, 'required')}
        ${field('name_hi', 'Hindi name', s.name_hi)}
        ${field('slug', 'Slug (URL)', s.slug, `${isNew ? '' : 'readonly'} pattern="[a-z0-9-]+" placeholder="auto from name"`)}
        <label class="field"><span>Category</span><select name="category">${CATEGORIES.map((c) => html`<option value="${c}" ${s.category === c ? 'selected' : ''}>${CATEGORY_LABELS[c]}</option>`)}</select></label>
        ${field('region', 'Region', s.region, 'required placeholder="Bengal, Punjab, Turkey…"')}
        ${field('country', 'Country', s.country)}
        ${field('base', 'Base', s.base, 'placeholder="milk, chhena, besan…"')}
        ${field('texture', 'Texture', s.texture)}
        ${field('sweetness', 'Sweetness (1–5)', s.sweetness, 'type="number" min="1" max="5"')}
        ${field('richness', 'Richness (1–5)', s.richness, 'type="number" min="1" max="5"')}
        <label class="field field--wide"><span>Description</span><textarea name="description">${s.description || ''}</textarea></label>
        <label class="field field--wide"><span>Origin story</span><textarea name="origin_story">${s.origin_story || ''}</textarea></label>
        <label class="field field--wide"><span>Ingredients (comma separated)</span><input name="ingredients" value="${(s.ingredients || []).join(', ')}"></label>
        <label class="field"><span>Tags</span><input name="tags" value="${(s.tags || []).join(', ')}" placeholder="bestseller, gift"></label>
        <label class="field"><span>Occasions</span><input name="occasions" value="${(s.occasions || []).join(', ')}" placeholder="diwali, wedding, puja"></label>
        <label class="field"><span>Allergens</span><input name="allergens" value="${(s.allergens || []).join(', ')}" placeholder="milk, tree nuts"></label>
        <label class="field field--wide"><span>Weights · price · stock <small class="muted">(label:price:stock | …, blank stock = untracked)</small></span>
          <input name="variants" value="${variants}"></label>
      </div>
      <div class="flag-toggles">
        ${[['is_sugar_free', 'Sugar-free'], ['is_vegan', 'Vegan'], ['is_jain', 'Jain'], ['is_eggless', 'Eggless'], ['is_gluten_free', 'Gluten-free'], ['is_new', 'New arrival'], ['is_festive', 'Deepawali special'], ['in_stock', 'In stock']]
          .map(([k, l]) => html`<label class="check"><input type="checkbox" name="${k}" ${s[k] ? 'checked' : ''}> ${l}</label>`)}
      </div>
      <div class="sweet-form__actions">
        ${isNew ? '' : html`<button type="button" class="btn btn--danger" data-delete>Delete</button>`}
        <button type="submit" class="btn btn--gold">${isNew ? 'Create sweet' : 'Save changes'}</button>
      </div>
    </form>`;
  let photoUrl = null;
  m.body.querySelector('[data-photo]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast('Photo must be under 3 MB.', 'error'); return; }
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${(s.slug || 'sweet')}-${Date.now()}.${ext}`;
    toast('Uploading photo…', 'info', 1500);
    const { error } = await supabase.storage.from('sweet-images').upload(path, file, { upsert: true, contentType: file.type });
    if (error) { err(error); return; }
    photoUrl = supabase.storage.from('sweet-images').getPublicUrl(path).data.publicUrl;
    m.body.querySelector('.sweet-form__photo .sweet-img').outerHTML = String(sweetImage({ ...s, image_url: photoUrl }, { size: 'card' }));
    toast('Photo uploaded — save to apply.', 'success');
  });
  m.body.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${s.name}? Past orders keep their history; it disappears from the shop.`)) return;
    const { error } = await supabase.from('sweets').update({ in_stock: false }).eq('id', s.id);
    const del = await supabase.from('sweets').delete().eq('id', s.id);
    if (del.error) {
      // Sweets that appear in past orders can't be hard-deleted; hide them instead.
      if (error) err(error); else toast('This sweet has past orders, so it was hidden (marked out of stock) instead.', 'info', 5000);
    } else toast('Sweet deleted', 'success');
    m.close(); onDone().catch(err);
  });
  m.body.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const list = (n) => f.elements[n].value.split(',').map((x) => x.trim()).filter(Boolean).join('|');
    const name = f.elements.name.value.trim();
    if (!name || !f.elements.region.value.trim()) { toast('Name and region are required.', 'error'); return; }
    const row = {
      slug: (f.elements.slug.value.trim() || name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')),
      name, name_hi: f.elements.name_hi.value.trim(), description: f.elements.description.value.trim(),
      origin_story: f.elements.origin_story.value.trim(), region: f.elements.region.value.trim(), country: f.elements.country.value.trim() || 'India',
      category: f.elements.category.value, base: f.elements.base.value.trim() || 'milk', texture: f.elements.texture.value.trim(),
      sweetness: f.elements.sweetness.value, richness: f.elements.richness.value,
      ingredients: list('ingredients'), tags: list('tags'), occasions: list('occasions'), allergens: list('allergens'),
      variants: f.elements.variants.value.trim(),
      base_price: String(f.elements.variants.value.split(':')[1] || s.base_price),
      price_unit: f.elements.variants.value.split(':')[0]?.trim() || s.price_unit,
      image_url: photoUrl || s.image_url || '', image_credit: photoUrl ? 'Photo: Swaad Sujhaav' : (s.image_credit || ''),
    };
    for (const k of ['is_sugar_free', 'is_vegan', 'is_jain', 'is_eggless', 'is_gluten_free', 'is_new', 'is_festive', 'in_stock']) row[k] = String(f.elements[k].checked);
    // Reuse the import RPC: validated server-side, upserts sweet + variants in one go.
    const { data, error } = await supabase.rpc('admin_import_sweets', { p_rows: [row], p_mode: 'catalog' });
    if (error) { err(error); return; }
    if (data.errors?.length) { err(data.errors[0].message); return; }
    if (photoUrl) await supabase.from('sweets').update({ image_url: photoUrl, image_credit: 'Photo: Swaad Sujhaav' }).eq('slug', row.slug);
    toast(isNew ? 'Sweet created ✨' : 'Saved', 'success');
    m.close(); onDone().catch(err);
  });
}

// ------------------------------------------------------------------ CSV import
/** Small RFC 4180 CSV parser (quotes, escaped quotes, commas and newlines in fields). */
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (!clean.length) return { headers: [], records: [] };
  const headers = clean[0].map((h) => h.trim().replace(/^﻿/, '').toLowerCase());
  const records = clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, records };
}

function validate(mode, headers, records) {
  const problems = [];
  const need = mode === 'stock' ? ['slug', 'weight_label', 'stock_qty'] : ['slug', 'name', 'category', 'region', 'variants'];
  const missing = need.filter((h) => !headers.includes(h));
  if (missing.length) problems.push({ row: 0, message: `Missing column(s): ${missing.join(', ')}` });
  records.forEach((r, i) => {
    const n = i + 1;
    if (mode === 'catalog') {
      if (!r.slug || !/^[a-z0-9-]+$/.test(r.slug.toLowerCase())) problems.push({ row: n, message: 'slug must be lowercase letters, numbers and dashes' });
      if (r.category && !CATEGORIES.includes(r.category)) problems.push({ row: n, message: `unknown category "${r.category}"` });
      for (const k of ['sweetness', 'richness']) if (r[k] && !(Number(r[k]) >= 1 && Number(r[k]) <= 5)) problems.push({ row: n, message: `${k} must be 1–5` });
      if (r.variants && !r.variants.split('|').every((p) => /^[^:]+:\d+(\.\d+)?(:\d*)?$/.test(p.trim()))) problems.push({ row: n, message: 'variants must look like 250g:180:40|500g:350:' });
    } else {
      if (r.stock_qty !== '' && !/^\d+$/.test(r.stock_qty)) problems.push({ row: n, message: 'stock_qty must be a whole number (or blank)' });
      if (r.price && !/^\d+(\.\d+)?$/.test(r.price)) problems.push({ row: n, message: 'price must be a number' });
    }
  });
  return problems;
}

async function importTab(body) {
  let mode = 'catalog';
  let parsed = null;
  const draw = () => {
    const problems = parsed ? validate(mode, parsed.headers, parsed.records) : [];
    const blocking = problems.some((p) => p.row === 0);
    body.innerHTML = html`
      <section class="panel">
        <h2>📥 Import from CSV</h2>
        <div class="choice-row" role="radiogroup" aria-label="Import type">
          ${[['catalog', '🍬', 'Catalog', 'Add or update sweets (matched by slug), with weights, prices and stock'], ['stock', '🏷️', 'Stock update', 'Change quantity available (and price) per weight']].map(([v, e, t, d]) => html`
            <label class="choice ${mode === v ? 'is-on' : ''}"><input type="radio" name="mode" value="${v}" ${mode === v ? 'checked' : ''}>
              <span class="choice__e" aria-hidden="true">${e}</span><span><strong>${t}</strong><small class="muted">${d}</small></span></label>`)}
        </div>
        <p class="small">Templates: <a href="supabase/templates/sweets_catalog_template.csv" download>catalog CSV</a> ·
          <a href="supabase/templates/stock_update_template.csv" download>stock CSV</a>. Lists use <code>|</code> (e.g. <code>milk|sugar</code>); variants look like <code>250g:180:40|500g:350:</code>.</p>
        <label class="dropzone" data-drop>
          <input type="file" accept=".csv,text/csv" data-file class="sr-only">
          <span class="dropzone__icon" aria-hidden="true">📄</span>
          <strong>Choose a CSV file</strong><span class="muted small">or drop it here (up to 2000 rows)</span>
        </label>
      </section>
      ${parsed ? html`
      <section class="panel">
        <header class="panel__head"><h2>Preview · ${parsed.records.length} rows</h2>
          <button type="button" class="btn btn--gold" data-run ${blocking || !parsed.records.length ? 'disabled' : ''}>Import ${parsed.records.length} rows</button></header>
        ${problems.length ? html`<div class="import-problems"><strong>${problems.length} issue${problems.length > 1 ? 's' : ''} found</strong>
          <ul>${problems.slice(0, 15).map((p) => html`<li>${p.row ? `Row ${p.row}: ` : ''}${p.message}</li>`)}</ul>
          ${blocking ? '' : html`<p class="muted small">Rows with issues will be reported by the server and skipped; good rows still import.</p>`}</div>` : html`<p class="ok-note">✅ Looks good.</p>`}
        <div class="table-wrap"><table class="admin-table admin-table--preview">
          <thead><tr>${parsed.headers.slice(0, 8).map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
          <tbody>${parsed.records.slice(0, 20).map((r) => html`<tr>${parsed.headers.slice(0, 8).map((h) => html`<td>${(r[h] || '').slice(0, 40)}</td>`)}</tr>`)}</tbody>
        </table></div>
        ${parsed.records.length > 20 ? html`<p class="muted small">Showing the first 20 rows.</p>` : ''}
      </section>` : ''}
      <div id="import-result"></div>`;
  };
  const load = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('CSV must be under 5 MB.', 'error'); return; }
    parsed = parseCSV(await file.text());
    if (parsed.records.length > 2000) { toast('Import at most 2000 rows at a time.', 'error'); parsed.records = parsed.records.slice(0, 2000); }
    draw();
  };
  body.addEventListener('change', (e) => {
    if (e.target.name === 'mode') { mode = e.target.value; draw(); }
    if (e.target.matches('[data-file]')) load(e.target.files?.[0]);
  });
  body.addEventListener('dragover', (e) => { if (e.target.closest('[data-drop]')) { e.preventDefault(); e.target.closest('[data-drop]').classList.add('is-over'); } });
  body.addEventListener('dragleave', (e) => e.target.closest('[data-drop]')?.classList.remove('is-over'));
  body.addEventListener('drop', (e) => { if (e.target.closest('[data-drop]')) { e.preventDefault(); load(e.dataTransfer.files?.[0]); } });
  body.addEventListener('click', async (e) => {
    const run = e.target.closest('[data-run]');
    if (!run) return;
    run.disabled = true; run.textContent = 'Importing…';
    const { data, error } = await supabase.rpc('admin_import_sweets', { p_rows: parsed.records, p_mode: mode });
    const out = $('#import-result', body);
    if (error) { err(error); run.disabled = false; run.textContent = 'Import'; return; }
    await loadCatalog({ force: true }).catch(() => null);
    out.innerHTML = html`<section class="panel">
      <h2>Import finished</h2>
      <p>✅ <strong>${data.inserted}</strong> added · 🔁 <strong>${data.updated}</strong> updated · ⚠️ <strong>${data.errors.length}</strong> skipped</p>
      ${data.errors.length ? html`<ul class="import-problems">${data.errors.slice(0, 50).map((x) => html`<li>Row ${x.row}${x.slug ? ` (${x.slug})` : ''}: ${x.message}</li>`)}</ul>` : ''}
    </section>`;
    toast(`Imported: ${data.inserted} new, ${data.updated} updated`, 'success');
    run.textContent = 'Done';
    out.scrollIntoView({ behavior: 'smooth' });
  });
  draw();
}

// ------------------------------------------------------------------ customers & their choices
async function customers(body) {
  let q = '';
  const draw = async () => {
    const [{ data: users, error }, { data: stats }] = await Promise.all([
      supabase.rpc('admin_list_users', { p_search: q || null }),
      supabase.rpc('admin_choice_stats'),
    ]);
    if (error) throw error;
    const bar = (obj) => {
      const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const max = Math.max(1, ...entries.map((e) => e[1]));
      return entries.length ? html`<ul class="bars">${entries.map(([k, v]) => html`<li><span class="bars__label">${CATEGORY_LABELS[k] || k}</span>
        <span class="bars__track"><span style="--w:${(v / max) * 100}%"></span></span><strong>${v}</strong></li>`)}</ul>` : html`<p class="muted">No data yet.</p>`;
    };
    body.innerHTML = html`
      <div class="stat-tiles">
        <div class="stat"><span class="stat__label">Customers</span><strong class="stat__value">${stats?.users ?? '—'}</strong></div>
        <div class="stat"><span class="stat__label">Took the taste quiz</span><strong class="stat__value">${stats?.quiz_done ?? '—'}</strong></div>
        <div class="stat"><span class="stat__label">Avg. sweetness</span><strong class="stat__value">${stats?.avg_sweetness ?? '—'} / 5</strong></div>
        <div class="stat"><span class="stat__label">Sugar-free customers</span><strong class="stat__value">${stats?.diet?.sugar_free ?? 0}</strong></div>
      </div>
      <div class="admin-grid">
        <section class="panel"><h2>💛 Favourite types (quiz)</h2>${bar(stats?.categories)}</section>
        <section class="panel"><h2>🗺️ Favourite regions</h2>${bar(stats?.regions)}</section>
      </div>
      <section class="panel">
        <header class="panel__head"><h2>👥 Customers</h2>
          <label class="search admin-search"><svg class="search__icon" aria-hidden="true"><use href="#i-search"/></svg>
            <span class="sr-only">Search customers</span><input type="search" data-q value="${q}" placeholder="Name or email…"></label></header>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th scope="col">Customer</th><th scope="col">Taste</th><th scope="col">Orders</th><th scope="col">Spent</th><th scope="col"></th></tr></thead>
          <tbody>${(users || []).map((u) => html`<tr>
            <td><strong>${u.name || '—'}</strong>${u.is_admin ? html` <span class="chip chip--sm chip--pink">admin</span>` : ''}<br><small class="muted">${u.email}</small></td>
            <td><small>${u.taste_profile?.quiz_done ? `🍬${u.taste_profile.sweetness ?? '?'}/5 · ${(u.taste_profile.categories || []).map((c) => CATEGORY_LABELS[c] || c).join(', ') || '—'}${u.taste_profile.diet?.sugar_free ? ' · sugar-free' : ''}` : 'No quiz yet'}</small></td>
            <td>${u.order_count}</td><td>${rupees(u.total_spent)}</td>
            <td><button type="button" class="btn btn--sm" data-user="${u.id}">Edit choices</button></td></tr>`)}</tbody>
        </table></div>
      </section>`;
    body._users = users || [];
  };
  body.addEventListener('input', (e) => {
    if (e.target.matches('[data-q]')) { q = e.target.value.trim(); clearTimeout(body._t); body._t = setTimeout(() => draw().then(() => { const i = $('[data-q]', body); i.focus(); }).catch(err), 300); }
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-user]');
    if (b) editChoices(body._users.find((u) => u.id === b.dataset.user), () => draw().catch(err));
  });
  await draw();
}

function editChoices(u, onDone) {
  const t = { sweetness: 3, categories: [], bases: [], regions: [], prefers: 'both', diet: {}, ...(u.taste_profile || {}) };
  const REGIONS = ['Bengal', 'Odisha', 'Punjab', 'North India', 'Uttar Pradesh', 'Rajasthan', 'Gujarat', 'Maharashtra', 'South India', 'Tamil Nadu', 'Kerala', 'Karnataka', 'Hyderabad', 'Turkey', 'Middle East', 'Italy', 'France', 'Japan'];
  const m = openModal({ title: `Edit choices for ${u.name || u.email}`, size: 'md' });
  const chips = (name, options, selected, labeler = (x) => x) => html`<div class="chips">${options.map((o) => html`
    <label class="chip chip--toggle ${selected.includes(o) ? 'is-on' : ''}"><input type="checkbox" class="sr-only" name="${name}" value="${o}" ${selected.includes(o) ? 'checked' : ''}>${labeler(o)}</label>`)}</div>`;
  m.body.innerHTML = html`
    <form class="choices-form" novalidate>
      <h2>👤 ${u.name || u.email}</h2>
      <p class="muted small">${u.email} · ${u.order_count} orders · ${rupees(u.total_spent)} spent</p>
      <label class="field"><span>Sweetness: <output data-sw>${t.sweetness}</output>/5</span>
        <input type="range" name="sweetness" min="1" max="5" value="${t.sweetness}"></label>
      <fieldset class="fs"><legend>Favourite types</legend>${chips('categories', CATEGORIES, t.categories || [], (c) => CATEGORY_LABELS[c])}</fieldset>
      <fieldset class="fs"><legend>Regions</legend>${chips('regions', REGIONS, t.regions || [])}</fieldset>
      <label class="field"><span>Style</span><select name="prefers">
        ${[['both', 'Both'], ['milky', 'Milky'], ['dry_fruit', 'Dry fruit']].map(([v, l]) => html`<option value="${v}" ${t.prefers === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      <fieldset class="fs"><legend>Diet</legend>${chips('diet', ['sugar_free', 'vegan', 'jain', 'gluten_free', 'eggless'], Object.keys(t.diet || {}).filter((k) => t.diet[k]), (d) => d.replace('_', '-'))}</fieldset>
      <label class="check"><input type="checkbox" name="is_admin" ${u.is_admin ? 'checked' : ''} ${u.id === store.get('user')?.id ? 'disabled' : ''}> Shop admin</label>
      <div class="sweet-form__actions"><button type="submit" class="btn btn--gold">Save choices</button></div>
    </form>`;
  const form = m.body.querySelector('form');
  form.addEventListener('input', (e) => { if (e.target.name === 'sweetness') m.body.querySelector('[data-sw]').textContent = e.target.value; });
  form.addEventListener('change', (e) => { if (e.target.type === 'checkbox' && e.target.closest('.chip')) e.target.closest('.chip').classList.toggle('is-on', e.target.checked); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const all = (n) => [...form.querySelectorAll(`[name=${n}]:checked`)].map((x) => x.value);
    const taste = { ...t, sweetness: Number(form.sweetness.value), categories: all('categories'), regions: all('regions'),
      prefers: form.prefers.value, diet: Object.fromEntries(all('diet').map((d) => [d, true])), quiz_done: true, edited_by_admin: true };
    const { error } = await supabase.rpc('admin_update_user', { p_user_id: u.id, p_taste_profile: taste, p_is_admin: form.is_admin.disabled ? null : form.is_admin.checked });
    if (error) { err(error); return; }
    toast('Choices saved. Recommendations update on the next model run.', 'success');
    m.close(); onDone();
  });
}

// ------------------------------------------------------------------ Paaji lines & shayari
async function paaji(body) {
  const TRIGGERS = ['welcome', 'return', 'add', 'upsell_new', 'upsell_pair', 'mix_nudge', 'cart_idle', 'order', 'no_result', 'fact'];
  const draw = async () => {
    await loadCatalog().catch(() => null);
    const [{ data: lines }, { data: sh }] = await Promise.all([
      supabase.from('paaji_lines').select('*').order('trigger').order('id'),
      supabase.from('shayari').select('*').order('id', { ascending: false }).limit(200),
    ]);
    body.innerHTML = html`
      <div class="admin-grid">
        <section class="panel">
          <h2>🧔🏽 Paaji's lines</h2>
          <p class="muted small">Lines you add here are used instead of the built-in ones for that moment. Use {name}, {sweet}, {added}, {n}, {pct}.</p>
          <form class="line-form" data-add-line>
            <select name="trigger" aria-label="Moment">${TRIGGERS.map((t) => html`<option>${t}</option>`)}</select>
            <input name="text" required placeholder="Ye {sweet} bhi le jao, poore Muzaffarnagar mein nayi hai!" aria-label="Line">
            <button class="btn btn--gold btn--sm">Add</button>
          </form>
          <ul class="line-list">${(lines || []).map((l) => html`<li class="${l.active ? '' : 'is-off'}">
            <span class="chip chip--sm">${l.trigger}</span><span>${l.text_roman}</span>
            <label class="check check--sm"><input type="checkbox" data-line-active="${l.id}" ${l.active ? 'checked' : ''}> on</label>
            <button type="button" class="icon-btn icon-btn--sm" data-line-del="${l.id}" aria-label="Delete line"><svg aria-hidden="true"><use href="#i-trash"/></svg></button></li>`)}</ul>
          ${(lines || []).length ? '' : html`<p class="muted small">No custom lines yet — Paaji uses his built-in bank.</p>`}
        </section>
        <section class="panel">
          <h2>✍️ Shayari (${(sh || []).length})</h2>
          <form class="shayari-form" data-add-sh>
            <select name="sweet_id" aria-label="Sweet"><option value="">General / category</option>${(window.__ssCatalog || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select>
            <select name="occasion" aria-label="Occasion">${['purchase', 'thanks', 'welcome', 'diwali'].map((o) => html`<option>${o}</option>`)}</select>
            <textarea name="text_hi" required placeholder="देवनागरी में शायरी" aria-label="Devanagari"></textarea>
            <textarea name="text_roman" required placeholder="Hinglish (Paaji speaks this)" aria-label="Hinglish"></textarea>
            <input name="text_en" required placeholder="Short English meaning" aria-label="English">
            <button class="btn btn--gold btn--sm">Add shayari</button>
          </form>
          <ul class="sh-list">${(sh || []).map((x) => html`<li>
            <p class="deva">${x.text_hi}</p><p class="muted small">${x.sweet_id ? getById(x.sweet_id)?.name || '' : x.category || 'general'} · ${x.occasion}</p>
            <button type="button" class="icon-btn icon-btn--sm" data-sh-del="${x.id}" aria-label="Delete shayari"><svg aria-hidden="true"><use href="#i-trash"/></svg></button></li>`)}</ul>
        </section>
      </div>`;
  };
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.matches('[data-add-line]')) {
      const { error } = await supabase.from('paaji_lines').insert({ trigger: f.trigger.value, text_roman: f.text.value.trim() });
      if (error) err(error); else { toast('Line added', 'success'); draw().catch(err); }
    }
    if (f.matches('[data-add-sh]')) {
      const { error } = await supabase.from('shayari').insert({ sweet_id: f.sweet_id.value ? Number(f.sweet_id.value) : null, occasion: f.occasion.value,
        text_hi: f.text_hi.value.trim(), text_roman: f.text_roman.value.trim(), text_en: f.text_en.value.trim() });
      if (error) err(error); else { toast('Shayari added', 'success'); draw().catch(err); }
    }
  });
  body.addEventListener('change', async (e) => {
    const a = e.target.closest('[data-line-active]');
    if (a) { const { error } = await supabase.from('paaji_lines').update({ active: a.checked }).eq('id', a.dataset.lineActive); if (error) err(error); }
  });
  body.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-line-del]');
    if (d) { const { error } = await supabase.from('paaji_lines').delete().eq('id', d.dataset.lineDel); if (error) err(error); else draw().catch(err); }
    const s = e.target.closest('[data-sh-del]');
    if (s && confirm('Delete this shayari?')) { const { error } = await supabase.from('shayari').delete().eq('id', s.dataset.shDel); if (error) err(error); else draw().catch(err); }
  });
  await draw();
}

// ------------------------------------------------------------------ feature settings (Feature Pack 2)
// Every rule the new features use is editable here: numbers (app_settings), festivals
// (confirm lunar dates), scratch prizes, Jodi Boxes, namkeen pairings, weather/time rules,
// and the "Hum dhoond ke batayenge" requests from Bhooli Hui Mithai.
const EDITABLE = {
  festivals: { title: '🗓️ Festivals', order: 'starts_on', cols: [['name', 'text'], ['starts_on', 'date'], ['lead_days', 'number'], ['cutoff_hours', 'number'], ['demand_multiplier', 'number'], ['needs_confirmation', 'bool'], ['active', 'bool']] },
  scratch_prizes: { title: '🪔 Scratch prizes', order: 'id', cols: [['label', 'text'], ['kind', 'text'], ['value', 'number'], ['min_order', 'number'], ['weight', 'number'], ['cost_estimate', 'number'], ['active', 'bool']] },
  jodi_boxes: { title: '🥨 Jodi Boxes', order: 'sort_order', cols: [['name', 'text'], ['description', 'text'], ['discount_percent', 'number'], ['active', 'bool']] },
  combo_rules: { title: '🤝 Mithai + namkeen rules', order: 'id', cols: [['mithai_category', 'text'], ['reason', 'text'], ['weight', 'number'], ['active', 'bool']] },
  context_rules: { title: '🌦️ Weather & time rules', order: 'priority', cols: [['condition', 'text'], ['banner_title', 'text'], ['paaji_line', 'text'], ['boost', 'number'], ['active', 'bool']] },
  sweet_requests: { title: '🕵️ "Hum dhoond ke batayenge" requests', order: 'id', cols: [['description', 'ro'], ['contact', 'ro'], ['status', 'text']] },
};

async function settings(body) {
  const [{ data: rows, error }, ...tables] = await Promise.all([
    supabase.from('app_settings').select('*').order('key'),
    ...Object.entries(EDITABLE).map(([t, c]) => supabase.from(t).select('*').order(c.order, { ascending: t !== 'context_rules' }).limit(60)),
  ]);
  if (error) throw error;
  const data = Object.fromEntries(Object.keys(EDITABLE).map((t, i) => [t, tables[i].data || []]));
  const cell = (t, r, [k, type]) => {
    if (type === 'ro') return html`<td>${r[k] ?? ''}</td>`;
    if (type === 'bool') return html`<td><input type="checkbox" data-cell="${t}:${r.id}:${k}" ${r[k] ? 'checked' : ''} aria-label="${k}"></td>`;
    return html`<td><input type="${type}" data-cell="${t}:${r.id}:${k}" value="${r[k] ?? ''}" aria-label="${k}" ${type === 'number' ? raw('step="any"') : ''}></td>`;
  };
  body.innerHTML = html`
    <p class="muted">All Feature Pack rules live here. Changes save as soon as you leave a field. Prices are always recalculated in the database.</p>
    <p><a class="btn btn--festive" href="#/owner">📈 Open the owner dashboard (Kal Kitna Banana Hai?)</a></p>
    <section class="panel"><h2>⚙️ Numbers & rules</h2>
      <div class="admin-grid">${rows.map((r) => html`<label class="field"><span><strong>${r.label || r.key}</strong> <small class="muted">${r.description}</small></span>
        <textarea data-setting="${r.key}" rows="4" spellcheck="false">${JSON.stringify(r.value, null, 1)}</textarea></label>`)}</div></section>
    ${Object.entries(EDITABLE).map(([t, c]) => html`<section class="panel"><h2>${c.title}</h2>
      <div class="table-wrap"><table class="plan-table"><thead><tr>${c.cols.map(([k]) => html`<th>${k.replace(/_/g, ' ')}</th>`)}</tr></thead>
      <tbody>${data[t].map((r) => html`<tr>${c.cols.map((col) => cell(t, r, col))}</tr>`)}</tbody></table></div>
      ${t === 'festivals' ? html`<p class="muted small">Lunar dates marked "needs confirmation" — check the panchang and untick when confirmed.</p>` : ''}</section>`)}`;

  body.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-setting]');
    if (s) {
      let value;
      try { value = JSON.parse(s.value); } catch { toast('That is not valid JSON — check the commas and quotes.', 'error', 4500); return; }
      const { error: er } = await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', s.dataset.setting);
      if (er) err(er); else toast(`Saved ${s.dataset.setting}`, 'success', 1600);
      return;
    }
    const c = e.target.closest('[data-cell]');
    if (c) {
      const [t, id, k] = c.dataset.cell.split(':');
      const v = c.type === 'checkbox' ? c.checked : c.type === 'number' ? Number(c.value) : c.value;
      const { error: er } = await supabase.from(t).update({ [k]: v }).eq('id', id);
      if (er) err(er); else toast('Saved', 'success', 1200);
    }
  });
}
