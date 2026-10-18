/**
 * Order celebration sound: a bhangra dhol beat (synthesised with Web Audio, so it's
 * our own sound) under Paaji shouting "Balle Balle! Shaava shaava!" in his voice.
 */
import { isMuted } from './voice.js';

const SHOUT_URL = 'assets/sounds/balle-balle.mp3';
let ctx = null;
// Preload so the shout starts the instant an order is placed.
let shout = typeof Audio !== 'undefined' ? Object.assign(new Audio(SHOUT_URL), { preload: 'auto' }) : null;

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx ||= new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** One drum hit: a pitched thump (dagga, low) or a tight slap (tilli, high). */
function hit(ac, out, t, low) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(low ? 150 : 420, t);
  osc.frequency.exponentialRampToValueAtTime(low ? 55 : 200, t + (low ? 0.22 : 0.08));
  gain.gain.setValueAtTime(low ? 0.9 : 0.45, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + (low ? 0.3 : 0.12));
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + 0.32);
  if (!low) {                                   // a touch of noise gives the slap its crack
    const len = Math.floor(ac.sampleRate * 0.05);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    const hp = ac.createBiquadFilter();
    const ng = ac.createGain();
    hp.type = 'highpass'; hp.frequency.value = 1800;
    ng.gain.value = 0.25;
    src.buffer = buf;
    src.connect(hp).connect(ng).connect(out);
    src.start(t);
  }
}

/** Classic bhangra chaal: DHA . ti DHA | . ti DHA ti — for `bars` bars at ~150 bpm. */
function dhol(ac, bars = 4) {
  const out = ac.createGain();
  out.gain.value = 0.6;
  out.connect(ac.destination);
  const step = 60 / 150 / 2;                    // eighth notes
  const pattern = [1, 0, 2, 1, 0, 2, 1, 2];     // 1 = dagga (low), 2 = tilli (high)
  const t0 = ac.currentTime + 0.05;
  for (let b = 0; b < bars; b++) {
    pattern.forEach((p, i) => {
      if (p) hit(ac, out, t0 + (b * 8 + i) * step, p === 1);
    });
  }
  return bars * 8 * step * 1000;
}

/** Play the celebration. Resolves when the shout has finished (or straight away if muted). */
export function balleBalle() {
  if (isMuted()) return Promise.resolve(0);
  const ac = audioCtx();
  const beatMs = ac ? dhol(ac, 4) : 0;
  return new Promise((resolve) => {
    try {
      shout ||= new Audio(SHOUT_URL);
      shout.currentTime = 0;
      shout.volume = 1;
      const done = () => resolve(beatMs);
      shout.onended = done;
      shout.onerror = done;
      setTimeout(() => shout.play().catch(done), 150);   // dhol kicks in a beat first
      setTimeout(done, 5000);                             // never hold Paaji's next line for long
    } catch {
      resolve(beatMs);
    }
  });
}
