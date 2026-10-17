// Rendering helpers shared by every page.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape any value before putting it in HTML. Use for ALL database text. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Marks a string as already-safe HTML (output of html`` or raw()). */
class SafeHTML extends String {}

/**
 * Tagged template that escapes interpolated values:  html`<p>${sweet.name}</p>`
 * Nested html`` results and raw() values are inserted as-is; arrays are joined.
 * The result works anywhere a string does (innerHTML, concatenation).
 */
export function html(strings, ...values) {
  const one = (x) => (x instanceof SafeHTML ? String(x) : esc(x));
  const out = strings.reduce((acc, str, i) => {
    if (i >= values.length) return acc + str;
    const v = values[i];
    return acc + str + (Array.isArray(v) ? v.map(one).join('') : one(v));
  }, '');
  return new SafeHTML(out);
}

/** Trust this markup (only for strings built in code, never database text). */
export const raw = (value) => new SafeHTML(String(value ?? ''));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Small, non-blocking message. type: 'info' | 'success' | 'error' */
export function toast(message, type = 'info', ms = 3200) {
  const stack = document.getElementById('toasts');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** Format rupees: 1250 → "₹1,250" */
export function rupees(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * Sweet image markup: real photo when we have one, otherwise a designed
 * placeholder (gold gradient + rangoli + the sweet's name). If the photo
 * fails to load, ui.js swaps in the placeholder so nothing looks broken.
 */
export function sweetImage(sweet, { size = 'card' } = {}) {
  const alt = `${sweet.name}${sweet.name_hi ? ' (' + sweet.name_hi + ')' : ''}`;
  const ph = html`<span class="sweet-ph" data-size="${size}" aria-hidden="true">
      <span class="sweet-ph__name">${sweet.name}</span></span>`;
  if (!sweet.image_url) return html`<div class="sweet-img" role="img" aria-label="${alt}">${ph}</div>`;
  const width = { thumb: 330, card: 500, hero: 960 }[size] || 500;
  return html`<div class="sweet-img">
      <img src="${thumbUrl(sweet.image_url, width)}" alt="${alt}" loading="lazy" decoding="async"
           referrerpolicy="no-referrer" data-fallback>
      ${ph}</div>`;
}

/**
 * Wikimedia serves fixed thumbnail sizes (…/500px-File.jpg). Pick a smaller one
 * for cards so pages load fast. Other URLs (Supabase Storage) pass through.
 */
export function thumbUrl(url, width = 500) {
  if (!url || !url.includes('upload.wikimedia.org')) return url;
  if (/\/\d+px-[^/]+$/.test(url)) return url.replace(/\/(\d+)px-([^/]+)$/, (m, w, f) => (Number(w) > width ? `/${width}px-${f}` : m));
  // Original (un-thumbnailed) file: build the thumb path …/commons/thumb/a/ab/File.jpg/500px-File.jpg
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/);
  if (!m || /\.(svg|gif)$/i.test(m[4])) return url;
  return `${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${width}px-${m[4]}`;
}

/**
 * Accessible modal dialog. Returns { el, body, close }.
 *   const m = openModal({ title: 'Login', content: '<form>…</form>' });
 * Closes on Esc, backdrop click or the × button; focus is trapped inside and
 * restored to the opener afterwards. onClose(reason) fires once.
 */
export function openModal({ title = '', content = '', size = 'md', onClose, className = '' } = {}) {
  const opener = document.activeElement;
  const root = document.getElementById('modal-root') || document.body;
  const wrap = document.createElement('div');
  wrap.className = `modal ${className}`;
  wrap.innerHTML = html`
    <div class="modal__backdrop" data-close></div>
    <div class="modal__panel modal__panel--${size}" role="dialog" aria-modal="true"
         aria-label="${title}" tabindex="-1">
      <button class="icon-btn modal__x" type="button" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="modal__body"></div>
    </div>`;
  const body = wrap.querySelector('.modal__body');
  if (typeof content === 'string') body.innerHTML = content; else if (content) body.append(content);
  root.appendChild(wrap);
  document.body.classList.add('has-modal');
  requestAnimationFrame(() => wrap.classList.add('is-open'));

  let closed = false;
  const close = (reason = 'api') => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('is-open');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => {
      wrap.remove();
      if (!document.querySelector('.modal')) document.body.classList.remove('has-modal');
      if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    }, prefersReducedMotion() ? 0 : 220);
    onClose?.(reason);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close('esc'); }
    if (e.key === 'Tab') trapFocus(e, wrap);
  };
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close('dismiss'); });
  document.addEventListener('keydown', onKey, true);

  const panel = wrap.querySelector('.modal__panel');
  const first = body.querySelector('[autofocus], input, select, textarea, button');
  (first || panel).focus({ preventScroll: true });
  return { el: wrap, body, close };
}

function trapFocus(e, container) {
  const nodes = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', container)
    .filter((n) => n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}

/** Rangoli loader markup (draws itself; static under reduced motion). */
export function rangoliLoader(label = 'Loading…') {
  return html`<div class="rangoli-loader" role="status">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" stroke-width="3" stroke-linecap="round">
        <circle cx="50" cy="50" r="10" stroke="var(--rani-pink)"/>
        <path d="M50 18c8 10 8 18 0 22c-8-4-8-12 0-22zM82 50c-10 8-18 8-22 0c4-8 12-8 22 0zM50 82c-8-10-8-18 0-22c8 4 8 12 0 22zM18 50c10-8 18-8 22 0c-4 8-12 8-22 0z" stroke="var(--saffron)"/>
        <path d="M27 27c11 2 15 8 12 12c-5 2-10-2-12-12zM73 27c-2 11-8 15-12 12c-2-5 2-10 12-12zM73 73c-11-2-15-8-12-12c5-2 10 2 12 12zM27 73c2-11 8-15 12-12c2 5-2 10-12 12z" stroke="var(--gold-deep)"/>
        <circle cx="50" cy="50" r="44" stroke="var(--marigold)" stroke-dasharray="4 7"/>
      </g>
    </svg>
    <span>${label}</span></div>`;
}

/** Empty / error state block. */
export function emptyState({ icon = '🪔', title, text = '', action = '' }) {
  return html`<div class="empty-state">
    <div class="empty-state__icon" aria-hidden="true">${icon}</div>
    <h3>${title}</h3>${text ? raw(html`<p class="muted">${text}</p>`) : ''}${raw(action)}</div>`;
}

// One listener for every sweet photo: on error, hide the <img> and show the placeholder.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.hasAttribute('data-fallback')) {
    img.closest('.sweet-img')?.classList.add('is-fallback');
    img.remove();
  }
}, true);
