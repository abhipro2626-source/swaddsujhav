// Ask Paaji: tap Paaji, describe what you want, he suggests and takes you there.
import { openModal, html, toast } from './ui.js';
import { API_BASE } from './config.js';
import { store } from './state.js';
import { loadCatalog, search, getById } from './catalog.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const EXAMPLES = ['Kuch halka sa, sugar free', 'Kaju wali barfi under 400', 'Shaadi ke liye bengali mithai', 'Office gift', 'Rs 500 mein 10 mehmaan'];
const say = (text, mood = 'point', extra) => document.dispatchEvent(new CustomEvent('ss:say', { detail: { text, mood, extra, group: 'ask' } }));

async function askServer(q) {
  if (API_BASE === null) throw new Error('no backend');
  const headers = {};
  const token = store.get('session')?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/ask?q=${encodeURIComponent(q)}`, { headers });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Browser fallback when the Python server is off: keyword search over the catalog. */
async function askLocal(q) {
  const list = await loadCatalog();
  const found = search(list.filter((s) => s.in_stock), q).slice(0, 6);
  return {
    reply: found[0] ? `Mera sujhav hai ${found[0].name}! Chalo ji, dikhaunda haan.` : 'Hmm, aisi mithai nahi mili ji. Thoda alag dasso?',
    items: found.map((s) => ({ sweet_id: s.id })),
    go: found[0] ? { type: 'sweet', slug: found[0].slug } : null,
  };
}

export function openAskPaaji() {
  const m = openModal({ title: 'Ask Paaji', size: 'sm', className: 'ask-modal' });
  m.body.innerHTML = html`
    <form class="ask" novalidate>
      <h2>🧔🏽 Dasso ji, ki chahida?</h2>
      <p class="muted small">Describe it in Hinglish or English — Paaji will find it and take you there.</p>
      <div class="ask__input">
        <label class="field"><span class="sr-only">Your wish</span>
          <input name="q" required maxlength="300" placeholder="e.g. kuch halka sa, sugar free" autocomplete="off"></label>
        <button type="button" class="icon-btn ask__mic" data-mic aria-label="Speak your wish" ${Recognition ? '' : 'hidden'}>
          <svg aria-hidden="true"><use href="#i-mic"/></svg></button>
      </div>
      <div class="chips">${EXAMPLES.map((e) => html`<button type="button" class="chip chip--toggle" data-ex="${e}">${e}</button>`)}</div>
      <button type="submit" class="btn btn--gold btn--block">Paaji, sujhav do!</button>
    </form>`;
  const form = m.body.querySelector('form');
  let rec = null;
  form.addEventListener('click', (e) => {
    const ex = e.target.closest('[data-ex]');
    if (ex) { form.q.value = ex.dataset.ex; form.requestSubmit(); return; }
    const mic = e.target.closest('[data-mic]');
    if (mic && Recognition) {
      if (rec) { rec.stop(); return; }
      rec = new Recognition();
      rec.lang = 'hi-IN';
      rec.interimResults = true;
      mic.classList.add('is-listening');
      mic.setAttribute('aria-label', 'Listening… tap to stop');
      rec.onresult = (ev) => { form.q.value = ev.results[ev.results.length - 1][0].transcript; };
      rec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Allow the microphone to talk to Paaji.', 'error'); };
      rec.onend = () => {
        mic.classList.remove('is-listening');
        mic.setAttribute('aria-label', 'Speak your wish');
        rec = null;
        if (form.q.value.trim()) form.requestSubmit();
      };
      rec.start();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = form.q.value.trim();
    if (!q) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Soch rahe hain…';
    let r;
    try { r = await askServer(q); } catch { r = await askLocal(q); }
    m.close('done');
    await loadCatalog().catch(() => null);
    const alts = (r.items || []).slice(1, 4).map((it) => getById(it.sweet_id)).filter(Boolean);
    say(r.reply || 'Ye dekho ji!', 'point', alts.length ? String(html`${alts.map((s) => html`<a class="chip chip--sm" href="#/sweet/${s.slug}">${s.name}</a>`)}`) : undefined);
    const go = r.go;
    if (!go) { toast('Kuch nahi mila ji — try different words.', 'info'); return; }
    setTimeout(async () => {
      if (go.type === 'sweet') location.hash = `#/sweet/${go.slug}`;
      else if (go.type === 'route') location.hash = go.hash;
      else if (go.type === 'cart') (await import('./cartDrawer.js')).openCart();
    }, 900);
  });
}
