// Rishtedaar Gift Planner — one budget, every relative, a box each.
// 1 Occasion & budget → 2 People (+ preferences) → 3 Paaji plans → 4 Review & swap
// → 5 Gift card shayari → 6 One order (prices re-checked in Postgres) → 7 Tracking.
// The planner runs in the browser; dietary rules are enforced again by the database.
import { html, raw, rupees, sweetImage, rangoliLoader, emptyState, toast, $ } from '../ui.js';
import { supabase } from '../supabase.js';
import { store, local } from '../state.js';
import { loadCatalog, getById } from '../catalog.js';
import { sweetName } from '../i18n.js';
import { CONFIG, loadSettings } from '../feature-config.js';
import { freshFor } from '../live.js';
import { paajiSay } from '../lines.js';
import { openAuthModal } from '../account.js';
import { myCoupons, couponUsable } from '../pricing.js';

const OCCASIONS = [['diwali', '🪔 Deepawali'], ['bhai-dooj', '🧿 Bhai Dooj'], ['wedding', '💍 Wedding season'], ['rakhi', '🧵 Raksha Bandhan'], ['eid', '🌙 Eid'], ['new-year', '🎆 New Year']];
const RELATIONS = ['Mausi', 'Chacha ki family', 'Bua', 'Mama ji', 'Nani', 'Dadi', 'Bhai', 'Behen', 'Boss', 'Office team', 'Padosi', 'Dost'];
const PREFS = [['sugar_free', '🩺 Sugar-free'], ['no_nuts', '🥜 No dry fruits / nut allergy'], ['jain', '🙏 Jain'], ['no_milk', '🥛 No milk'],
  ['loves_dry_fruit', '🌰 Loves dry fruits'], ['loves_bengali', '🐟 Loves Bengali sweets'], ['wants_namkeen', '🥨 Add namkeen'], ['kids', '🧒 Kids in the house']];
const IMPORTANCE = [['very', 'Very important'], ['normal', 'Normal'], ['token', 'Small token']];
const SIZES = [250, 500, 750, 1000, 1500, 2000];
const FEE = 49;

// Original gift-card lines by occasion mood and relation.
const SHAYARI = {
  elder: ['Aapke aashirwad se roshan hai har deep,\nmithaas bhari ho aapki har reet.', 'Badon ka pyaar, mithai ki mithaas,\ndono se hi tyohaar hai khaas.'],
  sibling: ['Bachpan ki ladaai, aaj ki mithaas,\ntu hi mera sabse pyaara khaas.', 'Rishta humara jaise kaju ki katli,\nthoda sa meetha, kabhi na tooti.'],
  work: ['Saath kaam kiya, saath muskuraye,\nis tyohaar pe mooh meetha karaye.', 'Mehnat aapki, safalta sabki,\nmithaas bhari ho har ek ghadi.'],
  friend: ['Dosti ki chashni mein doobi rahe zindagi,\nhar din ho jaise tyohaar ki khushi.', 'Padosi bhi parivaar se kam nahi,\nmithai baantne mein sharm nahi.'],
  kids: ['Laddoo jaise gol-matol muskaan,\nbachchon se hi hai ghar ki shaan.'],
};
const relKind = (r = '') => {
  const x = r.toLowerCase();
  if (/(boss|office|colleague|team|sir|madam)/.test(x)) return 'work';
  if (/(bhai|behen|didi|bhaiya|sister|brother)/.test(x)) return 'sibling';
  if (/(dost|friend|padosi|neighbour|neighbor)/.test(x)) return 'friend';
  if (/(bachch|kids|child)/.test(x)) return 'kids';
  return 'elder';
};

const NUTS = ['cashew', 'almond', 'pistachio', 'kaju', 'badam', 'pista', 'peanut', 'peanuts', 'walnut'];
/** Mirror of public.fits_prefs — the database checks it again at checkout. */
export function fitsPrefs(s, p = {}) {
  if (p.sugar_free && !(s.is_sugar_free || (s.product_type === 'namkeen' && !(s.taste_tags || []).includes('sweet')))) return false;
  if (p.no_nuts && (s.category === 'dry-fruit' || (s.allergens || []).some((a) => ['nuts', 'tree nuts', ...NUTS].includes(a)) || (s.ingredients || []).some((i) => NUTS.includes(i)))) return false;
  if (p.jain && !s.is_jain) return false;
  if (p.no_milk && !s.is_vegan) return false;
  return true;
}

