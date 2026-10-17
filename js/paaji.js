// Paaji — the talking halwai mascot. Original SVG character built from parts so
// each can animate: idle · wave · talk · point · celebrate · think · dance.
// Every line shows in the speech bubble AND is spoken (unless muted).
import { html, raw, prefersReducedMotion, $ } from './ui.js';
import { pickLine, fill, PAIRS } from './lines.js';
import { speak, cancelSpeech, prefetch, isMuted, setMuted, canSpeak } from './voice.js';
import { store } from './state.js';
import { firstName } from './auth.js';
import { shayariFor, getById, loadCatalog } from './catalog.js';
import { count, sweetIdsInCart } from './cart.js';
import { mixSave } from './deals.js';
import { supabase } from './supabase.js';

const STATES = ['idle', 'wave', 'talk', 'point', 'celebrate', 'think', 'dance'];
let root, figure, bubble, bubbleText, bubbleExtra, liveRegion, muteBtn;
const queue = [];
let busy = false;
let typing = 0;
let hideTimer = 0;
let stateTimer = 0;
let override = null;           // lines edited by the shop owner (paaji_lines)
let lastAddAt = 0;
let idleTimer = 0;
let cartIdleTimer = 0;
let cartIdleSaid = 0;

// ------------------------------------------------------------------ artwork
function paajiSVG() {
  return `
<svg class="paaji-svg" viewBox="0 0 220 290" role="img" aria-label="Paaji, the friendly halwai, in a festive pagdi holding a thali of sweets">
  <defs>
    <linearGradient id="pj-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E2A574"/><stop offset="1" stop-color="#C98652"/></linearGradient>
    <linearGradient id="pj-kurta" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6E0"/><stop offset="1" stop-color="#F6DFAE"/></linearGradient>
    <linearGradient id="pj-saffron" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB347"/><stop offset="1" stop-color="#FF7A1A"/></linearGradient>
    <linearGradient id="pj-rani" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0408F"/><stop offset="1" stop-color="#C2125F"/></linearGradient>
    <linearGradient id="pj-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C8961E"/><stop offset=".5" stop-color="#FFE27A"/><stop offset="1" stop-color="#C8961E"/></linearGradient>
  </defs>
  <ellipse class="pj-shadow" cx="110" cy="282" rx="62" ry="7" fill="rgba(43,22,8,.22)"/>
  <g class="pj-body">
    <!-- kurta -->
    <path d="M58 182c4-22 26-34 52-34s48 12 52 34l10 92c-20 9-42 12-62 12s-42-3-62-12z" fill="url(#pj-kurta)" stroke="#E2C27A" stroke-width="1.5"/>
    <path d="M110 150v126" stroke="#E2C27A" stroke-width="1.5"/>
    <g fill="#C8961E"><circle cx="110" cy="166" r="2.2"/><circle cx="110" cy="180" r="2.2"/><circle cx="110" cy="194" r="2.2"/></g>
    <path d="M96 150c4 8 24 8 28 0" fill="none" stroke="#FF9933" stroke-width="4" stroke-linecap="round"/>
    <!-- gold Diwali shawl over the left shoulder -->
    <path d="M60 176c10-18 30-26 44-24l-26 96c-10 2-18 0-24-4z" fill="url(#pj-rani)"/>
    <path d="M62 178c9-16 27-23 40-22" fill="none" stroke="url(#pj-gold)" stroke-width="5" stroke-linecap="round"/>
    <path d="M78 248l-24-4" stroke="url(#pj-gold)" stroke-width="4" stroke-linecap="round"/>
    <g fill="#FFE27A" opacity=".9"><circle cx="76" cy="200" r="2"/><circle cx="70" cy="220" r="2"/><circle cx="82" cy="214" r="1.6"/><circle cx="66" cy="236" r="1.6"/></g>

    <!-- right arm (waves / points / thinks) -->
    <g class="pj-arm pj-arm--r">
      <path d="M150 170c10 4 16 14 17 30l2 30" fill="none" stroke="url(#pj-kurta)" stroke-width="22" stroke-linecap="round"/>
      <path d="M150 170c10 4 16 14 17 30l2 30" fill="none" stroke="#E2C27A" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
      <rect x="160" y="226" width="20" height="6" rx="3" fill="#FF9933"/>
      <circle class="pj-hand" cx="170" cy="240" r="10" fill="url(#pj-skin)"/>
      <path d="M163 236c3-3 9-3 12 0" fill="none" stroke="#B5703F" stroke-width="1.5" stroke-linecap="round"/>
    </g>

    <!-- left arm holding the thali -->
    <g class="pj-arm pj-arm--l">
      <path d="M70 170c-12 6-18 18-16 32l6 18 30 2" fill="none" stroke="url(#pj-kurta)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="92" cy="222" r="10" fill="url(#pj-skin)"/>
      <g class="pj-thali">
        <ellipse cx="78" cy="216" rx="40" ry="11" fill="#B8860B"/>
        <ellipse cx="78" cy="213" rx="40" ry="11" fill="url(#pj-gold)"/>
        <ellipse cx="78" cy="213" rx="31" ry="7.5" fill="none" stroke="#C8961E" stroke-width="1.2"/>
        <circle cx="60" cy="206" r="8" fill="#FF8A1A"/><circle cx="58" cy="203" r="2" fill="#FFC46B"/>
        <circle cx="76" cy="203" r="8.5" fill="#FF9F2E"/><circle cx="74" cy="200" r="2.2" fill="#FFD08A"/>
        <path d="M86 207l9-8 9 8-9 8z" fill="#F4F1EA" stroke="#C9C3B5"/>
        <circle cx="68" cy="210" r="5.5" fill="#8B2E16"/>
        <path d="M95 199c3-3 6 0 4 2" fill="none" stroke="#C0C0C0" stroke-width="1"/>
      </g>
    </g>

    <!-- head -->
    <g class="pj-head">
      <rect x="99" y="132" width="22" height="22" rx="8" fill="url(#pj-skin)"/>
      <ellipse cx="72" cy="100" rx="7" ry="10" fill="#C98652"/>
      <ellipse cx="148" cy="100" rx="7" ry="10" fill="#C98652"/>
      <ellipse cx="110" cy="98" rx="38" ry="42" fill="url(#pj-skin)"/>
      <ellipse class="pj-cheek" cx="88" cy="110" rx="7" ry="4.5" fill="#E8826B" opacity=".45"/>
      <ellipse class="pj-cheek" cx="132" cy="110" rx="7" ry="4.5" fill="#E8826B" opacity=".45"/>
      <!-- neat beard -->
      <path d="M74 98c0 26 14 50 36 50s36-24 36-50c-6 10-10 14-14 16-6-6-14-8-22-8s-16 2-22 8c-4-2-8-6-14-16z" fill="#2E1D14"/>
      <path d="M80 118c6 12 16 22 30 24" fill="none" stroke="#4A3226" stroke-width="1.4" opacity=".7"/>
      <path d="M140 118c-6 12-16 22-30 24" fill="none" stroke="#4A3226" stroke-width="1.4" opacity=".7"/>
      <!-- mouth (animated while speaking) -->
      <g class="pj-mouth">
        <ellipse cx="110" cy="121" rx="8" ry="4" fill="#7A1E1E"/>
        <path d="M103 120c4 2 10 2 14 0" fill="none" stroke="#F4E9DD" stroke-width="2" stroke-linecap="round"/>
      </g>
      <!-- moustache -->
      <path d="M110 112c-8-4-18-4-26 3 8 0 14 2 18 4 3-2 5-4 8-7zM110 112c8-4 18-4 26 3-8 0-14 2-18 4-3-2-5-4-8-7z" fill="#24160F"/>
      <!-- nose -->
      <path d="M110 94c-2 6-4 9-4 11 0 2 2 3 4 3s4-1 4-3c0-2-2-5-4-11z" fill="#C98652"/>
      <!-- eyes -->
      <g class="pj-eyes">
        <ellipse cx="95" cy="90" rx="6" ry="6.5" fill="#fff"/><ellipse cx="125" cy="90" rx="6" ry="6.5" fill="#fff"/>
        <circle class="pj-pupil" cx="96" cy="91" r="3.6" fill="#2A170C"/><circle class="pj-pupil" cx="126" cy="91" r="3.6" fill="#2A170C"/>
        <circle cx="97.4" cy="89.6" r="1.1" fill="#fff"/><circle cx="127.4" cy="89.6" r="1.1" fill="#fff"/>
      </g>
      <g class="pj-brows" fill="none" stroke="#24160F" stroke-width="3.2" stroke-linecap="round">
        <path d="M87 79c4-3 10-3 14 0"/><path d="M119 79c4-3 10-3 14 0"/>
      </g>
      <!-- pagdi: saffron & rani-pink folds with a gold border -->
      <g class="pj-pagdi">
        <path d="M70 84c-4-30 16-52 40-52s44 22 40 52c-12-8-26-12-40-12s-28 4-40 12z" fill="url(#pj-saffron)"/>
        <path d="M74 66c14-12 46-22 72-6" fill="none" stroke="url(#pj-rani)" stroke-width="9" stroke-linecap="round"/>
        <path d="M72 78c18-14 50-20 76-6" fill="none" stroke="url(#pj-rani)" stroke-width="7" stroke-linecap="round" opacity=".9"/>
        <path d="M80 50c16-10 38-12 58 0" fill="none" stroke="#FFC46B" stroke-width="5" stroke-linecap="round" opacity=".8"/>
        <path d="M70 84c12-8 26-12 40-12s28 4 40 12" fill="none" stroke="url(#pj-gold)" stroke-width="4.5" stroke-linecap="round"/>
        <g class="pj-kalgi">
          <path d="M110 40c-2-14 4-22 10-26-2 8 0 14-4 22z" fill="#FFE27A" stroke="#C8961E" stroke-width="1"/>
          <circle cx="110" cy="46" r="6.5" fill="url(#pj-gold)" stroke="#B8860B"/>
          <circle cx="110" cy="46" r="3" fill="#E6197A"/>
        </g>
      </g>
    </g>
  </g>
  <g class="pj-sparkles" fill="#FFB800">
    <path d="M30 60l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="M190 40l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z"/>
    <path d="M196 140l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#E6197A"/><path d="M20 150l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#E6197A"/>
  </g>
</svg>`;
}

