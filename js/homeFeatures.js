// Home page blocks for Feature Pack 2: weather/time banner, last-hour deals,
// Aaj ka Taaza, festival reminders and Jodi Boxes. Each block renders itself
// into a slot and keeps up with live changes (`ss:live`).
import { html, raw, rupees, openModal, toast, $ } from './ui.js';
import { row } from './cards.js';
import { supabase } from './supabase.js';
import { store } from './state.js';
import { loadCatalog, getById, variantById } from './catalog.js';
import { add } from './cart.js';
import { getContext, contextPicks, WEATHER_ICON, setPlace, useMyLocation, place, CITIES } from './context.js';
import { liveDeals, upcomingDeals, dealClock, freshList, startLive } from './live.js';
import { agoText, clock } from './feature-config.js';
import { paajiSay } from './lines.js';

let timers = [];
const once = (key) => { try { if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, '1'); } catch { /* ignore */ } return true; };

export function mountHomeFeatures(app, list) {
  timers.forEach(clearInterval);
  timers = [];
  startLive().catch(() => {});
  renderContext($('#context-slot', app), list);
  renderDeals($('#deals-slot', app), list);
  renderTaaza($('#taaza-slot', app), list);
  renderReminders($('#reminder-slot', app));
  renderJodi($('#jodi-slot', app));
  const onLive = (e) => {
    if (!document.body.contains(app) || document.body.dataset.route !== 'home') { document.removeEventListener('ss:live', onLive); return; }
    if (e.detail.kind === 'deals') renderDeals($('#deals-slot', app), list);
    if (e.detail.kind === 'fresh') renderTaaza($('#taaza-slot', app), list);
  };
  document.addEventListener('ss:live', onLive);
}

// ---------------------------------------------------------------- weather & time
async function renderContext(slot, list) {
  if (!slot) return;
  const ctx = await getContext().catch(() => null);
  if (!ctx || !slot.isConnected) return;
  const lead = ctx.lead;
  const picks = contextPicks(list.filter((s) => s.product_type === 'mithai' || ctx.weather === 'rainy' || ctx.timeOfDay === 'evening'), ctx, 14);
  const reasons = new Map(picks.map((s) => [s.id, { text: lead?.reason || '', kind: 'occasion' }]));
  const icon = lead?.icon || WEATHER_ICON[ctx.weather] || '✨';
  slot.innerHTML = html`
    <section class="feature-banner context-banner" data-weather="${ctx.weather || ''}" aria-labelledby="ctx-title">
      <div class="feature-banner__head">
        <span class="feature-banner__icon" aria-hidden="true">${icon}</span>
        <div>
          <h2 id="ctx-title" class="feature-banner__title">${lead?.banner_title || 'Aaj ke liye Paaji ki sujhaav'}</h2>
          <p class="feature-banner__sub">📍 ${ctx.city}${ctx.temp != null ? ` · ${ctx.temp}°C` : ''}${ctx.source === 'demo' ? ' · demo mode' : ctx.source === 'offline' ? ' · weather offline' : ''} · ${lead?.reason || ''}</p>
        </div>
        <div class="feature-banner__tools">
          <button type="button" class="chip place-chip" data-place>📍 Change city</button>
        </div>
      </div>
      ${picks.length ? raw(row({ id: 'row-context', title: 'Abhi ke liye perfect', items: picks, reasons })) : ''}
    </section>`;
  slot.querySelector('[data-place]')?.addEventListener('click', () => openPlacePicker(() => renderContext(slot, list)));
  if (lead?.paaji_line && once('ss:ctx-greeted')) {
    setTimeout(() => document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: lead.paaji_line, mood: 'point', group: 'context' } })), 2600);
  }
}

