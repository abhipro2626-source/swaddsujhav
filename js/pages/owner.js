// Owner dashboard — "Kal Kitna Banana Hai?". Tomorrow's production plan from
// predict_demand(), accuracy chart, sellers, waste, pre-orders, deals, scratch
// cards, and the live buttons (fresh batch, Garam Jalebi Alert). Admin only:
// every function here re-checks is_admin() in Postgres.
import { html, raw, rupees, rangoliLoader, emptyState, toast, openModal, $ } from '../ui.js';
import { supabase } from '../supabase.js';
import { loadCatalog, getById } from '../catalog.js';
import { CONFIG, loadSettings } from '../feature-config.js';
import { paajiSay } from '../lines.js';
import { sendHotPush } from '../push.js';
import { refreshDeals } from '../live.js';

const CHART_JS = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
let chart = null;

const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const delta = (a, b) => {
  const p = pct(a, b);
  if (p == null) return html`<span class="stat__delta muted">vs last week: —</span>`;
  return html`<span class="stat__delta ${p >= 0 ? 'is-up' : 'is-down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% vs last ${new Date().toLocaleDateString('en-IN', { weekday: 'long' })}</span>`;
};

export async function renderOwner(view) {
  view.innerHTML = html`<div class="page container">${raw(rangoliLoader('Hisaab-kitaab ho raha hai…'))}</div>`;
  await Promise.all([loadCatalog(), loadSettings({ force: true }).catch(() => null)]);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [{ data: d, error }, { data: plan, error: pErr }] = await Promise.all([
    supabase.rpc('owner_dashboard'), supabase.rpc('predict_demand', { target_date: null }),
  ]);
  if (error || pErr) { view.innerHTML = emptyState({ icon: '⚠️', title: 'Could not load the dashboard', text: (error || pErr).message }); return; }
  const aov = (x) => (x.orders ? x.revenue / x.orders : 0);
  const mithai = (window.__ssCatalog || []).filter((s) => s.product_type === 'mithai' && s.country === 'India').sort((a, b) => a.name.localeCompare(b.name));
  const hotItems = (window.__ssCatalog || []).filter((s) => ['Jalebi', 'Imarti', 'Samosa', 'Kachori', 'Gulab Jamun', 'Malpua', 'Pyaaz Kachori', 'Gajar Ka Halwa'].includes(s.name));
  const st = { sort: 'make_kg', dir: -1, rows: plan || [] };

  const wasteWeeks = d.waste || [];
  const firstTwo = wasteWeeks.slice(0, 2);
  const lastTwo = wasteWeeks.slice(-2);
  const avg = (arr, k) => (arr.length ? arr.reduce((n, x) => n + Number(x[k]), 0) / arr.length : 0);
  const savedPerWeek = Math.max(0, avg(firstTwo, 'value') - avg(lastTwo, 'value'));

  view.innerHTML = html`
  <div class="page page--admin container owner">
    <header class="admin-head"><h1 class="page-title">📈 Kal Kitna Banana Hai?</h1>
      <div class="row-actions"><a class="link-btn" href="#/admin">← Admin</a><a class="link-btn" href="#/">Shop</a></div></header>

    <section aria-labelledby="today-title"><h2 id="today-title" class="row__title">Today at a glance</h2>
      <div class="stat-tiles">
        <div class="stat"><span class="stat__label">Orders today</span><strong class="stat__value">${d.today.orders}</strong>${delta(d.today.orders, d.last_week.orders)}</div>
        <div class="stat"><span class="stat__label">Revenue today</span><strong class="stat__value">${rupees(d.today.revenue)}</strong>${delta(d.today.revenue, d.last_week.revenue)}</div>
        <div class="stat"><span class="stat__label">Avg order value</span><strong class="stat__value">${rupees(aov(d.today))}</strong>${delta(aov(d.today), aov(d.last_week))}</div>
        <div class="stat"><span class="stat__label">Sold today</span><strong class="stat__value">${d.today.kg} kg</strong>${delta(d.today.kg, d.last_week.kg)}</div>
      </div></section>

    <section class="panel" aria-labelledby="live-title"><header class="panel__head"><h2 id="live-title">⚡ Live controls</h2></header>
      <div class="admin-grid">
        <form class="stack" id="fresh-form" aria-label="Log a fresh batch">
          <h3>🔥 Fresh batch bana</h3>
          <div class="quick-form">
            <label class="field"><span>Sweet</span><input name="sweet" list="mithai-list" required placeholder="Type: kalakand…"></label>
            <label class="field"><span>Kg</span><input name="kg" type="number" min="0.5" max="500" step="0.5" value="5" inputmode="decimal" required></label>
            <label class="field"><span>Made at</span><input name="time" type="time"></label>
            <button type="submit" class="btn btn--gold">Save</button>
          </div>
          <datalist id="mithai-list">${[...mithai, ...(window.__ssCatalog || []).filter((s) => s.product_type === 'namkeen')].map((s) => html`<option value="${s.name}">`)}</datalist>
          <p class="muted small">Shows "Aaj ka Taaza" on every open phone instantly.</p>
        </form>
        <form class="stack" id="hot-form" aria-label="Send a Garam Jalebi Alert">
          <h3>🔥 Garam batch aa raha hai</h3>
          <div class="quick-form">
            <label class="field"><span>Item</span><select name="sweet">${hotItems.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></label>
            <label class="field"><span>Ready in</span><select name="mins"><option value="0">Now</option><option value="10" selected>10 min</option><option value="20">20 min</option><option value="30">30 min</option></select></label>
            <label class="field"><span>Quantity</span><select name="g"><option value="2000">2 kg</option><option value="5000" selected>5 kg</option><option value="10000">10 kg</option></select></label>
            <button type="submit" class="btn btn--festive">Send alert</button>
          </div>
          <p class="muted small">In-app banner for everyone right away + phone notifications for customers who opted in.</p>
        </form>
      </div>
      ${(d.hot || []).length ? html`<table class="plan-table"><thead><tr><th>Recent hot batches</th><th class="num">Ready</th><th class="num">Reserved</th><th class="num">Notified</th><th class="num">Opened</th><th class="num">Reservations</th></tr></thead>
        <tbody>${d.hot.map((h) => html`<tr><td>${h.name}</td><td class="num">${new Date(h.ready_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</td>
          <td class="num">${(h.reserved_g / 1000).toFixed(1)} / ${(h.quantity_g / 1000).toFixed(1)} kg</td><td class="num">${h.notified}</td><td class="num">${h.opened}</td><td class="num">${h.reservations}</td></tr>`)}</tbody></table>` : ''}
      <div class="quick-form" style="margin-top:12px">
        <span class="muted small">Demo switches for judges:</span>
        ${['cold', 'hot', 'rainy'].map((w) => html`<button type="button" class="chip chip--toggle ${CONFIG.demo?.context === w ? 'is-on' : ''}" data-demo-ctx="${w}">${{ cold: '🧣 Cold', hot: '☀️ Hot', rainy: '🌧️ Rainy' }[w]}</button>`)}
        <button type="button" class="chip chip--toggle ${CONFIG.demo?.deal_window ? 'is-on' : ''}" data-demo-deals>⏰ Open deal window now</button>
      </div>
    </section>

    <section class="panel" aria-labelledby="plan-title">
      <header class="panel__head"><div><h2 id="plan-title">🍳 Tomorrow's production plan</h2>
        <p class="muted small">${new Date(`${tomorrow}T00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · safety buffer ${CONFIG.prediction.safety_buffer_kg} kg</p></div>
        <button type="button" class="btn btn--sm" data-print>🖨️ Kitchen view</button></header>
      <div class="table-wrap" id="plan-table"></div>
      <details class="explain"><summary>How this is calculated (simple words)</summary>
        <p>For each sweet Paaji looks at how much sold on the <strong>same weekday</strong> over the last ${CONFIG.prediction.history_weeks} weeks (<code>base</code>).
        Then he adjusts it: if this week is selling more or less than last week (<code>trend</code>, kept between 0.7× and 1.3×), if a festival is coming
        (<code>festival</code> multiplier from the festival calendar), and tomorrow's weather from Open-Meteo (<code>weather</code>: cold boosts halwa, heat boosts kulfi, kept between 0.85× and 1.15×).
        Pre-orders already booked for tomorrow are added on top.</p>
        <p><code>predicted = base × trend × festival × weather + pre-orders</code> · range = ± one standard deviation of past days ·
        <code>make = predicted − current stock + safety buffer</code>, rounded up to 0.5 kg. Every number above has its reason next to it.</p>
      </details>
    </section>

    <section class="panel" aria-labelledby="chart-title"><header class="panel__head"><h2 id="chart-title">🎯 Is the prediction accurate?</h2>
      <span class="muted small">Last 30 days, top 5 sweets — solid = actual kg sold, dashed = what Paaji predicted the day before</span></header>
      <div class="chart-box"><canvas id="demand-chart" aria-label="Actual versus predicted daily sales for the top five sweets" role="img"></canvas></div>
      <p class="muted small" id="chart-score"></p></section>

    <div class="admin-grid">
      <section class="panel"><h2>🔥 Top sellers (30 days)</h2>
        <table class="plan-table"><tbody>${d.top.map((x) => html`<tr><td>${x.name}</td><td class="num">${x.kg} kg</td><td class="num">${rupees(x.revenue)}</td></tr>`)}</tbody></table></section>
      <section class="panel"><h2>🐢 Slow movers (14 days)</h2>
        <table class="plan-table"><tbody>${d.slow.map((x) => html`<tr><td>${x.name}<br><span class="muted small">${x.stock_kg} kg on shelf · sold ${x.kg14} kg</span></td>
          <td class="num"><button type="button" class="btn btn--sm" data-deal-for="${x.id}">Create last-hour deal</button></td></tr>`)}</tbody></table></section>
    </div>

    <div class="admin-grid">
      <section class="panel"><h2>🗑️ Waste tracker</h2>
        <form class="quick-form" id="waste-form">
          <label class="field"><span>Thrown away today (kg)</span><input name="kg" type="number" min="0" step="0.1" required inputmode="decimal"></label>
          <label class="field"><span>Sweet (optional)</span><input name="sweet" list="mithai-list"></label>
          <button type="submit" class="btn btn--sm">Log</button></form>
        <table class="plan-table"><thead><tr><th>Week of</th><th class="num">Waste</th><th class="num">Waste %</th><th class="num">Lost ₹</th></tr></thead>
          <tbody>${wasteWeeks.map((w) => html`<tr><td>${new Date(`${w.week}T00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
            <td class="num">${w.kg} kg</td><td class="num">${w.pct ?? '—'}%</td><td class="num">${rupees(w.value)}</td></tr>`)}</tbody></table>
        <p><strong>Saved since using the app: ~${rupees(savedPerWeek)} / week</strong> <span class="muted small">(first 2 weeks vs last 2 weeks)</span></p></section>
      <section class="panel"><h2>🗓️ Pre-orders</h2>
        ${(d.preorders || []).length ? html`<table class="plan-table"><thead><tr><th>Festival</th><th>Day</th><th class="num">Orders</th><th class="num">Kg</th><th class="num">₹</th></tr></thead>
          <tbody>${d.preorders.map((p) => html`<tr><td>${p.festival || '—'}</td><td>${new Date(`${p.day}T00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
            <td class="num">${p.orders}</td><td class="num">${p.kg}</td><td class="num">${rupees(p.revenue)}</td></tr>`)}</tbody></table>
          <a class="link-btn" href="#/admin/orders">Mark pre-orders ready in Orders →</a>` : html`<p class="muted">No upcoming pre-orders.</p>`}</section>
    </div>

    <div class="stat-tiles">
      <div class="stat"><span class="stat__label">⏰ Deals: kg saved from waste</span><strong class="stat__value">${d.deals.kg_saved} kg</strong><span class="stat__delta">${rupees(d.deals.revenue)} recovered · ${rupees(d.deals.discount)} discount</span></div>
      <div class="stat"><span class="stat__label">🪔 Scratch cards</span><strong class="stat__value">${d.scratch.issued}</strong><span class="stat__delta">${d.scratch.scratched} scratched · ${d.scratch.redeemed} redeemed · cost ${rupees(d.scratch.discount_cost)}</span></div>
      <div class="stat"><span class="stat__label">🕵️ Bhooli Hui Mithai</span><strong class="stat__value">${d.identify.searches}</strong><span class="stat__delta">${d.identify.found} found · ${d.identify.requests} requests to check</span></div>
    </div>
    ${(d.identify.recent || []).length ? html`<section class="panel"><h2>What people described</h2><ul class="low-list">${d.identify.recent.map((r) => html`<li><span>"${r.description}"</span><strong>${r.chosen || (r.success === false ? 'not found' : '—')}</strong></li>`)}</ul></section>` : ''}
  </div>`;

  const drawTable = () => {
    const rows = [...st.rows].sort((a, b) => {
      const x = a[st.sort]; const y = b[st.sort];
      return (typeof x === 'string' ? x.localeCompare(y) : Number(x) - Number(y)) * st.dir;
    });
    const th = (k, l, num) => html`<th class="${num ? 'num' : ''}" aria-sort="${st.sort === k ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${l}${st.sort === k ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
    $('#plan-table', view).innerHTML = html`<table class="plan-table"><thead><tr>
      ${th('name', 'Sweet')}${th('predicted_kg', 'Predicted', true)}${th('low_kg', 'Range', true)}${th('stock_kg', 'Stock', true)}${th('make_kg', 'Make this much', true)}<th>Why</th></tr></thead>
      <tbody>${rows.slice(0, 40).map((r) => html`<tr><td>${r.name}</td><td class="num">${Number(r.predicted_kg).toFixed(1)} kg</td>
        <td class="num">${Number(r.low_kg).toFixed(1)}–${Number(r.high_kg).toFixed(1)}</td><td class="num">${Number(r.stock_kg).toFixed(1)}</td>
        <td class="num make">${Number(r.make_kg).toFixed(1)} kg</td><td class="why">${(r.reasons || []).join(' · ') || 'Normal day'}</td></tr>`)}</tbody></table>`;
  };
  drawTable();
  drawChart(view);

  view.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) { st.dir = st.sort === s.dataset.sort ? -st.dir : (s.dataset.sort === 'name' ? 1 : -1); st.sort = s.dataset.sort; drawTable(); return; }
    if (e.target.closest('[data-print]')) { printView(st.rows, tomorrow); return; }
    const df = e.target.closest('[data-deal-for]');
    if (df) { dealForm(getById(df.dataset.dealFor)); return; }
    const dc = e.target.closest('[data-demo-ctx]');
    if (dc) {
      const next = CONFIG.demo?.context === dc.dataset.demoCtx ? null : dc.dataset.demoCtx;
      await setDemo({ ...CONFIG.demo, context: next });
      toast(next ? `Demo weather: ${next}. Open the shop home to see it.` : 'Demo weather off — live weather.', 'success');
      renderOwner(view);
      return;
    }
    if (e.target.closest('[data-demo-deals]')) {
      await setDemo({ ...CONFIG.demo, deal_window: !CONFIG.demo?.deal_window });
      await refreshDeals().catch(() => {});
      toast(CONFIG.demo.deal_window ? 'Deal window open now (demo). Customers see Last Hour Deals.' : 'Deal window back to normal timing.', 'success');
      renderOwner(view);
    }
  });

  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'fresh-form') {
      const s = (window.__ssCatalog || []).find((x) => x.name.toLowerCase() === f.sweet.value.trim().toLowerCase());
      if (!s) { toast('Sweet ka naam list se chuno ji.', 'error'); return; }
      const made = f.time.value ? new Date(`${new Date().toISOString().slice(0, 10)}T${f.time.value}:00+05:30`).toISOString() : new Date().toISOString();
      const { error: err } = await supabase.rpc('mark_fresh_batch', { p_sweet_id: s.id, p_kg: Number(f.kg.value), p_made_at: made, p_notes: null });
      if (err) { toast(err.message, 'error'); return; }
      toast(`${s.name} — ${f.kg.value} kg taaza batch darj!`, 'success');
      paajiSay('fresh_batch_owner', {}, { mood: 'celebrate' });
      f.reset();
    }
    if (f.id === 'hot-form') {
      const btn = f.querySelector('button');
      btn.disabled = true;
      const { data: h, error: err } = await supabase.rpc('create_hot_batch', { p_sweet_id: Number(f.sweet.value), p_ready_in_minutes: Number(f.mins.value), p_quantity_g: Number(f.g.value) });
      if (err) { toast(err.message, 'error'); btn.disabled = false; return; }
      const push = await sendHotPush(h.id);
      toast(`Garam alert bhej diya! In-app: everyone with the app open${push ? ` · phone: ${push.sent} sent` : ''}.`, 'success', 5000);
      btn.disabled = false;
    }
    if (f.id === 'waste-form') {
      const s = (window.__ssCatalog || []).find((x) => x.name.toLowerCase() === (f.sweet.value || '').trim().toLowerCase());
      const kg = Number(f.kg.value);
      const per = s ? Number(s.variants.find((v) => v.grams === 250)?.price || s.base_price) * 4 : 380;
      const { error: err } = await supabase.from('waste_logs').insert({ kg, sweet_id: s?.id || null, value: Math.round(kg * per), note: 'Owner log' });
      if (err) { toast(err.message, 'error'); return; }
      toast('Waste darj ho gaya. Kal ka plan isse behtar banega.', 'success');
      renderOwner(view);
    }
  });
}