// ------------------------------------------------------------------ state & bubble
export function setState(state, ms = 0) {
  if (!figure || !STATES.includes(state)) return;
  if (prefersReducedMotion() && (state === 'dance' || state === 'celebrate')) state = 'wave';
  STATES.forEach((s) => figure.classList.toggle(`is-${s}`, s === state));
  clearTimeout(stateTimer);
  if (ms) stateTimer = setTimeout(() => setState('idle'), ms);
}

function setTalking(on) { figure?.classList.toggle('is-talking', on); }

function typeText(el, text) {
  clearInterval(typing);
  if (prefersReducedMotion()) { el.textContent = text; return; }
  el.textContent = '';
  let i = 0;
  const chars = [...text];
  typing = setInterval(() => {
    i += 2;
    el.textContent = chars.slice(0, i).join('');
    if (i >= chars.length) clearInterval(typing);
  }, 28);
}

function showBubble(item) {
  clearTimeout(hideTimer);
  root.classList.add('has-bubble');
  bubble.hidden = false;
  bubble.classList.remove('is-in');
  void bubble.offsetWidth;
  bubble.classList.add('is-in');
  bubble.classList.toggle('bubble--shayari', !!item.shayari);
  typeText(bubbleText, item.display || item.text);
  bubbleExtra.innerHTML = item.extra || '';
  liveRegion.textContent = item.text;
}