const variantFor = (s, grams) => s.variants.find((v) => v.grams === grams && (v.stock_qty == null || v.stock_qty > 0))
  || s.variants.find((v) => v.grams && (v.stock_qty == null || v.stock_qty > 0));

/** Build one box for a recipient within a money target. */
function planBox(r, target, all, used, wish, targetGrams = null) {
  const p = r.prefs || {};
  const pool = all.filter((s) => s.in_stock && s.variants.some((v) => v.grams) && fitsPrefs(s, p));
  const mithai = pool.filter((s) => s.product_type === 'mithai' && s.country === 'India');
  const score = (s) => {
    let n = Math.min(s.popularity, 400) / 100;
    if (p.loves_dry_fruit && s.category === 'dry-fruit') n += 4;
    if (p.loves_bengali && s.category === 'bengali') n += 4;
    if (p.kids && (['laddoo'].includes(s.category) || /chocolate/i.test(s.name))) n += 2.5;
    if (p.sugar_free && s.is_sugar_free) n += 3;
    if (s.is_festive) n += 1;
    if (freshFor(s.id)) n += 0.8;
    if (wish.has(s.id)) n += 5;
    if (used.has(s.id)) n -= 3;                 // avoid giving everyone the same box
    if (s.shelf_life_days <= 2) n -= 1;         // boxes travel; prefer sweets that keep
    return n;
  };
  const why = (s) => {
    if (p.sugar_free && s.is_sugar_free) return `Sugar-free kyunki ${r.name} meetha kam khaate hain`;
    if (p.loves_dry_fruit && s.category === 'dry-fruit') return `${s.name} kyunki unhe dry fruits pasand hain`;
    if (p.loves_bengali && s.category === 'bengali') return 'Bengali mithai — unki pasand';
    if (p.kids && s.category === 'laddoo') return 'Bachchon ke liye laddoo';
    if (wish.has(s.id)) return 'Aapne khud chuni thi';
    if (p.no_nuts) return 'Bina dry fruit — allergy ka dhyaan';
    if (s.is_festive) return 'Tyohaar special';
    return 'Sabki pasand';
  };
  const ranked = [...mithai].sort((a, b) => score(b) - score(a));
  const items = [];
  let value = FEE;
  const grams = targetGrams || (target < 260 ? 250 : target < 520 ? 500 : target < 900 ? 750 : target < 1500 ? 1000 : target < 2200 ? 1500 : 2000);
  let gramsLeft = grams;
  if (p.wants_namkeen) {
    const nk = pool.filter((s) => s.product_type === 'namkeen').sort((a, b) => b.popularity - a.popularity + (used.has(a.id) - used.has(b.id)) * 50)[0];
    const v = nk && variantFor(nk, 250);
    if (v) { items.push({ sweet: nk, variant: v, qty: 1, reason: 'Namkeen bhi chahiye tha — meethe ke saath balance' }); value += Number(v.price); gramsLeft -= 250; }
  }
  for (const s of ranked) {
    if (gramsLeft < 250) break;
    const size = gramsLeft >= 1000 && items.length < 1 ? 500 : gramsLeft >= 500 && (target - value) > 600 ? 500 : 250;
    const v = variantFor(s, size) || variantFor(s, 250);
    if (!v || items.some((i) => i.sweet.id === s.id)) continue;
    if (value + Number(v.price) > target * 1.06 && items.length) continue;
    items.push({ sweet: s, variant: v, qty: 1, reason: why(s) });
    value += Number(v.price);
    gramsLeft -= v.grams;
    if (items.length >= 4) break;
  }
  items.forEach((i) => used.add(i.sweet.id));
  return { size_label: `${grams >= 1000 ? `${grams / 1000}kg` : `${grams}g`}`, items, est: value };
}

