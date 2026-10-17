// Festive effects on one lightweight canvas: sparkle bursts, the diya cursor
// trail (desktop only) and fireworks + confetti when an order is placed.
// Everything is skipped under prefers-reduced-motion.
import { prefersReducedMotion } from './ui.js';

const COLORS = ['#FFB800', '#FF9933', '#F5C542', '#E6197A', '#FF6B1A', '#FFE27A', '#8DC63F'];
let canvas, ctx, dpr = 1;
let particles = [];
let running = false;
let last = 0;

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loop(t) {
  const dt = Math.min(40, t - (last || t)) / 16.67;
  last = t;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt; p.rot += p.spin * dt;
    const a = Math.max(0, Math.min(1, p.life / p.fade));
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.kind === 'confetti') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else if (p.kind === 'star') {
      star(p.x, p.y, p.size, p.rot);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      if (p.glow) { ctx.globalAlpha = a * 0.25; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
  if (particles.length) requestAnimationFrame(loop);
  else { running = false; last = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}

function star(x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 ? r * 0.4 : r;
    const a = rot + (i * Math.PI) / 4;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
}

function emit(list) {
  if (!ctx || prefersReducedMotion()) return;
  particles.push(...list);
  if (particles.length > 900) particles.splice(0, particles.length - 900);
  if (!running) { running = true; requestAnimationFrame(loop); }
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function sparkle(x, y, n = 18) {
  emit(Array.from({ length: n }, () => {
    const a = rand(0, Math.PI * 2);
    const s = rand(1.5, 4.5);
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, gravity: 0.08, drag: 0.94,
      size: rand(2, 5), life: rand(26, 44), fade: 20, color: pick(COLORS), kind: Math.random() < 0.5 ? 'star' : 'dot',
      rot: rand(0, 6), spin: rand(-0.2, 0.2), glow: true };
  }));
}

function firework(x, y) {
  const color = pick(COLORS);
  const n = 46;
  emit(Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const s = rand(3, 6.5);
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gravity: 0.06, drag: 0.965,
      size: rand(1.8, 3), life: rand(48, 70), fade: 30, color: Math.random() < 0.8 ? color : '#FFFFFF', kind: 'dot', rot: 0, spin: 0, glow: true };
  }));
}

function confetti(n = 140) {
  emit(Array.from({ length: n }, () => ({
    x: rand(0, innerWidth), y: rand(-80, -10), vx: rand(-1.5, 1.5), vy: rand(1.5, 4), gravity: 0.05, drag: 0.99,
    size: rand(6, 11), life: rand(120, 180), fade: 40, color: pick(COLORS), kind: 'confetti', rot: rand(0, 6), spin: rand(-0.25, 0.25),
  })));
}

/** ~3 seconds of fireworks + confetti, and diyas lighting up along the bottom. */
export function celebrate() {
  if (prefersReducedMotion()) return;
  confetti();
  const shots = 7;
  for (let i = 0; i < shots; i++) {
    setTimeout(() => firework(rand(innerWidth * 0.15, innerWidth * 0.85), rand(innerHeight * 0.12, innerHeight * 0.45)), i * 380);
  }
  lightDiyas();
}

function lightDiyas() {
  const row = document.createElement('div');
  row.className = 'diya-row';
  row.setAttribute('aria-hidden', 'true');
  const n = Math.max(5, Math.min(12, Math.floor(innerWidth / 110)));
  row.innerHTML = Array.from({ length: n }, (_, i) => `<span class="mini-diya" style="animation-delay:${i * 120}ms"><i></i></span>`).join('');
  document.body.appendChild(row);
  setTimeout(() => row.classList.add('is-out'), 3600);
  setTimeout(() => row.remove(), 4400);
}

function initTrail() {
  if (prefersReducedMotion() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let lastEmit = 0;
  window.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - lastEmit < 40) return;
    lastEmit = now;
    emit([{ x: e.clientX, y: e.clientY, vx: rand(-0.4, 0.4), vy: rand(0.2, 0.9), gravity: 0.02, drag: 0.97,
      size: rand(1.2, 2.4), life: rand(18, 28), fade: 18, color: pick(['#FFB800', '#FFE27A', '#FF9933']), kind: 'dot', rot: 0, spin: 0, glow: true }]);
  }, { passive: true });
}

export function initFestive() {
  canvas = document.getElementById('fx-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  addEventListener('resize', resize);
  initTrail();
  document.addEventListener('ss:sparkle', (e) => sparkle(e.detail.x, e.detail.y));
  document.addEventListener('ss:added', (e) => {
    const r = e.detail.from?.getBoundingClientRect?.();
    if (r) sparkle(r.left + r.width / 2, r.top + r.height / 2, 14);
  });
  document.addEventListener('ss:order-placed', celebrate);
  document.addEventListener('ss:celebrate', () => { confetti(80); });
}