export function hideBubble() {
  clearInterval(typing);
  root?.classList.remove('has-bubble');
  if (bubble) bubble.hidden = true;
}

/**
 * Queue a line. Paaji NEVER cuts himself off: the line he is speaking always
 * finishes. Only waiting lines are managed:
 *   priority 'high' → drop the lines still waiting, this one goes next
 *   group           → replaces a waiting line of the same group (e.g. rapid adds)
 *   ttl             → a line that waited too long is skipped (default 20s)
 * item: { text, mood, speakText?, display?, extra?, shayari?, hold?, group?, ttl? }
 */
const MAX_WAITING = 3;
export function say(item) {
  if (!root || !item?.text) return;
  item.at = Date.now();
  if (item.priority === 'high') queue.length = 0;
  if (item.group) {
    const replaces = item.group === 'add' ? ['add', 'pick'] : [item.group];
    for (let i = queue.length - 1; i >= 0; i--) if (replaces.includes(queue[i].group)) queue.splice(i, 1);
  }
  queue.push(item);
  if (queue.length > MAX_WAITING) queue.splice(0, queue.length - MAX_WAITING);
  if (busy) prefetch(queue[0].speakText || queue[0].text);   // ready the moment the current line ends
  pump();
}

async function pump() {
  if (busy) return;
  // Skip lines that waited too long to still make sense.
  while (queue.length && Date.now() - queue[0].at > (queue[0].ttl ?? 20000)) queue.shift();
  if (!queue.length) return;
  busy = true;
  const item = queue.shift();
  const mood = item.mood && item.mood !== 'talk' ? item.mood : 'talk';
  setState(mood);
  showBubble(item);
  if (queue.length) prefetch(queue[0].speakText || queue[0].text);
  await speak(item.speakText || item.text, { onStart: () => setTalking(true), onEnd: () => setTalking(false) });
  setTalking(false);
  await new Promise((r) => setTimeout(r, item.hold ?? 700));
  busy = false;
  if (queue.length) { pump(); return; }
  if (!['dance', 'celebrate'].includes(mood) || !figure.classList.contains(`is-${mood}`)) setState('idle');
  hideTimer = setTimeout(hideBubble, item.extra ? 9000 : 5500);
}