export async function renderGiftPlanner(view) {
  if (!store.get('user')) {
    view.innerHTML = html`<div class="page container page--narrow"><section class="guest-card">
      <span class="guest-card__diya" aria-hidden="true">👨‍👩‍👧</span><h1 class="page-title">Rishtedaar Gift Planner</h1>
      <p class="muted">Saare rishtedaar, ek budget — Paaji har ek ke liye sahi dabba banayenge. Log in so your plan is saved.</p>
      <div class="guest-card__cta"><button type="button" class="btn btn--gold btn--lg" data-auth="login">Log in</button>
        <button type="button" class="btn btn--lg" data-auth="signup">Sign up</button></div></section></div>`;
    view.addEventListener('click', (e) => { const b = e.target.closest('[data-auth]'); if (b) openAuthModal(b.dataset.auth); });
    return;
  }
  view.innerHTML = html`<div class="page container">${raw(rangoliLoader('Gift planner khul raha hai…'))}</div>`;
  await Promise.all([loadCatalog(), loadSettings().catch(() => null)]);
  const all = window.__ssCatalog || [];
  const uid = store.get('user').id;
  const { data: plans } = await supabase.from('gift_plans').select('*, gift_recipients(*), gift_boxes(*, gift_box_items(*))').order('updated_at', { ascending: false });
  const wish = new Set(local.get('ss:plan-wish', []));

  const fromDb = (pl) => ({
    id: pl.id, title: pl.title, occasion: pl.occasion, budget_mode: pl.budget_mode, budget: Number(pl.budget), sender: pl.sender_name || '',
    status: pl.status, order_id: pl.order_id,
    people: (pl.gift_recipients || []).sort((a, b) => a.sort_order - b.sort_order).map((r) => {
      const box = (pl.gift_boxes || []).find((b) => b.recipient_id === r.id);
      return {
        key: `r${r.id}`, name: r.name, relation: r.relation, household: r.household, prefs: r.prefs || {}, importance: r.importance,
        deliver_self: r.deliver_self, address: r.address || {}, deliver_on: r.deliver_on || '', message: r.message || '',
        box: box ? { size_label: box.size_label, price: Number(box.price), status: box.status, shayari: box.shayari,
          items: (box.gift_box_items || []).map((i) => ({ sweet: getById(i.sweet_id), variant: getById(i.sweet_id)?.variants.find((v) => v.id === i.variant_id), qty: i.qty, reason: i.reason })).filter((i) => i.sweet && i.variant) } : null,
      };
    }),
  });
  const draft = plans?.find((p) => p.status === 'draft');
  let plan = draft ? fromDb(draft) : { id: null, title: 'Deepawali gifts', occasion: 'diwali', budget_mode: 'total', budget: 4000, sender: store.get('profile')?.name || '', status: 'draft', people: [] };
  let step = plan.people.some((p) => p.box) ? 4 : plan.people.length ? 2 : 1;
  let editing = null;

  const totalBudget = () => (plan.budget_mode === 'total' ? plan.budget : plan.budget * Math.max(1, plan.people.length));
  const spent = () => plan.people.reduce((n, p) => n + (p.box ? boxPrice(p.box) : 0), 0);
  const boxPrice = (b) => FEE + b.items.reduce((n, i) => n + Number(i.variant.price) * i.qty, 0);

  function planAll() {
    const B = totalBudget();
    const maxHH = Math.max(1, ...plan.people.map((p) => p.household));
    const w = plan.people.map((p) => (CONFIG.importanceWeight[p.importance] || 1) * (0.6 + 0.4 * Math.sqrt(p.household / maxHH)));
    const W = w.reduce((a, b) => a + b, 0) || 1;
    const used = new Set();
    plan.people.forEach((p, i) => {
      const share = plan.budget_mode === 'total' ? (B * w[i]) / W : plan.budget;
      p.box = { ...planBox(p, share, all, used, wish), status: 'planned', shayari: pickShayari(p) };
    });
  }
  const pickShayari = (p) => { const list = SHAYARI[relKind(p.relation)]; return list[Math.floor(Math.random() * list.length)]; };

  async function save() {
    const row = { user_id: uid, title: plan.title, occasion: plan.occasion, budget_mode: plan.budget_mode, budget: plan.budget, sender_name: plan.sender, updated_at: new Date().toISOString() };
    if (plan.id) {
      const { error } = await supabase.from('gift_plans').update(row).eq('id', plan.id);
      if (error) throw error;
      await supabase.from('gift_recipients').delete().eq('plan_id', plan.id);
    } else {
      const { data, error } = await supabase.from('gift_plans').insert(row).select('id').single();
      if (error) throw error;
      plan.id = data.id;
    }
    for (const [i, p] of plan.people.entries()) {
      const { data: r, error } = await supabase.from('gift_recipients').insert({
        plan_id: plan.id, name: p.name, relation: p.relation, household: p.household, prefs: p.prefs, importance: p.importance,
        deliver_self: p.deliver_self, address: p.deliver_self ? null : p.address, deliver_on: p.deliver_on || null, message: p.message || null, sort_order: i,
      }).select('id').single();
      if (error) throw error;
      if (!p.box) continue;
      const { data: b, error: e2 } = await supabase.from('gift_boxes').insert({
        plan_id: plan.id, recipient_id: r.id, size_label: p.box.size_label, reasons: p.box.items.map((x) => x.reason), shayari: p.box.shayari,
      }).select('id').single();
      if (e2) throw e2;
      if (p.box.items.length) {
        const { error: e3 } = await supabase.from('gift_box_items').insert(p.box.items.map((x) => ({ box_id: b.id, sweet_id: x.sweet.id, variant_id: x.variant.id, qty: x.qty, reason: x.reason })));
        if (e3) throw e3;
      }
    }
    const { data: priced } = await supabase.rpc('price_gift_plan', { p_plan_id: plan.id });
    return priced;
  }

  // ---------------------------------------------------------------- views
  const stepsBar = () => html`<ol class="steps-bar" aria-label="Planner steps">${['Occasion & budget', 'People', 'Paaji plans', 'Review', 'Gift cards', 'Order'].map((l, i) =>
    html`<li class="${step >= i + 1 ? 'is-on' : ''}">${i + 1} · ${l}</li>`)}</ol>`;

  const budgetBar = () => {
    const B = totalBudget();
    const s = spent();
    const over = s > B;
    return html`<div class="budget-bar ${over ? 'is-over' : ''}" role="status">
      <div class="row-actions"><strong>${rupees(s)}</strong> <span class="muted">of ${rupees(B)} budget</span>
        <span class="muted small">${over ? `⚠️ ${rupees(s - B)} over — shrink a box or raise the budget` : `${rupees(B - s)} left`}</span></div>
      <div class="budget-bar__track"><span style="--w:${Math.min(100, (s / (B || 1)) * 100)}%"></span></div></div>`;
  };

  const step1 = () => html`<section class="panel stack">
    <h2>1 · Kaunsa mauka, kitna budget?</h2>
    <div class="chips" role="radiogroup" aria-label="Occasion">${OCCASIONS.map(([k, l]) => html`<button type="button" class="chip chip--toggle ${plan.occasion === k ? 'is-on' : ''}" data-occ="${k}" role="radio" aria-checked="${plan.occasion === k ? 'true' : 'false'}">${l}</button>`)}</div>
    <div class="form-grid">
      <label class="field"><span>Plan name</span><input name="title" value="${plan.title}" maxlength="60"></label>
      <label class="field"><span>Your name (on the gift cards)</span><input name="sender" value="${plan.sender}" maxlength="40"></label>
      <label class="field"><span>Budget type</span><select name="mode"><option value="total" ${plan.budget_mode === 'total' ? 'selected' : ''}>Total for everyone</option><option value="per_person" ${plan.budget_mode === 'per_person' ? 'selected' : ''}>Per person / family</option></select></label>
      <label class="field"><span>Budget (₹)</span><input name="budget" type="number" min="200" step="100" inputmode="numeric" value="${plan.budget}"></label>
    </div>
    <button type="button" class="btn btn--gold" data-go="2">Next: add people →</button></section>`;

  const personForm = (p) => html`<form class="panel stack" id="person-form">
    <h3>${p.name ? `Edit ${p.name}` : 'Naya rishtedaar'}</h3>
    <div class="form-grid">
      <label class="field"><span>Name</span><input name="name" required maxlength="40" value="${p.name || ''}" placeholder="Mausi ji"></label>
      <label class="field"><span>Relation</span><input name="relation" list="rel-list" maxlength="40" value="${p.relation || ''}" placeholder="Mausi, Boss, Padosi…">
        <datalist id="rel-list">${RELATIONS.map((r) => html`<option value="${r}">`)}</datalist></label>
      <label class="field"><span>People in the house</span><input name="household" type="number" min="1" max="50" value="${p.household || 3}"></label>
      <label class="field"><span>Importance</span><select name="importance">${IMPORTANCE.map(([k, l]) => html`<option value="${k}" ${p.importance === k ? 'selected' : ''}>${l}</option>`)}</select></label>
    </div>
    <fieldset><legend>Preferences <span class="muted small">(only what's needed to pick the right sweets)</span></legend>
      <div class="chips">${PREFS.map(([k, l]) => html`<label class="chip"><input type="checkbox" name="pref" value="${k}" ${p.prefs?.[k] ? 'checked' : ''}> ${l}</label>`)}</div></fieldset>
    <label class="check"><input type="checkbox" name="self" ${p.deliver_self !== false ? 'checked' : ''}> I'll deliver it myself</label>
    <div class="form-grid" data-addr ${p.deliver_self !== false ? 'hidden' : ''}>
      <label class="field field--wide"><span>Address</span><input name="line1" maxlength="120" value="${p.address?.line1 || ''}"></label>
      <label class="field"><span>City</span><input name="city" maxlength="40" value="${p.address?.city || 'Muzaffarnagar'}"></label>
      <label class="field"><span>Phone</span><input name="phone" type="tel" maxlength="15" value="${p.address?.phone || ''}"></label>
    </div>
    <label class="field"><span>Delivery date</span><input name="date" type="date" value="${p.deliver_on || ''}"></label>
    <label class="check"><input type="checkbox" name="remember"> Save to my relatives list for next festival</label>
    <div class="row-actions"><button type="submit" class="btn btn--gold">Save person</button><button type="button" class="link-btn" data-cancel-person>Cancel</button></div>
  </form>`;

  const step2 = () => html`<section class="stack">
    <div class="panel__head"><h2>2 · Kis kis ko dena hai? (${plan.people.length})</h2>
      <div class="row-actions"><button type="button" class="btn btn--sm" data-saved>📒 Load saved relatives</button>
        <button type="button" class="btn btn--gold btn--sm" data-add-person>+ Add person</button></div></div>
    ${editing ? personForm(editing) : ''}
    ${plan.people.length ? html`<ul class="recipient-list">${plan.people.map((p, i) => html`<li class="recipient">
      <div class="recipient__head"><h3>${p.name}</h3><span class="chip chip--sm">${p.relation || '—'}</span>
        <span class="muted small">${p.household} people · ${IMPORTANCE.find((x) => x[0] === p.importance)?.[1]}</span>
        <span class="feature-banner__tools"><button type="button" class="link-btn" data-edit="${i}">Edit</button><button type="button" class="link-btn" data-del="${i}">Remove</button></span></div>
      <p class="chips">${PREFS.filter(([k]) => p.prefs?.[k]).map(([, l]) => html`<span class="chip chip--sm chip--pista">${l}</span>`)}</p></li>`)}</ul>`
      : raw(emptyState({ icon: '👨‍👩‍👧', title: 'Abhi koi nahi', text: 'Add Mausi, Chacha ki family, Boss… Paaji har ek ke liye alag dabba banayenge.' }))}
    <div class="row-actions"><button type="button" class="btn" data-go="1">← Back</button>
      <button type="button" class="btn btn--gold btn--lg" data-plan ${plan.people.length ? '' : 'disabled'}>🧔🏽 Paaji, plan karo!</button></div></section>`;

  const boxCard = (p, i) => html`<article class="gift-box-card">
    <header class="recipient__head"><h3>🎁 ${p.name}</h3><span class="chip chip--sm">${p.relation}</span>
      <strong class="feature-banner__tools">${rupees(boxPrice(p.box))}</strong></header>
    <label class="field field--inline"><span>Box size</span><select data-size-for="${i}">${SIZES.map((g) => {
      const l = g >= 1000 ? `${g / 1000}kg` : `${g}g`;
      return html`<option value="${g}" ${p.box.size_label === l ? 'selected' : ''}>${l}</option>`;
    })}</select></label>
    ${p.box.items.length ? html`<ul>${p.box.items.map((it, j) => html`<li>${sweetImage(it.sweet, { size: 'thumb' })}
      <div><strong>${sweetName(it.sweet)}</strong> <span class="muted small">${it.variant.weight_label} · ${rupees(it.variant.price)}</span>
        <p class="why">✓ ${it.reason}</p></div>
      <button type="button" class="btn btn--sm" data-swap="${i}:${j}" aria-label="Swap ${it.sweet.name}">⇄ Swap</button></li>`)}</ul>`
      : html`<p class="muted">Koi mithai in preferences mein fit nahi hui — preferences thodi badal ke dekho.</p>`}
    <p class="muted small">+ ${rupees(FEE)} festive box & card</p>
  </article>`;

  const step4 = () => html`<section class="stack">
    <h2>4 · Paaji ke dabbe — check karo, swap karo</h2>
    ${budgetBar()}
    <div class="box-board">${plan.people.map((p, i) => (p.box ? boxCard(p, i) : ''))}</div>
    <div class="row-actions"><button type="button" class="btn" data-go="2">← Edit people</button>
      <button type="button" class="btn" data-plan>↻ Re-plan all</button>
      <button type="button" class="btn btn--gold btn--lg" data-go="5">Next: gift cards →</button></div></section>`;

  const step5 = () => html`<section class="stack">
    <h2>5 · Har dabbe ke saath ek card</h2>
    <div class="box-board">${plan.people.map((p, i) => html`<article class="gift-box-card">
      <h3>💌 ${p.name}</h3>
      <div class="gift-card-note">${p.box?.shayari || ''}\n\n${p.message ? `${p.message}\n` : ''}— ${plan.sender || 'Aapka apna'}</div>
      <div class="row-actions"><button type="button" class="btn btn--sm" data-new-shayari="${i}">✍️ Doosri shayari</button></div>
      <label class="field"><span>Personal message (optional)</span><input data-msg="${i}" maxlength="200" value="${p.message || ''}"></label>
    </article>`)}</div>
    <div class="row-actions"><button type="button" class="btn" data-go="4">← Back</button><button type="button" class="btn btn--gold btn--lg" data-go="6">Next: order →</button></div></section>`;

  let coupons = [];
  const step6 = () => html`<section class="panel stack">
    <h2>6 · Ek hi order mein sab dabbe</h2>
    ${budgetBar()}
    <ul class="summary-lines">${plan.people.map((p) => html`<li><span class="summary-box" aria-hidden="true">🎁</span>
      <span class="summary-lines__name">${p.name}<small class="muted">${p.box?.size_label} · ${p.deliver_self ? 'I\'ll deliver' : `${p.address?.line1 || 'address needed!'}, ${p.address?.city || ''}`}${p.deliver_on ? ` · ${p.deliver_on}` : ''}</small></span>
      <strong>${rupees(p.box ? boxPrice(p.box) : 0)}</strong></li>`)}</ul>
    <div class="choice-row" role="radiogroup" aria-label="Payment">${[['cod', '💵 Cash on Delivery'], ['pay_at_shop', '🏪 Pay at Shop']].map(([v, l]) => html`
      <label class="choice"><input type="radio" name="pay" value="${v}" ${v === 'cod' ? 'checked' : ''}> <span><strong>${l}</strong></span></label>`)}</div>
    <label class="field"><span>🎟️ Coupon (optional)</span><input name="coupon" list="plan-coupons" maxlength="20" placeholder="SSAB12CD">
      <datalist id="plan-coupons">${coupons.map((c) => html`<option value="${c.code}">${c.label}</option>`)}</datalist></label>
    <p class="muted small">Prices are checked again by the shop's system. Every box must respect its preferences — the system refuses a box that doesn't.</p>
    <p class="checkout__error" role="alert" hidden></p>
    <div class="row-actions"><button type="button" class="btn" data-go="5">← Back</button><button type="button" class="btn btn--gold btn--lg" data-order>Place gift order 🪔</button></div></section>`;

  const ordered = (pl) => html`<section class="panel stack"><h2>📦 ${pl.title} — ordered</h2>
    <div class="box-board">${pl.people.map((p) => html`<article class="gift-box-card"><h3>🎁 ${p.name}</h3>
      <ol class="tracker">${['planned', 'packed', 'out_for_delivery', 'delivered'].map((k, i, arr) => {
        const at = arr.indexOf(p.box?.status || 'planned');
        return html`<li class="tracker__step ${i <= at ? 'is-done' : ''}"><span class="tracker__dot">${['📝', '📦', '🛵', '🎉'][i]}</span><span>${['Planned', 'Packed', 'Out for delivery', 'Delivered'][i]}</span></li>`;
      })}</ol></article>`)}</div>
    ${pl.order_id ? html`<a class="btn" href="#/order/${pl.order_id}">Order details</a>` : ''}</section>`;

  function draw() {
    const past = (plans || []).filter((p) => p.status === 'ordered').slice(0, 3).map(fromDb);
    view.innerHTML = html`<div class="page container planner">
      <header><h1 class="page-title">👨‍👩‍👧 Rishtedaar Gift Planner</h1>
        <p class="muted">Ek budget, saare rishtedaar — Paaji har ek ke liye sahi dabba chunenge, preferences ka poora dhyaan rakh ke.</p></header>
      ${stepsBar()}
      ${step === 1 ? step1() : step === 2 || step === 3 ? step2() : step === 4 ? step4() : step === 5 ? step5() : step6()}
      ${past.map(ordered)}
    </div>`;
  }

  const readStep1 = () => {
    const f = view.querySelector('.panel');
    if (!f?.querySelector('[name=budget]')) return;
    plan.title = f.querySelector('[name=title]').value.trim() || 'Gift plan';
    plan.sender = f.querySelector('[name=sender]').value.trim();
    plan.budget_mode = f.querySelector('[name=mode]').value;
    plan.budget = Math.max(200, Number(f.querySelector('[name=budget]').value) || 0);
  };

  view.addEventListener('click', async (e) => {
    const t = e.target;
    const occ = t.closest('[data-occ]');
    if (occ) { readStep1(); plan.occasion = occ.dataset.occ; draw(); return; }
    const go = t.closest('[data-go]');
    if (go) {
      if (step === 1) readStep1();
      const n = Number(go.dataset.go);
      if (n === 6) coupons = (await myCoupons().catch(() => [])).filter(couponUsable);
      if (n >= 5 && step === 4) { try { await save(); } catch (err) { toast(err.message, 'error'); return; } }
      step = n; editing = null; draw(); window.scrollTo({ top: 0 });
      return;
    }
    if (t.closest('[data-add-person]')) { editing = { prefs: {}, importance: 'normal', household: 3, deliver_self: true }; draw(); return; }
    if (t.closest('[data-cancel-person]')) { editing = null; draw(); return; }
    const ed = t.closest('[data-edit]');
    if (ed) { editing = { ...plan.people[Number(ed.dataset.edit)], idx: Number(ed.dataset.edit) }; draw(); return; }
    const del = t.closest('[data-del]');
    if (del) { plan.people.splice(Number(del.dataset.del), 1); draw(); return; }
    if (t.closest('[data-saved]')) {
      const { data } = await supabase.from('saved_relatives').select('*').order('name');
      if (!data?.length) { toast('Abhi koi saved list nahi hai ji — "Save to my relatives list" tick karo.', 'info', 4000); return; }
      for (const r of data) if (!plan.people.some((p) => p.name === r.name)) plan.people.push({ key: `s${r.id}`, name: r.name, relation: r.relation, household: r.household, prefs: r.prefs, importance: r.importance, deliver_self: !r.address, address: r.address || {}, deliver_on: '', message: '' });
      toast(`${data.length} rishtedaar load ho gaye!`, 'success');
      draw();
      return;
    }
    if (t.closest('[data-plan]')) {
      if (!plan.people.length) return;
      planAll();
      step = 4;
      try { await save(); } catch (err) { toast(err.message, 'error'); }
      draw();
      const first = plan.people.find((p) => p.box?.items.length);
      const over = spent() > totalBudget();
      if (over) paajiSay('gift_over', {}, { mood: 'think' });
      else if (first) paajiSay('gift_plan', { name: first.name, sweet: first.box.items[0].sweet.name }, { mood: 'celebrate', priority: 'high' });
      return;
    }
    const sw = t.closest('[data-swap]');
    if (sw) {
      const [i, j] = sw.dataset.swap.split(':').map(Number);
      const p = plan.people[i];
      const cur = p.box.items[j];
      const inBox = new Set(p.box.items.map((x) => x.sweet.id));
      const alts = all.filter((s) => s.in_stock && s.product_type === cur.sweet.product_type && !inBox.has(s.id) && fitsPrefs(s, p.prefs) && variantFor(s, cur.variant.grams))
        .sort((a, b) => (b.category === cur.sweet.category) - (a.category === cur.sweet.category) || b.popularity - a.popularity);
      const next = alts[(Number(sw.dataset.n || 0)) % Math.max(1, alts.length)];
      if (!next) { toast('Is preference mein aur option nahi hai ji.', 'info'); return; }
      p.box.items[j] = { sweet: next, variant: variantFor(next, cur.variant.grams), qty: 1, reason: 'Aapne badla — preferences ke andar' };
      draw();
      save().catch(() => {});
      return;
    }
    const ns = t.closest('[data-new-shayari]');
    if (ns) { const p = plan.people[Number(ns.dataset.newShayari)]; p.box.shayari = pickShayari(p); draw(); return; }
    if (t.closest('[data-order]')) {
      const err = view.querySelector('.checkout__error');
      const btn = t.closest('[data-order]');
      btn.disabled = true; btn.textContent = 'Order ho raha hai…';
      try {
        await save();
        const pay = view.querySelector('[name=pay]:checked')?.value || 'cod';
        const coupon = view.querySelector('[name=coupon]')?.value.trim() || null;
        const { data, error } = await supabase.rpc('place_gift_plan_order', { p_plan_id: plan.id, p_payment_method: pay, p_coupon_code: coupon });
        if (error) throw error;
        local.remove('ss:plan-wish');
        location.hash = `#/order/${(Array.isArray(data) ? data[0] : data).id}?new=1`;
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false;
        btn.disabled = false; btn.textContent = 'Place gift order 🪔';
      }
    }
  });

  view.addEventListener('change', (e) => {
    const s = e.target.closest('[data-size-for]');
    if (s) {
      const i = Number(s.dataset.sizeFor);
      const p = plan.people[i];
      const used = new Set(plan.people.filter((x, k) => k !== i).flatMap((x) => x.box?.items.map((it) => it.sweet.id) || []));
      const grams = Number(s.value);
      p.box = { ...p.box, ...planBox(p, grams * 1.4, all, used, wish, grams) };
      draw();
      save().catch(() => {});
    }
    if (e.target.name === 'self') view.querySelector('[data-addr]').hidden = e.target.checked;
  });
  view.addEventListener('input', (e) => {
    const m = e.target.closest('[data-msg]');
    if (m) plan.people[Number(m.dataset.msg)].message = m.value;
  });
  view.addEventListener('submit', async (e) => {
    if (e.target.id !== 'person-form') return;
    e.preventDefault();
    const f = e.target.elements;
    const prefs = Object.fromEntries([...e.target.querySelectorAll('[name=pref]:checked')].map((x) => [x.value, true]));
    const person = {
      key: editing.key || `n${Date.now()}`, name: f.name.value.trim(), relation: f.relation.value.trim(), household: Math.max(1, Math.min(50, Number(f.household.value) || 2)),
      prefs, importance: f.importance.value, deliver_self: f.self.checked,
      address: f.self.checked ? {} : { line1: f.line1.value.trim(), city: f.city.value.trim(), phone: f.phone.value.trim(), name: f.name.value.trim() },
      deliver_on: f.date.value, message: editing.message || '', box: editing.box || null,
    };
    if (!person.name) return;
    if (editing.idx != null) plan.people[editing.idx] = person; else plan.people.push(person);
    if (f.remember.checked) {
      supabase.from('saved_relatives').upsert({ user_id: uid, name: person.name, relation: person.relation, household: person.household, prefs, importance: person.importance, address: person.deliver_self ? null : person.address }, { onConflict: 'user_id,name' })
        .then(({ error }) => error && toast(error.message, 'error'));
    }
    editing = null;
    draw();
  });

  draw();
  if (wish.size) toast(`Paaji yaad rakhenge: ${[...wish].map((id) => getById(id)?.name).filter(Boolean).join(', ')} — plan mein shamil karenge.`, 'info', 5000);
}
