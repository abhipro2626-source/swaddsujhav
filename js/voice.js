// Voice: free browser Web Speech API.
//  - speak(): speech synthesis (hi-IN → en-IN → default), mute aware
//  - voice search + simple voice commands via SpeechRecognition
import { store, local } from './state.js';
import { toast, $ } from './ui.js';
import { loadCatalog, search, getById } from './catalog.js';
import { add } from './cart.js';
import { API_BASE } from './config.js';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let voice = null;
let unlocked = false;          // browsers need one user gesture before audio
let current = null;

// ------------------------------------------------------------------ synthesis
// Paaji should sound like a warm, bold Punjabi uncle: prefer natural (neural)
// MALE Indian voices, then any Indian voice, then the default.
const MALE_HINTS = /madhur|prabhat|hemant|ravi|kunal|aarav|rehaan|male|पुरुष/i;
const FEMALE_HINTS = /swara|kalpana|heera|neerja|aditi|raveena|lekha|female|ananya|kavya/i;
function scoreVoice(v) {
  let s = 0;
  if (/hi[-_]IN/i.test(v.lang)) s += 40;
  else if (/en[-_]IN/i.test(v.lang)) s += 30;
  else if (/^hi/i.test(v.lang)) s += 25;
  else if (/^en/i.test(v.lang)) s += 5;
  if (/natural|neural|online|enhanced|premium/i.test(v.name)) s += 25;   // smooth neural voices
  if (MALE_HINTS.test(v.name)) s += 20;
  if (FEMALE_HINTS.test(v.name)) s -= 15;
  if (/google/i.test(v.name)) s += 8;
  return s;
}
function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  voice = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
}
/** Bold & smooth: a little slower and deeper; male neural voices need less lowering. */
const voiceTuning = () => {
  const male = voice && MALE_HINTS.test(voice.name);
  return { rate: 0.9, pitch: male ? 0.82 : 0.68 };
};

export const canSpeak = () => !!synth;
export const isMuted = () => !!store.get('muted');
export const isUnlocked = () => unlocked || !!navigator.userActivation?.hasBeenActive;

export function setMuted(muted) {
  store.set({ muted });
  local.set('ss:muted', muted);
  if (muted) cancelSpeech();
}

// Every cancel bumps the generation. A line that was still downloading when it
// was cancelled sees a stale generation and never plays — so two voices can
// never overlap.
let gen = 0;

/** Stop speaking right now. Only for explicit user actions (× on the bubble, mute). */
export function cancelSpeech() {
  gen += 1;
  if (synth) synth.cancel();
  if (audioEl && !audioEl.paused) audioEl.pause();
  current = null;
}

const cleanText = (text) => String(text).replace(/[✨🪔🎉❤️💛🍬🤝👥🔥🙏🎁]/gu, '').replace(/\s+/g, ' ').trim();

/** Start downloading a line's audio early so the next line follows without a gap. */
export function prefetch(text) {
  const clean = cleanText(text || '');
  if (clean && premium && !isMuted()) fetchAudio(clean).catch(() => {});
}

/** Roughly how long a line takes to read aloud (used when muted, for the mouth). */
export const estimateMs = (text) => Math.min(9000, 900 + String(text).length * 55);

/**
 * Speak a line. Resolves when finished (or after an estimate when muted /
 * unsupported / not yet unlocked). onStart/onEnd drive Paaji's mouth.
 */
export function speak(text, { onStart, onEnd } = {}) {
  return new Promise((resolve) => {
    const clean = cleanText(text);
    const myGen = gen;
    let done = false;
    const finish = () => { if (done) return; done = true; onEnd?.(); resolve(); };
    if (!clean) { finish(); return; }
    if (isMuted() || !isUnlocked()) {
      onStart?.();
      setTimeout(finish, estimateMs(clean));
      return;
    }
    // Studio voice (ElevenLabs via backend/app.py) when available, else the browser voice.
    if (premium) {
      playPremium(clean, myGen, { onStart, onEnd: finish }).catch(() => {
        if (myGen === gen) browserSpeak(clean, onStart, finish); else finish();
      });
      return;
    }
    browserSpeak(clean, onStart, finish);
  });
}