/** Explicit stop from the user (× on the bubble). */
function stopTalking() {
  cancelSpeech();
  queue.length = 0;
  clearInterval(typing);
  busy = false;
  setTalking(false);
  hideBubble();
  setState('idle');
}

const line = (trigger, vars) => pickLine(trigger, vars, override);

// ------------------------------------------------------------------ reactions
let addSeq = 0;
async function onAdded(e) {
  const { sweet, from } = e.detail;
  const mySeq = ++addSeq;                      // a newer add supersedes this one
  const now = Date.now();
  const rapid = busy && now - lastAddAt < 6000;
  lastAddAt = now;
  pointAt(from);
  if (rapid) {
    // Already talking about the last sweet: queue one short reaction (replaces any waiting one).
    say({ text: `${sweet.name}? ${line('add')}`, mood: 'point', hold: 300, group: 'add', ttl: 8000 });
  } else {
    let sh = null;
    try { sh = await shayariFor(sweet); } catch { /* offline: skip the shayari */ }
    if (mySeq !== addSeq) return;
    const praise = line('add');
    if (sh) {
      // Shayari + praise as ONE line, so it flows as a single smooth delivery.
      const roman = sh.text_roman.replace(/\n/g, ', ');
      say({
        text: `${roman}. ${praise}`, speakText: `${roman}... ${praise}`,
        display: sh.text_hi, shayari: true, mood: 'talk', hold: 400, group: 'add', ttl: 12000,
        extra: html`<p class="bubble__roman">${sh.text_roman}</p><p class="bubble__en muted">${sh.text_en}</p>`,
      });
    } else {
      say({ text: praise, mood: 'wave', hold: 300, group: 'add', ttl: 8000 });
    }
  }
  // Then suggest something: a new arrival if possible ("poore Muzaffarnagar mein nayi hai!").
  try {
    const { pickAfterAdd } = await import('./recommend.js');
    const pick = await pickAfterAdd(sweet);
    if (!pick || mySeq !== addSeq) return;
    const fixed = PAIRS.find(([a, b]) => a === sweet.name && b === pick.sweet.name);
    const vars = { sweet: pick.sweet.name, added: sweet.name };
    const text = fixed && pick.kind !== 'new' ? fixed[2]
      : pick.kind === 'new' ? line('upsell_new', vars)
      : pick.kind === 'together' ? line('upsell_pair', vars) : line('upsell_similar', vars);
    highlight(pick.sweet.id);
    say({
      text, mood: 'point', hold: 600, group: 'pick', ttl: 20000,
      extra: html`<a class="bubble__pick" href="#/sweet/${pick.sweet.slug}" data-open="${pick.sweet.slug}">
          ${pick.sweet.image_url ? html`<img src="${pick.sweet.image_url.replace(/\/(\d+)px-/, '/330px-')}" alt="" referrerpolicy="no-referrer">` : ''}
          <span>${pick.sweet.name}${pick.kind === 'new' ? raw(' <b class="tag tag--new">New</b>') : ''}</span></a>
        <button type="button" class="btn btn--gold btn--sm" data-add="${pick.sweet.id}">+ Add</button>`,
    });
  } catch (err) {
    console.debug('[paaji] pick failed', err);
  }
  // Mix & Save: celebrate a new tier, or nudge when one more sweet unlocks the next.
  if (mySeq !== addSeq) return;
  const distinct = sweetIdsInCart().length;
  const deal = mixSave(distinct);
  const prev = mixSave(distinct - 1);
  if (deal.percent > prev.percent) {
    say({ text: line('mix_unlocked', { pct: deal.percent }), mood: 'celebrate', group: 'nudge', ttl: 15000 });
  } else if (deal.next && deal.next.needed <= 2) {
    say({ text: line('mix_nudge', { n: deal.next.needed, pct: deal.next.percent }), mood: 'point', group: 'nudge', ttl: 15000 });
  }
}