function openPlacePicker(done) {
  const cur = place();
  const m = openModal({
    title: 'Aapka shehar', size: 'sm',
    content: html`<div class="stack">
      <h2>📍 Mausam kahan ka dekhein?</h2>
      <p class="muted">Paaji suggests sweets for your weather. Your location is used only to fetch the forecast and is never saved on our server.</p>
      <button type="button" class="btn btn--gold btn--block" data-geo>Use my location</button>
      <label class="field"><span>Or pick a city</span>
        <select data-city>${CITIES().map((c) => html`<option ${cur.city === c ? 'selected' : ''}>${c}</option>`)}</select></label>
      <div class="row-actions"><button type="button" class="btn" data-save-city>Save city</button>
        <button type="button" class="link-btn" data-close>Not now</button></div>
    </div>`,
  });
  m.body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-geo]')) {
      const ok = await useMyLocation();
      if (!ok) { toast('Location nahi mili ji — city chun lo.', 'info'); return; }
      m.close(); done();
    }
    if (e.target.closest('[data-save-city]')) { setPlace({ city: m.body.querySelector('[data-city]').value }); m.close(); done(); }
  });
}

// ---------------------------------------------------------------- last-hour deals
function renderDeals(slot, list) {
  if (!slot) return;
  const c = dealClock();
  const live = liveDeals();
  const soon = upcomingDeals();
  if (!c || (c.phase === 'closed' && !live.length)) { slot.innerHTML = ''; return; }
  const items = (c.phase === 'live' || live.length ? live : soon).map((d) => getById(d.sweet_id)).filter(Boolean)
    .sort((a, b) => (liveDeals().find((d) => d.sweet_id === b.id)?.percent || 0) - (liveDeals().find((d) => d.sweet_id === a.id)?.percent || 0));
  if (!items.length) { slot.innerHTML = ''; return; }
  const isLive = c.phase === 'live' || live.length > 0;
  const target = new Date(isLive ? c.close_at : c.window_start);
  const maxPct = Math.max(0, ...live.map((d) => d.percent));
  slot.innerHTML = html`
    <section class="feature-banner deals-strip" aria-labelledby="deals-title">
      <div class="feature-banner__head">
        <span class="feature-banner__icon" aria-hidden="true">⏰</span>
        <div>
          <h2 id="deals-title" class="feature-banner__title">${isLive ? `Last Hour Deals — upto ${maxPct}% off` : 'Deals shuru hone wale hain!'}</h2>
          <p class="feature-banner__sub">${isLive ? 'Fresh stock that must go today. Discount grows as closing comes near.' : 'Aaj ki taaza mithai, dukaan band hone se pehle sasti.'}</p>
        </div>
        <div class="feature-banner__tools"><span class="muted">${isLive ? 'Closes in' : 'Starts in'}</span> <span class="deal-clock" data-deal-clock>${clock(target - Date.now())}</span></div>
      </div>
      ${raw(row({ id: 'row-deals', title: isLive ? 'Abhi le jao' : 'Jaldi shuru', items: items.slice(0, 14) }))}
    </section>`;
  timers.push(setInterval(() => {
    const el = slot.querySelector('[data-deal-clock]');
    if (el) el.textContent = clock(target - Date.now());
  }, 1000));
  if (isLive && once('ss:deal-said')) paajiSay('deal_live', { pct: maxPct }, { mood: 'point', group: 'deals' });
}

// ---------------------------------------------------------------- Aaj ka Taaza
function renderTaaza(slot, list) {
  if (!slot) return;
  const fresh = freshList();
  const items = fresh.map((f) => getById(f.sweet_id)).filter((s) => s && s.in_stock);
  if (!items.length) { slot.innerHTML = ''; return; }
  const reasons = new Map(fresh.map((f) => [Number(f.sweet_id), { text: `Bana: ${agoText(f.made_at)}`, kind: 'new' }]));
  slot.innerHTML = row({ id: 'row-taaza', title: '🔥 Aaj ka Taaza', sub: 'Aaj subah se bhatti se nikli mithai — sabse taaza pehle', href: '#/catalog?fresh=1', items });
}