async function setDemo(value) {
  const { error } = await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', 'demo');
  if (error) throw error;
  await loadSettings({ force: true });
}

function dealForm(s) {
  if (!s) return;
  const m = openModal({
    title: 'Create deal', size: 'sm',
    content: html`<form class="stack" id="deal-form"><h2>⏰ Deal on ${s.name}</h2>
      <div class="form-grid">
        <label class="field"><span>Discount %</span><input name="pct" type="number" min="5" max="${CONFIG.deals.max_percent || 30}" value="20" required></label>
        <label class="field"><span>For how long</span><select name="mins"><option value="60">1 hour</option><option value="90" selected>90 minutes</option><option value="180">3 hours</option></select></label>
        <label class="field"><span>Quantity limit (kg)</span><input name="kg" type="number" min="0.5" step="0.5" value="3"></label>
      </div>
      <button type="submit" class="btn btn--gold">Start deal now</button></form>`,
  });
  m.body.querySelector('#deal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const { error } = await supabase.from('deals').insert({
      sweet_id: s.id, percent: Number(f.pct.value), ends_at: new Date(Date.now() + Number(f.mins.value) * 60000).toISOString(),
      qty_limit_kg: Number(f.kg.value) || null,
    });
    if (error) { toast(error.message, 'error'); return; }
    m.close();
    await refreshDeals().catch(() => {});
    toast(`${s.name} pe ${f.pct.value}% deal live! Customers ko turant dikhega.`, 'success');
  });
}