/** Glow the suggested sweet's card for a few seconds (if it's on screen). */
function highlight(sweetId) {
  document.querySelectorAll(`.sweet-card[data-sweet="${sweetId}"]`).forEach((el) => {
    el.classList.remove('is-paaji-pick');
    void el.offsetWidth;
    el.classList.add('is-paaji-pick');
    setTimeout(() => el.classList.remove('is-paaji-pick'), 4500);
  });
}

/** Turn Paaji's pupils toward where the action is. */
function pointAt(el) {
  if (!el || !figure) return;
  const a = figure.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const dx = Math.max(-1, Math.min(1, (b.left - a.right) / 400));
  const dy = Math.max(-1, Math.min(1, (b.top - a.top) / 400));
  figure.style.setProperty('--look-x', `${dx * 2}px`);
  figure.style.setProperty('--look-y', `${dy * 2}px`);
  setTimeout(() => { figure.style.setProperty('--look-x', '0px'); figure.style.setProperty('--look-y', '0px'); }, 2500);
}

function greet() {
  const name = store.get('user') ? firstName() : '';
  setState('wave', 2600);
  say({ text: name ? line('return', { name }) : line('welcome'), mood: 'wave', priority: 'high' });
}

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (document.body.dataset.route === 'home' && !document.querySelector('.modal') && !busy) {
      say({ text: line('fact'), mood: 'think', hold: 1200 });
    }
    resetIdle();
  }, 40000);

  clearTimeout(cartIdleTimer);
  if (count() > 0) {
    cartIdleTimer = setTimeout(() => {
      const drawerOpen = document.getElementById('cart-drawer')?.classList.contains('is-open');
      if (!drawerOpen && !busy && Date.now() - cartIdleSaid > 5 * 60000 && document.body.dataset.route !== 'checkout') {
        cartIdleSaid = Date.now();
        say({ text: line('cart_idle'), mood: 'point', extra: html`<button type="button" class="btn btn--gold btn--sm" data-open-cart>Thaali dekho</button>` });
      }
    }, 60000);
  }
}