// ---------------------------------------------------------------- festival reminders
async function renderReminders(slot) {
  if (!slot || !supabase || !store.get('user')) return;
  const { data } = await supabase.from('festival_reminders').select('festival:festivals(id, slug, name, starts_on, lead_days, emoji, greeting)');
  const today = new Date();
  const due = (data || []).map((r) => r.festival).filter((f) => {
    if (!f) return false;
    const days = Math.ceil((new Date(`${f.starts_on}T00:00`) - today) / 86400000);
    return days >= 0 && days <= f.lead_days;
  }).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  if (!due.length || !slot.isConnected) return;
  const f = due[0];
  const days = Math.ceil((new Date(`${f.starts_on}T00:00`) - today) / 86400000);
  slot.innerHTML = html`
    <section class="feature-banner reminder-banner" aria-label="Festival reminder">
      <div class="feature-banner__head">
        <span class="feature-banner__icon" aria-hidden="true">${f.emoji}</span>
        <div><h2 class="feature-banner__title">${f.name} ${days === 0 ? 'aaj hai!' : `${days} din mein!`}</h2>
          <p class="feature-banner__sub">${f.greeting} Aapne reminder lagaya tha — slot full hone se pehle book karo.</p></div>
        <div class="feature-banner__tools"><a class="btn" href="#/festivals?f=${f.slug}">Book now →</a></div>
      </div>
    </section>`;
  if (once(`ss:remind-${f.slug}`)) paajiSay('festival_book', { fest: f.name }, { mood: 'point', group: 'festival' });
}

// ---------------------------------------------------------------- Jodi Boxes
async function renderJodi(slot) {
  if (!slot || !supabase) return;
  const [{ data }] = await Promise.all([supabase.from('jodi_boxes').select('*').eq('active', true).order('sort_order'), loadCatalog()]);
  if (!data?.length || !slot.isConnected) return;
  const boxes = data.map((j) => {
    const parts = (j.items || []).map((it) => {
      const sweet = (window.__ssCatalog || []).find((s) => s.variants.some((v) => v.id === it.variant_id));
      return sweet ? { sweet, variant: variantById(sweet, it.variant_id), qty: it.qty } : null;
    }).filter(Boolean);
    const full = parts.reduce((n, p) => n + Number(p.variant.price) * p.qty, 0);
    return { ...j, parts, full, price: full - Math.round((full * j.discount_percent) / 100) };
  }).filter((j) => j.parts.length === (j.items || []).length);
  slot.innerHTML = html`
    <section class="tiles" aria-labelledby="jodi-title">
      <header class="row__head"><div><h2 id="jodi-title" class="row__title">🥨 Mithai + Namkeen Jodi Boxes</h2>
        <p class="row__sub muted">Har mehmaan ki thaali mein dono — combo price automatically lagta hai</p></div></header>
      <div class="jodi-grid">${boxes.map((j) => html`
        <article class="jodi-card">
          <span class="jodi-card__emoji" aria-hidden="true">${j.emoji}</span>
          <h3>${j.name}</h3>
          <p class="muted small">${j.description}</p>
          <p class="price"><s class="price__old">${rupees(j.full)}</s> <strong class="price__deal">${rupees(j.price)}</strong> <span class="chip chip--gold">${j.discount_percent}% jodi off</span></p>
          <button type="button" class="btn btn--gold btn--sm" data-jodi="${j.id}">Add jodi</button>
        </article>`)}</div>
    </section>`;
  slot.addEventListener('click', (e) => {
    const b = e.target.closest('[data-jodi]');
    if (!b) return;
    const j = boxes.find((x) => x.id === Number(b.dataset.jodi));
    let ok = true;
    for (const p of j.parts) ok = add(p.sweet, p.variant, p.qty, { silent: true }) && ok;
    if (ok) {
      toast(`${j.name} thaali mein! Combo discount checkout pe lagega.`, 'success');
      paajiSay('combo', { sweet: j.parts[0].sweet.name, added: j.parts[1]?.sweet.name || 'namkeen' }, { mood: 'celebrate' });
    }
  });
}
