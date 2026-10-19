// Garam Jalebi Alert. In-app always works: Supabase Realtime pushes a new hot
// batch to every open app, which shows a big banner with a live countdown and
// a "Mere liye rakh lo" reserve button (oversell-proof in Postgres).
// Browser push is optional (service worker + Edge Function) and falls back silently.
import { html, toast, openModal, prefersReducedMotion } from './ui.js';
import { supabase } from './supabase.js';
import { store, local } from './state.js';
import { loadCatalog, getById, firstAvailableVariant } from './catalog.js';
import { hotBatches, startLive } from './live.js';
import { CONFIG, clock, shopNow } from './feature-config.js';
import { paajiSay } from './lines.js';
import { sweetName } from './i18n.js';

const SHOWN_KEY = 'ss:hot-shown';      // { date, ids: [] } — respect max alerts per day
let banner = null;
let timer = 0;
let prefs = null;

async function loadPrefs() {
  if (!supabase || !store.get('user')) return (prefs = null);
  const { data } = await supabase.from('alert_preferences').select('*').maybeSingle();
  prefs = data;
  return prefs;
}

function inQuietHours(p) {
  if (!p) return false;
  const now = shopNow();
  const mins = now.hour * 60 + now.minute;
  const [qs, qe] = [p.quiet_start, p.quiet_end].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  return qs <= qe ? mins >= qs && mins < qe : mins >= qs || mins < qe;
}

function allowed(batch) {
  if (prefs && !prefs.enabled) return false;
  if (prefs?.sweet_ids?.length && !prefs.sweet_ids.includes(batch.sweet_id)) return false;
  if (inQuietHours(prefs)) return false;
  const day = shopNow().date;
  const seen = local.get(SHOWN_KEY, { date: day, ids: [] });
  const ids = seen.date === day ? seen.ids : [];
  if (ids.includes(batch.id)) return true;              // already counted today
  return ids.length < (CONFIG.alerts.max_per_day || 3);
}

function remember(batch) {
  const day = shopNow().date;
  const seen = local.get(SHOWN_KEY, { date: day, ids: [] });
  const ids = seen.date === day ? seen.ids : [];
  if (!ids.includes(batch.id)) local.set(SHOWN_KEY, { date: day, ids: [...ids, batch.id] });
}

export async function showHot(batch, { force = false } = {}) {
  await loadCatalog().catch(() => null);
  const s = getById(batch.sweet_id);
  if (!s) return;
  if (!force && !allowed(batch)) return;
  remember(batch);
  supabase?.rpc('log_hot_alert', { p_hot_batch_id: batch.id, p_kind: 'shown' }).then(() => {}, () => {});
  banner?.remove();
  clearInterval(timer);
  banner = document.createElement('div');
  banner.className = 'hot-alert';
  banner.setAttribute('role', 'alert');
  document.body.appendChild(banner);
  const draw = () => {
    const b = hotBatches().find((h) => h.id === batch.id) || batch;
    const left = Math.max(0, b.quantity_g - b.reserved_g);
    const ms = new Date(b.ready_at) - Date.now();
    banner.innerHTML = html`
      <span class="hot-alert__flame" aria-hidden="true">🔥</span>
      <div>
        <h3>${ms > 0 ? `Garam ${sweetName(s)} ${Math.ceil(ms / 60000)} minute mein!` : `Garam ${sweetName(s)} kadhai se nikal gayi!`}</h3>
        <p>${ms > 0 ? html`Ready in <strong>${clock(ms)}</strong> · ` : ''}Kitna bacha: <strong>${(left / 1000).toFixed(1)} kg</strong></p>
        <div class="hot-meter" aria-hidden="true"><span style="--w:${(left / b.quantity_g) * 100}%"></span></div>
      </div>
      <button type="button" class="btn btn--sm" data-reserve ${left < 100 ? 'disabled' : ''}>${left < 100 ? 'Khatam!' : 'Mere liye rakh lo'}</button>
      <button type="button" class="hot-alert__x" data-hot-close aria-label="Close alert">×</button>`;
  };
  draw();
  timer = setInterval(draw, 1000);
  const onLive = (e) => { if (e.detail.kind === 'hot') draw(); };
  document.addEventListener('ss:live', onLive);
  banner.addEventListener('click', async (e) => {
    if (e.target.closest('[data-hot-close]')) { clearInterval(timer); document.removeEventListener('ss:live', onLive); banner.remove(); banner = null; return; }
    if (e.target.closest('[data-reserve]')) reserve(batch, s);
  });
  const mins = Math.max(0, Math.ceil((new Date(batch.ready_at) - Date.now()) / 60000));
  paajiSay(mins ? 'hot_alert' : 'hot_alert', { sweet: s.name, mins }, { mood: 'celebrate', priority: 'high', group: 'hot' });
}