function browserSpeak(clean, onStart, finish) {
    if (!synth) { onStart?.(); setTimeout(finish, estimateMs(clean)); return; }
    if (!voice) pickVoice();
    const u = new SpeechSynthesisUtterance(clean);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'hi-IN';
    const { rate, pitch } = voiceTuning();
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1;
    let started = false;
    // Some browsers never fire onstart/onend; keep the UI honest with a timeout.
    const guard = setTimeout(() => { if (current === u) { current = null; finish(); } }, estimateMs(clean) + 4000);
    u.onstart = () => { started = true; onStart?.(); };
    u.onend = u.onerror = () => {
      clearTimeout(guard);
      if (!started) onStart?.();
      if (current === u) current = null;
      finish();
    };
    current = u;
    synth.speak(u);
}

// ------------------------------------------------------------------ studio voice (ElevenLabs)
// backend/app.py exposes /api/tts when ELEVENLABS_API_KEY is set. Audio is
// cached on the server, and as object URLs here, so repeated lines are free.
let premium = false;
let audioEl = null;
const audioCache = new Map();     // text → Promise<objectURL> (shared by prefetch and play)

async function checkPremium() {
  if (API_BASE === null) return;          // static hosting: browser voice only
  try {
    const res = await fetch(`${API_BASE}/api/tts/status`, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return;
    const data = await res.json();
    premium = !!data.enabled;
  } catch { premium = false; }
}

/** Download (once) the audio for a line. Concurrent callers share one request. */
function fetchAudio(text) {
  if (audioCache.has(text)) return audioCache.get(text);
  const p = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);   // first-time Gemini voice lines can take ~5–10s
    try {
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), signal: ctrl.signal,
      });
      if (!res.ok) {
        if (res.status === 402 || res.status === 503) premium = false;   // out of credit / not configured
        throw new Error(`tts ${res.status}`);
      }
      return URL.createObjectURL(await res.blob());
    } finally {
      clearTimeout(timer);
    }
  })();
  audioCache.set(text, p);
  p.catch(() => audioCache.delete(text));
  if (audioCache.size > 80) {
    const [oldText, oldP] = audioCache.entries().next().value;
    audioCache.delete(oldText);
    oldP.then((u) => URL.revokeObjectURL(u)).catch(() => {});
  }
  return p;
}

async function playPremium(text, myGen, { onStart, onEnd }) {
  const url = await fetchAudio(text);
  if (myGen !== gen) { onEnd?.(); return; }          // cancelled while downloading: stay silent
  if (audioEl && !audioEl.paused) audioEl.pause();   // safety: only one clip at a time
  const el = new Audio(url);
  audioEl = el;
  current = el;
  await new Promise((resolve, reject) => {
    const end = () => { if (current === el) current = null; onEnd?.(); resolve(); };
    el.onplaying = () => onStart?.();
    el.onended = end;
    el.onpause = () => { if (!el.ended) end(); };     // only happens on an explicit cancel
    el.onerror = () => reject(new Error('audio error'));
    el.play().catch(reject);
  });
}

// ------------------------------------------------------------------ recognition
const NUMBERS = { ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5, chhe: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10 };

