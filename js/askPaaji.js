// Ask Paaji — chat with Paaji. Gemini (on the server) writes his replies, grounded in
// our real catalog; our ML finds the candidates. He speaks every reply and takes you
// to his top pick (unless you keep typing). Falls back to rule-based search offline.
import { openModal, html, raw, rupees, sweetImage, toast } from './ui.js';
import { API_BASE } from './config.js';
import { store } from './state.js';
import { loadCatalog, search, getById, getBySlug } from './catalog.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const EXAMPLES = ['Mummy ko diabetes hai, Deepawali pe kya le jaun?', 'Kaju wali barfi under 400', 'Rasgulla aur rasmalai mein kya farak hai?', 'Office gift ke liye kuch premium', 'Rs 500 mein 10 mehmaan'];
const HISTORY_KEY = 'ss:paaji-chat';
const say = (text, speakText, mood = 'point') =>
  document.dispatchEvent(new CustomEvent('ss:say', { detail: { text, speakText, mood, group: 'ask', priority: 'high' } }));

function loadHistory() { try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
function saveHistory(h) { try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-12))); } catch { /* ignore */ } }

async function askServer(message, history) {
  if (API_BASE === null) throw new Error('no backend');
  const headers = { 'Content-Type': 'application/json' };
  const token = store.get('session')?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${API_BASE}/api/chat`, { method: 'POST', headers, body: JSON.stringify({ message, history }), signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally { clearTimeout(timer); }
}

/** Browser fallback when the Python server is off: keyword search over the catalog. */
async function askLocal(q) {
  const list = await loadCatalog();
  const found = search(list.filter((s) => s.in_stock), q).slice(0, 4);
  return {
    reply: found[0] ? `Mera sujhaav hai ${found[0].name}! Chaliye ji, dikhata hoon.` : 'Hmm, aisi mithai nahi mili ji. Thoda alag batayiye?',
    items: found.map((s) => ({ sweet_id: s.id })),
    go: found[0] ? { type: 'sweet', slug: found[0].slug } : null,
    engine: 'local',
  };
}

export function openAskPaaji() {
  const history = loadHistory();
  const m = openModal({ title: 'Ask Paaji', size: 'md', className: 'ask-modal' });
  let goTimer = 0;
  let rec = null;

  m.body.innerHTML = html`
    <div class="ask">
      <header class="ask__head">
        <h2>🧔🏽 Bataiye ji, kya chahiye?</h2>
        <button type="button" class="link-btn" data-new-chat ${history.length ? '' : 'hidden'}>New chat</button>
      </header>
      <div class="ask__log" id="ask-log" aria-live="polite"></div>
      <div class="chips ask__examples" ${history.length ? 'hidden' : ''}>${EXAMPLES.map((e) => html`<button type="button" class="chip chip--toggle" data-ex="${e}">${e}</button>`)}</div>
      <form class="ask__input" novalidate>
        <label class="field"><span class="sr-only">Message Paaji</span>
          <input name="q" required maxlength="400" placeholder="Hinglish ya English mein poochho…" autocomplete="off"></label>
        <button type="button" class="icon-btn ask__mic" data-mic aria-label="Speak to Paaji" ${Recognition ? '' : 'hidden'}><svg aria-hidden="true"><use href="#i-mic"/></svg></button>
        <button type="submit" class="btn btn--gold" aria-label="Send">Bhejo</button>
      </form>
      <p class="muted ask__note">Paaji's replies are written by Google Gemini, grounded in our real menu. Please don't share private details.</p>
    </div>`;
  const log = m.body.querySelector('#ask-log');
  const form = m.body.querySelector('form');

  const bubble = (role, text, picks = []) => {
    const div = document.createElement('div');
    div.className = `ask-msg ask-msg--${role}`;
    const sweets = picks.map((id) => getById(id)).filter(Boolean);
    div.innerHTML = html`
      <p>${text}</p>
      ${sweets.length ? html`<div class="ask-picks">${sweets.map((s, i) => html`
        <a class="ask-pick ${i === 0 ? 'is-top' : ''}" href="#/sweet/${s.slug}" data-go="${s.slug}">
          ${sweetImage(s, { size: 'thumb' })}
          <span><strong>${s.name}</strong><small class="muted">${rupees(s.min_price)} · ${s.region}</small></span></a>`)}</div>` : ''}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  };
  const cancelGo = () => { clearTimeout(goTimer); m.body.querySelector('.ask-go')?.remove(); };

  const go = async (target) => {
    if (!target) return;
    m.close('go');
    if (target.type === 'sweet') location.hash = `#/sweet/${target.slug}`;
    else if (target.type === 'route') location.hash = target.hash;
    else if (target.type === 'cart') (await import('./cartDrawer.js')).openCart();
  };

  loadCatalog().then(() => {
    for (const h of history) bubble(h.role, h.text, h.picks || []);
    if (!history.length) bubble('paaji', 'Jai Shree Ram ji! Kis mauke ke liye, kitni mithaas, koi parhez? Bataiye, main sahi mithai dhoondh deta hoon.');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = form.q.value.trim();
    if (!q) return;
    cancelGo();
    form.q.value = '';
    m.body.querySelector('.ask__examples')?.setAttribute('hidden', '');
    m.body.querySelector('[data-new-chat]')?.removeAttribute('hidden');
    bubble('user', q);
    const thinking = bubble('paaji', 'Soch raha hoon ji…');
    thinking.classList.add('is-thinking');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    let r;
    try { r = await askServer(q, history); } catch { r = await askLocal(q); }
    await loadCatalog().catch(() => null);
    thinking.remove();
    const picks = (r.items || []).map((it) => it.sweet_id).slice(0, 3);
    bubble('paaji', r.reply || 'Ye dekho ji!', picks);
    history.push({ role: 'user', text: q }, { role: 'paaji', text: r.reply, picks });
    saveHistory(history);
    btn.disabled = false;
    say(r.reply, r.reply_hi || r.reply);

    // Take the customer to the top pick — unless they keep chatting.
    if (r.go) {
      const label = r.go.type === 'sweet' ? (getBySlug(r.go.slug)?.name || 'mithai') : 'page';
      const note = document.createElement('p');
      note.className = 'ask-go';
      note.innerHTML = html`Le chal raha hoon ${label} par… <button type="button" class="link-btn" data-stay>Ruko, aur poochna hai</button>`;
      log.appendChild(note);
      log.scrollTop = log.scrollHeight;
      goTimer = setTimeout(() => go(r.go), r.go.type === 'sweet' ? 3500 : 1800);
    }
    form.q.focus();
  });

  m.body.addEventListener('click', (e) => {
    const ex = e.target.closest('[data-ex]');
    if (ex) { form.q.value = ex.dataset.ex; form.requestSubmit(); return; }
    if (e.target.closest('[data-stay]')) { cancelGo(); form.q.focus(); return; }
    const pick = e.target.closest('[data-go]');
    if (pick) { e.preventDefault(); go({ type: 'sweet', slug: pick.dataset.go }); return; }
    if (e.target.closest('[data-new-chat]')) {
      cancelGo(); history.length = 0; saveHistory(history); log.innerHTML = '';
      bubble('paaji', 'Chaliye ji, nayi baat shuru karte hain! Kya chahiye?');
      return;
    }
    const mic = e.target.closest('[data-mic]');
    if (mic && Recognition) {
      if (rec) { rec.stop(); return; }
      cancelGo();
      rec = new Recognition();
      rec.lang = 'hi-IN';
      rec.interimResults = true;
      mic.classList.add('is-listening');
      rec.onresult = (ev) => { form.q.value = ev.results[ev.results.length - 1][0].transcript; };
      rec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Allow the microphone to talk to Paaji.', 'error'); };
      rec.onend = () => { mic.classList.remove('is-listening'); rec = null; if (form.q.value.trim()) form.requestSubmit(); };
      rec.start();
    }
  });
  form.q.addEventListener('input', cancelGo);     // typing = keep chatting, don't navigate
  setTimeout(() => form.q.focus(), 50);
  return raw('');
}