async function reserve(batch, s) {
  if (!store.get('user')) {
    toast('Reserve karne ke liye log in karo ji.', 'info');
    const { openAuthModal } = await import('./account.js');
    openAuthModal('login');
    return;
  }
  const max = CONFIG.alerts.reserve_max_grams || 500;
  const m = openModal({
    title: 'Reserve', size: 'sm',
    content: html`<div class="stack">
      <h2>🔥 Kitna rakhein?</h2>
      <p class="muted">Pick up within ${CONFIG.alerts.reserve_minutes || 30} minutes of the batch being ready. Pay at the shop.</p>
      <div class="chips" role="radiogroup">${[250, 500].filter((g) => g <= max).map((g) => html`<button type="button" class="chip chip--toggle" data-grams="${g}">${g} g</button>`)}</div>
    </div>`,
  });
  m.body.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-grams]');
    if (!g) return;
    const { data, error } = await supabase.rpc('reserve_hot_batch', { p_hot_batch_id: batch.id, p_grams: Number(g.dataset.grams) });
    m.close();
    if (error) { toast(error.message, 'error', 4500); return; }
    toast(`Rakh diya ji! ${data.grams} g ${s.name} — ${new Date(data.expires_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} tak le jaana.`, 'success', 6000);
    paajiSay('hot_reserved', { grams: data.grams, sweet: s.name }, { mood: 'celebrate', priority: 'high' });
  });
}

/** The gentle opt-in, only after the customer has used the app a bit. */
function maybeAskOptIn() {
  const visits = (local.get('ss:visits', 0) || 0) + 1;
  local.set('ss:visits', visits);
  if (visits < 3 || local.get('ss:hot-asked') || !store.get('user') || prefs) return;
  setTimeout(() => {
    if (document.querySelector('.modal')) return;
    local.set('ss:hot-asked', true);
    openAlertSettings({ intro: true });
  }, 25000);
}

/** Alert preferences (also opened from the profile page). */
export async function openAlertSettings({ intro = false } = {}) {
  await loadCatalog();
  await loadPrefs();
  const hotItems = (window.__ssCatalog || []).filter((s) => ['Jalebi', 'Imarti', 'Samosa', 'Kachori', 'Gulab Jamun', 'Malpua', 'Pyaaz Kachori', 'Gajar Ka Halwa'].includes(s.name));
  const p = prefs || { enabled: true, sweet_ids: [], quiet_start: '22:00:00', quiet_end: '08:00:00', push: false };
  const m = openModal({
    title: 'Garam alert', size: 'md',
    content: html`<form class="stack" id="alert-form">
      <h2>🔥 Garam alert chahiye?</h2>
      <p class="muted">${intro ? 'Jab kadhai se garam jalebi ya samosa nikle, Paaji turant bataayenge. ' : ''}Max ${CONFIG.alerts.max_per_day} alerts a day, never in quiet hours.</p>
      <label class="check"><input type="checkbox" name="enabled" ${p.enabled ? 'checked' : ''}> Alerts on</label>
      <fieldset><legend>Kis cheez ka alert? <span class="muted small">(none selected = all)</span></legend>
        <div class="chips">${hotItems.map((s) => html`<label class="chip"><input type="checkbox" name="sweet" value="${s.id}" ${p.sweet_ids.includes(s.id) ? 'checked' : ''}> ${s.name}</label>`)}</div></fieldset>
      <div class="form-grid">
        <label class="field"><span>Quiet from</span><input type="time" name="qs" value="${p.quiet_start.slice(0, 5)}"></label>
        <label class="field"><span>Quiet until</span><input type="time" name="qe" value="${p.quiet_end.slice(0, 5)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="push" ${p.push ? 'checked' : ''}> Also send phone notifications (if your browser allows)</label>
      <div class="row-actions"><button type="submit" class="btn btn--gold">Save</button><button type="button" class="link-btn" data-close>Not now</button></div>
    </form>`,
  });
  m.body.querySelector('#alert-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const row = {
      user_id: store.get('user').id, enabled: f.enabled.checked,
      sweet_ids: [...f.querySelectorAll('[name=sweet]:checked')].map((x) => Number(x.value)),
      quiet_start: f.qs.value || '22:00', quiet_end: f.qe.value || '08:00', push: f.push.checked, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('alert_preferences').upsert(row);
    if (error) { toast(error.message, 'error'); return; }
    prefs = row;
    if (row.push) {
      const { enablePush } = await import('./push.js');
      const ok = await enablePush().catch(() => false);
      toast(ok ? 'Phone alerts on! Garam batch aate hi pata chal jayega.' : 'Phone notifications not available here — in-app alerts are on.', ok ? 'success' : 'info', 4500);
    } else toast('Garam alerts saved ji!', 'success');
    m.close();
  });
}

export async function initHotAlerts() {
  if (!supabase) return;
  await startLive().catch(() => {});
  await loadPrefs().catch(() => {});
  document.addEventListener('ss:hot-batch', (e) => showHot(e.detail));
  document.addEventListener('ss:auth', () => loadPrefs().catch(() => {}));
  // A batch that came out in the last 40 minutes and still has stock: show it on arrival.
  const recent = hotBatches().find((h) => Date.now() - new Date(h.ready_at) < 40 * 60000 && h.quantity_g - h.reserved_g >= 100);
  if (recent) setTimeout(() => showHot(recent), prefersReducedMotion() ? 500 : 4000);
  maybeAskOptIn();
}