/** Turn "Paaji, do kilo kaju katli daal do" into an add-to-cart action. */
export async function handleCommand(transcript) {
  const text = transcript.toLowerCase().replace(/[,.!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const say = (t, mood = 'talk') => document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: t, mood } }));

  if (/(cart|thaali|thali).*(khol|open|dikha)|open (the )?cart/.test(text)) {
    (await import('./cartDrawer.js')).openCart();
    say('Lo ji, thaali haazir hai!');
    return true;
  }
  if (/diwali night|raat wala|dark mode/.test(text)) { $('#theme-btn')?.click(); return true; }

  const wantsAdd = /(daal|dal|add|chahiye|le lo|de do|bhej|order)/.test(text);
  if (!wantsAdd) return false;

  let qty = 1;
  const num = text.match(/\b(\d+)\b/);
  if (num) qty = Math.min(20, Number(num[1]));
  else for (const [w, n] of Object.entries(NUMBERS)) if (new RegExp(`\\b${w}\\b`).test(text)) { qty = n; break; }

  let label = null;
  if (/aadha kilo|adha kilo|half kilo|500 ?g(ram)?|paanch sau/.test(text)) label = '500g';
  else if (/kilo|kg|kilogram/.test(text)) label = '1kg';
  else if (/paav|pav|quarter|250 ?g(ram)?/.test(text)) label = '250g';
  else if (/dabba|box/.test(text)) label = /12|barah/.test(text) ? 'box of 12' : 'box of 6';
  else if (/piece|pc|peese|nag/.test(text)) label = '1 pc';

  const name = text
    .replace(/\b(paaji|paji|ji|please|plz|mujhe|humein|hamein|daal|dal|do|de|dena|add|karo|kar|chahiye|le|lo|bhej|order|kilo|kg|aadha|adha|half|gram|grams|paav|pav|box|dabba|piece|pieces|pc|nag|cart|mein|me|thaali|thali)\b/g, ' ')
    .replace(/\b(\d+|ek|one|two|teen|three|char|chaar|four|paanch|panch|five)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!name) return false;

  const list = await loadCatalog();
  const sweet = search(list, name)[0];
  if (!sweet) { say(`"${name}" nahi mili ji. Ek baar phir bolo?`); return true; }
  const variants = sweet.variants.filter((v) => v.stock_qty == null || v.stock_qty > 0);
  let v = label && variants.find((x) => x.weight_label.toLowerCase() === label);
  // "2 kilo" with only 250g/500g/1kg variants → 2 × 1kg
  if (!v) v = variants.find((x) => x.weight_label === sweet.price_unit) || variants[0];
  if (!v) { say(`${sweet.name} abhi khatam ho gayi ji, maaf karna.`); return true; }
  if (add(getById(sweet.id), v, qty)) {
    say(`Ho gaya ji! ${qty} × ${v.weight_label} ${sweet.name} thaali vich.`, 'point');
  }
  return true;
}

function initMic() {
  const btn = $('#mic-btn');
  const input = $('#search-input');
  if (!btn || !input || !Recognition) return;
  btn.hidden = false;
  let rec = null;
  btn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new Recognition();
    rec.lang = store.get('lang') === 'hi' ? 'hi-IN' : 'en-IN';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    btn.classList.add('is-listening');
    btn.setAttribute('aria-label', 'Listening… tap to stop');
    document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: 'Bolo ji, main sun raha haan!', mood: 'think', quiet: true } }));
    let finalText = '';
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      input.value = r[0].transcript;
      if (r.isFinal) finalText = r[0].transcript;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') toast('Microphone permission is blocked. Allow it in the browser to use voice search.', 'error', 5000);
      else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Could not hear that. Please try again.', 'error');
    };
    rec.onend = async () => {
      btn.classList.remove('is-listening');
      btn.setAttribute('aria-label', 'Search by voice');
      rec = null;
      const said = finalText || input.value;
      if (!said.trim()) return;
      if (await handleCommand(said)) { input.value = ''; return; }
      input.form?.requestSubmit();
    };
    rec.start();
  });
}

export function initVoice() {
  store.set({ muted: !!local.get('ss:muted', false) });
  if (synth) {
    pickVoice();
    synth.addEventListener?.('voiceschanged', pickVoice);
  }
  const unlock = () => { unlocked = true; };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
  document.addEventListener('ss:entered', unlock);
  checkPremium();
  initMic();
}
