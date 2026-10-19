// Deepawali scratch card. The prize was already chosen by the database when the
// order was placed (assign_scratch_reward); the browser learns it only when the
// customer starts scratching (reveal_scratch_card), which also creates the coupon.
import { html, raw, prefersReducedMotion, rupees } from './ui.js';
import { supabase } from './supabase.js';
import { paajiSay } from './lines.js';

const REVEAL_AT = 0.55;

export async function mountScratch(slot, orderId) {
  if (!slot || !supabase) return;
  const { data: card } = await supabase.rpc('my_scratch_card', { p_order_id: orderId });
  if (!card || (card.expired && !card.scratched)) return;
  slot.innerHTML = html`
    <section class="scratch" aria-labelledby="scratch-title">
      <h2 id="scratch-title" class="row__title">🪔 Deepawali Scratch Card</h2>
      <div class="scratch__card">
        <div class="scratch__prize" aria-live="polite">${card.scratched ? prizeHTML(card.prize) : html`<span class="muted">Ghis ke dekho…</span>`}</div>
        ${card.scratched ? '' : raw('<canvas aria-hidden="true"></canvas>')}
      </div>
      ${card.scratched ? '' : html`<p class="scratch__hint">Ungli ya mouse se ghiso ✨ · <button type="button" class="link-btn" data-reveal>Tap to reveal</button></p>`}
    </section>`;
  if (card.scratched) return;

  const canvas = slot.querySelector('canvas');
  const box = slot.querySelector('.scratch__card');
  const prizeEl = slot.querySelector('.scratch__prize');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let revealed = null;          // Promise of the prize once scratching starts
  let done = false;

  const size = () => {
    const r = box.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    paintFoil(ctx, canvas.width, canvas.height);
  };
  size();

  const ensurePrize = () => {
    revealed ||= supabase.rpc('reveal_scratch_card', { p_card_id: card.id }).then(({ data, error }) => {
      if (error) throw error;
      prizeEl.innerHTML = prizeHTML(data.prize);
      return data.prize;
    });
    return revealed;
  };

  const finish = async () => {
    if (done) return;
    done = true;
    let prize = null;
    try { prize = await ensurePrize(); } catch (e) { prizeEl.textContent = e.message || 'Could not open the card.'; }
    canvas.classList.add('is-gone');
    slot.querySelector('.scratch__hint')?.remove();
    const r = box.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      setTimeout(() => document.dispatchEvent(new CustomEvent('ss:sparkle', { detail: { x: r.left + r.width * (0.2 + Math.random() * 0.6), y: r.top + r.height * (0.2 + Math.random() * 0.6) } })), i * 120);
    }
    if (prize && prize.kind !== 'none') {
      document.dispatchEvent(new CustomEvent('ss:celebrate'));
      paajiSay('scratch_win', { prize: prize.label }, { mood: 'celebrate', priority: 'high' });
    } else {
      paajiSay('scratch_lose', {}, { mood: 'think', priority: 'high' });
    }
  };

  let drawing = false;
  let last = null;
  let moves = 0;
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
  };
  const scratchAt = (p) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 34 * dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...(last || p));
    ctx.lineTo(...p);
    ctx.stroke();
    last = p;
    if (++moves % 8 === 0 && clearedShare(ctx, canvas) >= REVEAL_AT) finish();
  };
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true; last = null; canvas.setPointerCapture(e.pointerId);
    ensurePrize().catch(() => {});
    scratchAt(point(e));
  });
  canvas.addEventListener('pointermove', (e) => { if (drawing) scratchAt(point(e)); });
  const stop = () => { drawing = false; last = null; if (!done && clearedShare(ctx, canvas) >= REVEAL_AT) finish(); };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  slot.querySelector('[data-reveal]')?.addEventListener('click', finish);
  if (prefersReducedMotion()) slot.querySelector('.scratch__hint').firstChild.textContent = 'Reduced motion is on — ';
}

function prizeHTML(p) {
  if (!p) return html`<strong>Better luck next time</strong>`;
  if (p.kind === 'none') return html`<strong>Agli baar pakka! 🪔</strong><span class="small">${p.shayari || 'Mithaas toh har baar milegi ji.'}</span>`;
  return html`<span class="small">Aapne jeeta</span><strong>${p.label}</strong>
    ${p.code ? html`<code>${p.code}</code>` : ''}
    <span class="small">${Number(p.min_order) ? `On orders above ${rupees(p.min_order)} · ` : ''}valid till ${new Date(p.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · saved in Mere Coupons</span>`;
}

/** Share of the foil already scratched off (sampled for speed). */
function clearedShare(ctx, canvas) {
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let clear = 0;
  let total = 0;
  for (let i = 3; i < data.length; i += 4 * 24) { total++; if (data[i] < 40) clear++; }
  return total ? clear / total : 0;
}

/** Gold foil with a diya + rangoli pattern, drawn in code (original artwork). */
function paintFoil(ctx, w, h) {
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#B8860B'); g.addColorStop(0.25, '#FFE27A'); g.addColorStop(0.5, '#C8961E'); g.addColorStop(0.75, '#FFF1B5'); g.addColorStop(1, '#C8961E');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(107,15,26,.28)';
  ctx.lineWidth = Math.max(1, w / 220);
  const cx = w / 2;
  const cy = h / 2;
  for (let ring = 1; ring <= 3; ring++) {
    const r = (Math.min(w, h) / 8) * ring;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r / 4, r / 9, a, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Diya in the middle
  ctx.fillStyle = 'rgba(107,15,26,.55)';
  ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.08, w * 0.09, h * 0.06, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = 'rgba(255,107,26,.8)';
  ctx.beginPath(); ctx.ellipse(cx, cy - h * 0.02, w * 0.018, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(107,15,26,.75)';
  ctx.font = `700 ${Math.round(h * 0.11)}px Poppins, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('GHISO AUR JEETO', cx, h * 0.88);
}