function printView(rows, day) {
  const wrap = document.createElement('div');
  wrap.className = 'print-view';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Kitchen production plan');
  const list = rows.filter((r) => Number(r.make_kg) > 0).sort((a, b) => b.make_kg - a.make_kg);
  wrap.innerHTML = html`<button type="button" class="btn" data-close-print style="float:right">✕ Close</button>
    <h1 style="margin:0 0 4px">Kal ki bhatti — ${new Date(`${day}T00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
    <p>Swaad Sujhaav, Muzaffarnagar · ${list.length} items</p>
    <table><thead><tr><th>Mithai</th><th class="num">Banao</th><th>Kyun</th></tr></thead>
      <tbody>${list.map((r) => html`<tr><td>${r.name}</td><td class="num">${Number(r.make_kg).toFixed(1)} kg</td><td>${(r.reasons || []).join(', ')}</td></tr>`)}</tbody></table>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-close-print]').focus();
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.querySelector('[data-close-print]').addEventListener('click', close);
}

function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHART_JS;
    s.onload = () => resolve(window.Chart);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function drawChart(view) {
  const { data, error } = await supabase.rpc('demand_backtest', { p_days: 30, p_sweet_ids: null });
  const canvas = $('#demand-chart', view);
  if (error || !canvas || !data?.length) { if (canvas) canvas.replaceWith(document.createTextNode('Not enough history yet.')); return; }
  const Chart = await loadChartJs().catch(() => null);
  if (!Chart) return;
  const css = getComputedStyle(document.documentElement);
  const colors = ['--kesar', '--rani-pink', '--royal-purple', '--pista', '--gold-deep'].map((v) => css.getPropertyValue(v).trim());
  const days = [...new Set(data.map((r) => r.day))];
  const ids = [...new Set(data.map((r) => r.sweet_id))];
  const datasets = [];
  let err = 0; let n = 0; let actualSum = 0;
  ids.forEach((id, i) => {
    const rows = data.filter((r) => r.sweet_id === id);
    const name = getById(id)?.name || `#${id}`;
    datasets.push({ label: name, data: rows.map((r) => Number(r.actual_kg)), borderColor: colors[i % 5], backgroundColor: colors[i % 5], tension: 0.3, pointRadius: 0, borderWidth: 2 });
    datasets.push({ label: `${name} (predicted)`, data: rows.map((r) => Number(r.predicted_kg)), borderColor: colors[i % 5], borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, tension: 0.3 });
    for (const r of rows) { err += Math.abs(r.actual_kg - r.predicted_kg); actualSum += Number(r.actual_kg); n++; }
  });
  chart?.destroy();
  chart = new Chart(canvas, {
    type: 'line',
    data: { labels: days.map((d) => new Date(`${d}T00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: css.getPropertyValue('--fg').trim(), filter: (l) => !l.text.endsWith('(predicted)') } } },
      scales: { y: { title: { display: true, text: 'kg per day' }, ticks: { color: css.getPropertyValue('--fg-muted').trim() } },
                x: { ticks: { color: css.getPropertyValue('--fg-muted').trim(), maxTicksLimit: 8 } } },
    },
  });
  const acc = actualSum ? Math.max(0, 100 - Math.round((err / actualSum) * 100)) : 0;
  $('#chart-score', view).textContent = `Prediction accuracy over these days: about ${acc}% (100 − mean absolute error as % of sales).`;
}
