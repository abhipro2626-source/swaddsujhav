// Sweet overview modal: story, ingredients, taste bars, weights, shayari and
// three recommendation rows ("More like this", "Goes great with", "Customers also bought").
import { openModal, html, raw, rupees, sweetImage, $ } from '../ui.js';
import { t, sweetName } from '../i18n.js';
import { getBySlug, loadCatalog, isVariantAvailable, shayariFor, CATEGORY_LABELS } from '../catalog.js';
import { FLAGS, sweetCard, stepper, skeletonCards } from '../cards.js';
import { add, qtyOf, logEvent } from '../cart.js';
import { isFav } from '../favorites.js';
import { related } from '../recommend.js';
import { store, local } from '../state.js';
import { comboPicks, comboHTML } from '../combos.js';
import { freshFor, dealFor, dealPrice } from '../live.js';
import { agoText } from '../feature-config.js';
import { toast } from '../ui.js';

let current = null;

export async function openSweet(slug, { onClose } = {}) {
  await loadCatalog();
  const s = getBySlug(slug);
  if (!s) return null;
  if (current) current.close('replace');
  logEvent('view', s.id);

  let selected = (s.variants.find(isVariantAvailable) || s.variants[0])?.id;
  const modal = openModal({
    title: s.name, size: 'lg', className: 'detail-modal',
    onClose: (reason) => { if (current === modal) current = null; onClose?.(reason); },
  });
  current = modal;

  const bar = (label, value, max = 5) => html`
    <div class="taste-bar"><span>${label}</span>
      <span class="taste-bar__track" role="meter" aria-valuemin="1" aria-valuemax="${max}" aria-valuenow="${value}" aria-label="${label} ${value} of ${max}">
        <span class="taste-bar__fill" style="--v:${(value / max) * 100}%"></span></span></div>`;

  const diet = [
    s.is_sugar_free && '🩺 Sugar-free', s.is_vegan && '🌱 Vegan', s.is_jain && '🙏 Jain',
    s.is_eggless && '🥚 Eggless', s.is_gluten_free && '🌾 Gluten-free',
  ].filter(Boolean);

  const renderBuy = () => {
    const v = s.variants.find((x) => x.id === selected);
    const avail = v && isVariantAvailable(v) && s.in_stock;
    const q = v ? qtyOf(v.id) : 0;
    const deal = avail ? dealFor(s.id) : null;
    return html`
      ${deal ? html`<p class="detail-deal">⏰ Last-hour deal: <strong>${deal.percent}% off</strong> right now${deal.kg_left != null ? ` · sirf ${Number(deal.kg_left).toFixed(1)} kg bacha` : ''}</p>` : ''}
      <fieldset class="weights">
        <legend>${t('choose_weight')}</legend>
        ${s.variants.map((x) => {
          const ok = isVariantAvailable(x);
          return html`<label class="weight ${ok ? '' : 'is-out'}">
            <input type="radio" name="w-${s.id}" value="${x.id}" ${x.id === selected ? 'checked' : ''} ${ok ? '' : 'disabled'}>
            <span class="weight__label">${x.weight_label}</span>
            <span class="weight__price">${rupees(x.price)}</span>
            ${!ok ? html`<span class="weight__note">${t('out_of_stock')}</span>`
              : x.stock_qty != null && x.stock_qty <= 5 ? html`<span class="weight__note">${t('only_left', { n: x.stock_qty })}</span>` : ''}
          </label>`;
        })}
      </fieldset>
      <div class="detail__buy">
        ${avail
          ? q ? stepper(v.id, q, s.name)
              : html`<button type="button" class="btn btn--gold btn--lg" data-detail-add>
                  <svg aria-hidden="true"><use href="#i-cart"/></svg> ${t('add_to_cart')} · ${deal ? html`<s>${rupees(v.price)}</s> ${rupees(dealPrice(s.id, v.price))}` : rupees(v.price)}</button>`
          : html`<button type="button" class="btn btn--lg" disabled>${t('out_of_stock')}</button>`}
        <button type="button" class="icon-btn fav-btn fav-btn--inline ${isFav(s.id) ? 'is-on' : ''}" data-fav="${s.id}"
          aria-pressed="${isFav(s.id) ? 'true' : 'false'}" aria-label="Favourite ${s.name}">
          <svg aria-hidden="true"><use href="#i-heart${isFav(s.id) ? '-fill' : ''}"/></svg></button>
      </div>`;
  };

  modal.body.innerHTML = html`
  <article class="detail" data-sweet="${s.id}">
    <div class="detail__media">
      ${sweetImage(s, { size: 'hero' })}
      ${s.image_credit ? html`<p class="detail__credit">${s.image_credit}</p>` : ''}
    </div>
    <div class="detail__info">
      <p class="detail__kicker">
        <span class="region-badge">${FLAGS[s.country] || '🌍'} ${s.region}${s.country !== 'India' ? '' : ', India'}</span>
        <span class="chip chip--sm">${CATEGORY_LABELS[s.category] || s.category}</span>
        ${s.is_new ? html`<span class="tag tag--new">New</span>` : ''}
      </p>
      <h2 class="detail__name">${sweetName(s)}</h2>
      <p class="detail__alt deva">${store.get('lang') === 'hi' ? s.name : s.name_hi || ''}</p>
      <p class="detail__rating"><svg aria-hidden="true"><use href="#i-star"/></svg> ${Number(s.rating).toFixed(1)}
        <span class="muted">(${s.rating_count} reviews)</span></p>
      <p class="detail__desc">${s.description}</p>
      <div id="buy-slot">${renderBuy()}</div>
      ${freshness(s)}
      <button type="button" class="link-btn" data-plan-wish>👨‍👩‍👧 Add to my Rishtedaar gift plan</button>
      ${diet.length ? html`<p class="diet-badges">${diet.map((d) => html`<span class="chip chip--sm">${d}</span>`)}</p>` : ''}
    </div>

    <div class="detail__more">
      <section class="detail__section">
        <h3>📜 ${t('story')}</h3>
        <p>${s.origin_story}</p>
      </section>
      <section class="detail__section detail__grid">
        <div>
          <h3>🥣 ${t('ingredients')}</h3>
          <ul class="ingredients">${(s.ingredients || []).map((i) => html`<li>${i}</li>`)}</ul>
          <h3>⚠️ ${t('allergens')}</h3>
          <p>${s.allergens?.length ? s.allergens.join(', ') : 'None of the common allergens'}</p>
        </div>
        <div>
          <h3>👅 ${t('taste')}</h3>
          ${bar(t('t_sweetness'), s.sweetness)}
          ${bar(t('t_richness'), s.richness)}
          <p class="taste-texture">${t('t_texture')}: <strong>${s.texture || '—'}</strong></p>
        </div>
      </section>
      ${s.product_type === 'mithai' ? html`<section class="detail__section" id="combo-slot" hidden><h3>🥨 Iske saath namkeen?</h3><div></div></section>` : ''}
      <section class="detail__section shayari-card" id="shayari-slot" aria-live="polite">
        <p class="muted">Paaji shayari likh rahe hain…</p>
      </section>
      <div id="rel-content">${relRow('rel-content', t('more_like'), '🍬')}</div>
      <div id="rel-together">${relRow('rel-together', t('goes_with'), '🤝')}</div>
      <div id="rel-also">${relRow('rel-also', t('also_bought'), '👥')}</div>
    </div>
  </article>`;

  // Weight choice
  modal.body.addEventListener('change', (e) => {
    if (e.target.name === `w-${s.id}`) { selected = Number(e.target.value); $('#buy-slot', modal.body).innerHTML = renderBuy(); }
  });
  modal.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-plan-wish]')) {
      const wish = new Set(local.get('ss:plan-wish', []));
      wish.add(s.id);
      local.set('ss:plan-wish', [...wish].slice(-12));
      toast(`${s.name} gift planner mein yaad rakhi ji. Planner kholne par Paaji isse shamil karenge.`, 'success', 4200);
      return;
    }
    const b = e.target.closest('[data-detail-add]');
    if (b) {
      const v = s.variants.find((x) => x.id === selected);
      if (add(s, v, 1, { from: b })) $('#buy-slot', modal.body).innerHTML = renderBuy();
    }
  });
  const refresh = () => { const slot = $('#buy-slot', modal.body); if (slot) slot.innerHTML = renderBuy(); };
  const unsub = store.on('cart', refresh);
  document.addEventListener('ss:favs', refresh);
  const origClose = modal.close;
  modal.close = (r) => { unsub(); document.removeEventListener('ss:favs', refresh); origClose(r); };

  // Shayari (async)
  shayariFor(s).then((sh) => {
    const slot = $('#shayari-slot', modal.body);
    if (!slot) return;
    if (!sh) { slot.remove(); return; }
    let lang = 'hi';
    const draw = () => {
      slot.innerHTML = html`
        <div class="shayari-card__head"><h3>✍️ Paaji ki shayari</h3>
          <button type="button" class="link-btn" data-sh-toggle>${lang === 'hi' ? 'English' : 'हिंदी'}</button></div>
        <blockquote class="shayari ${lang === 'hi' ? 'deva' : ''}">${(lang === 'hi' ? sh.text_hi : sh.text_en).split('\n').map((l) => html`<span>${l}</span>`)}</blockquote>
        ${lang === 'hi' ? html`<p class="shayari__roman muted">${sh.text_roman}</p>` : ''}`;
    };
    slot.addEventListener('click', (e) => { if (e.target.closest('[data-sh-toggle]')) { lang = lang === 'hi' ? 'en' : 'hi'; draw(); } });
    draw();
  }).catch(() => $('#shayari-slot', modal.body)?.remove());

  // Namkeen pairing (async)
  if (s.product_type === 'mithai') {
    comboPicks([s.id], 3).then((picks) => {
      const slot = $('#combo-slot', modal.body);
      if (!slot || !picks.length) return;
      slot.querySelector('div').innerHTML = comboHTML(picks);
      slot.hidden = false;
    }).catch(() => {});
  }

  // Recommendation rows (async)
  for (const [kind, id, title, icon] of [['content', 'rel-content', t('more_like'), '🍬'], ['together', 'rel-together', t('goes_with'), '🤝'], ['also', 'rel-also', t('also_bought'), '👥']]) {
    related(s, kind, 10).then(({ items, reasons }) => {
      const slot = $(`#${id}`, modal.body);
      if (!slot) return;
      slot.innerHTML = items.length ? html`
        <section class="detail__section rel">
          <h3>${icon} ${title}</h3>
          <div class="row__track row__track--compact">${items.map((x) => sweetCard(x, { reason: reasons.get(x.id), compact: true }))}</div>
        </section>` : '';
    }).catch(() => { const slot = $(`#${id}`, modal.body); if (slot) slot.innerHTML = ''; });
  }
  return modal;
}

/** Aaj ka Taaza: made at, best before and a freshness bar. */
function freshness(s) {
  const f = freshFor(s.id);
  if (!f) return '';
  const made = new Date(f.made_at);
  const best = new Date(f.best_before);
  const pct = Math.max(4, Math.min(100, ((best - Date.now()) / (best - made)) * 100));
  return html`<div class="freshness">
    <p><strong>🔥 Aaj ka Taaza</strong> · Bana: ${made.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} (<span data-ago="${f.made_at}">${agoText(f.made_at)}</span>)
      · Best before: ${best.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
    <div class="freshness__bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="Freshness ${Math.round(pct)} percent">
      <span style="--w:${pct}%"></span></div>
  </div>`;
}

function relRow(id, title, icon) {
  return html`<section class="detail__section rel"><h3>${icon} ${title}</h3>
    <div class="row__track row__track--compact">${skeletonCards(4)}</div></section>`;
}

export const closeSweet = () => current?.close('route');