async function loadOwnerLines() {
  if (!supabase) return;
  const { data } = await supabase.from('paaji_lines').select('trigger, text_roman').eq('active', true);
  if (!data?.length) return;
  override = {};
  for (const r of data) (override[r.trigger] ||= []).push(r.text_roman);
}

// ------------------------------------------------------------------ setup
export function initPaaji() {
  root = $('#paaji-root');
  if (!root) return;
  root.innerHTML = html`
    <div class="paaji" id="paaji">
      <div class="bubble" id="paaji-bubble" hidden>
        <button type="button" class="bubble__x" data-bubble-close aria-label="Close Paaji's message">×</button>
        <p class="bubble__text" id="paaji-text"></p>
        <div class="bubble__extra" id="paaji-extra"></div>
      </div>
      <button type="button" class="paaji__figure" id="paaji-figure" aria-label="Paaji — tap to hear a suggestion">
        ${raw(paajiSVG())}
      </button>
      <button type="button" class="paaji__mute icon-btn" id="paaji-mute" aria-pressed="false" aria-label="Mute Paaji's voice">
        <svg aria-hidden="true"><use href="#i-volume"/></svg>
      </button>
      <p class="sr-only" aria-live="polite" id="paaji-live"></p>
    </div>`;
  figure = $('#paaji-figure');
  bubble = $('#paaji-bubble');
  bubbleText = $('#paaji-text');
  bubbleExtra = $('#paaji-extra');
  liveRegion = $('#paaji-live');
  muteBtn = $('#paaji-mute');
  setState('idle');

  const syncMute = () => {
    const m = isMuted();
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.setAttribute('aria-label', m ? "Unmute Paaji's voice" : "Mute Paaji's voice");
    muteBtn.querySelector('use').setAttribute('href', m ? '#i-mute' : '#i-volume');
    muteBtn.classList.toggle('is-muted', m);
  };
  syncMute();
  if (!canSpeak()) muteBtn.hidden = true;
  store.on('muted', syncMute);
  muteBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    if (!isMuted()) say({ text: 'Lo ji, hun main bol sakda haan!', mood: 'wave', priority: 'high' });
  });

  // Blink every few seconds.
  const blink = () => {
    figure.classList.add('is-blinking');
    setTimeout(() => figure.classList.remove('is-blinking'), 160);
    setTimeout(blink, 2500 + Math.random() * 3500);
  };
  setTimeout(blink, 1800);

  figure.addEventListener('click', async () => {
    // Phones: first tap expands Paaji; desktop: tap for a fresh suggestion.
    if (matchMedia('(max-width: 767px)').matches && !root.classList.contains('is-big')) {
      root.classList.add('is-big');
      setTimeout(() => root.classList.remove('is-big'), 8000);
    }
    setState('think');
    // Ask Paaji: describe what you want, he suggests and takes you there.
    try { (await import('./askPaaji.js')).openAskPaaji(); return; } catch (err) { console.debug('[paaji] ask failed', err); }
    say({ text: line('think'), mood: 'think', hold: 200, priority: 'high' });
    try {
      const { forUser } = await import('./recommend.js');
      const { items, reasons } = await forUser({ limit: 6 });
      const s = items[Math.floor(Math.random() * Math.min(3, items.length))];
      if (s) {
        const r = reasons.get(s.id);
        say({
          text: `${s.name} try karo ji! ${r?.text ? `(${r.text})` : ''}`, mood: 'point',
          extra: html`<a class="bubble__pick" href="#/sweet/${s.slug}" data-open="${s.slug}"><span>${s.name}</span></a>
            <button type="button" class="btn btn--gold btn--sm" data-add="${s.id}">+ Add</button>`,
        });
      }
    } catch { /* fine, Paaji just thinks */ }
  });

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-bubble-close]')) stopTalking();
    if (e.target.closest('[data-open-cart]')) (await import('./cartDrawer.js')).openCart();
  });

  // ---- events from the rest of the app
  document.addEventListener('ss:entered', (e) => { if (e.detail?.fromButton) setTimeout(greet, 700); });
  document.addEventListener('ss:say', (e) => {
    const d = e.detail || {};
    const text = d.text || (d.trigger ? line(d.trigger, d.vars || {}) : '');
    if (text) say({ text, mood: d.mood || 'talk', priority: d.priority || 'normal', extra: d.extra });
  });
  document.addEventListener('ss:added', onAdded);
  document.addEventListener('ss:removed', () => { if (Math.random() < 0.4) say({ text: line('removed'), mood: 'think' }); });
  document.addEventListener('ss:login', () => setTimeout(() => say({ text: line('return', { name: firstName() }), mood: 'wave', priority: 'high' }), 400));
  document.addEventListener('ss:celebrate', () => setState('dance', 3200));
  document.addEventListener('ss:quiz-done', () => { setState('celebrate', 2500); say({ text: 'Bas ji! Hun meri har sujhav tuhade swaad naal hogi.', mood: 'celebrate', priority: 'high' }); });
  document.addEventListener('ss:order-placed', async (e) => {
    setState('dance', 4200);
    say({ text: line('order'), mood: 'dance', priority: 'high', hold: 400 });
    try {
      const sh = await shayariFor(null, 'thanks');
      if (sh) say({ text: sh.text_roman.replace(/\n/g, ', '), display: sh.text_hi, shayari: true, mood: 'celebrate',
        extra: html`<p class="bubble__en muted">${sh.text_en}</p>` });
    } catch { /* ignore */ }
    if (e.detail?.next) say({ text: `Agli vaari ${e.detail.next} zaroor try karna ji!`, mood: 'point' });
  });
  document.addEventListener('ss:route', (e) => {
    if (e.detail.name !== 'home') hideBubbleSoon();
  });

  for (const ev of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(ev, resetIdle, { passive: true });
  // Phones: tuck Paaji to the edge while scrolling so he never hides content.
  let tuckTimer = 0;
  window.addEventListener('scroll', () => {
    if (!matchMedia('(max-width: 767px)').matches) return;
    root.classList.add('is-tucked');
    clearTimeout(tuckTimer);
    tuckTimer = setTimeout(() => { if (window.scrollY < 40) root.classList.remove('is-tucked'); }, 1500);
  }, { passive: true });
  figure.addEventListener('pointerdown', () => root.classList.remove('is-tucked'));
  store.on('cart', resetIdle);
  resetIdle();
  loadOwnerLines().catch(() => {});
  loadCatalog().catch(() => {});

  // Returning in the same session: greet in the bubble; voice starts after the next tap.
  if (sessionStorage.getItem('ss:entered') && !document.getElementById('entry')) {
    setTimeout(() => say({ text: store.get('user') ? line('return', { name: firstName() }) : line('welcome'), mood: 'wave' }), 1200);
  }
  return { say, setState };
}

function hideBubbleSoon() {
  if (!busy && !queue.length) { clearTimeout(hideTimer); hideTimer = setTimeout(hideBubble, 2500); }
}

export { getById, fill };
