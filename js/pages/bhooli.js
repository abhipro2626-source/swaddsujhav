// Bhooli Hui Mithai — describe a sweet you can't name; Paaji identifies it.
// Words → traits (describe-dictionary.js) → Postgres scoring (identify_sweet,
// pg_trgm + full-text) → if the top two are close, Paaji asks up to 3 yes/no
// questions (next_question) → big reveal. Searches are logged for the owner.
import { html, raw, rupees, sweetImage, emptyState, toast, $ } from '../ui.js';
import { supabase } from '../supabase.js';
import { store, local } from '../state.js';
import { loadCatalog, getById, firstAvailableVariant } from '../catalog.js';
import { sweetName } from '../i18n.js';
import { describeToTraits, CHIP_GROUPS } from '../describe-dictionary.js';
import { paajiSay } from '../lines.js';

const EXAMPLES = [
  'Gol si thi, chashni mein doobi, andar se naram, Lucknow mein shaadi mein khaayi thi',
  'Peeli lambi si, bengali, upar khoya laga tha — woh chum wali',
  'Orange goal goal ghumavdar, garam garam kurkuri',
  'Safed chakor tukde, Agra ki, chewy si',
];

export async function renderBhooli(view) {
  await loadCatalog();
  const st = { text: '', chips: {}, asked: [], answers: {}, results: [], logId: null, exclude: [], step: 'ask' };

  const draw = () => {
    view.innerHTML = html`
    <div class="page container page--narrow bhooli">
      <header><h1 class="page-title">🕵️ Bhooli Hui Mithai</h1>
        <p class="muted">Naam yaad nahi? Jaise yaad hai waise bata do — shape, rang, kahan khaayi thi. Paaji pehchaan lenge.</p></header>
      ${st.step === 'ask' ? askForm() : st.step === 'question' ? questionCard() : resultView()}
    </div>`;
  };

  const askForm = () => html`
    <form class="bhooli__ask stack" id="bhooli-form">
      <label class="field"><span>Describe it in your own words (Hindi, Hinglish or English)</span>
        <textarea name="desc" maxlength="500" placeholder="e.g. Gol si thi, chashni mein doobi, andar se naram…">${st.text}</textarea></label>
      <div class="row-actions">
        <button type="button" class="btn btn--sm" data-mic aria-label="Speak your description">🎙️ Bol ke batao</button>
        <span class="muted small">Try: ${EXAMPLES.map((e, i) => html`<button type="button" class="link-btn" data-example="${i}">"${e.slice(0, 32)}…"</button> `)}</span>
      </div>
      <details class="bhooli__chips"><summary>Thoda aur yaad hai? (optional)</summary>
        ${CHIP_GROUPS.map((g) => html`<div class="bhooli__group"><span>${g.label}</span><div class="chips">
          ${g.options.map(([v, l]) => {
            const on = Array.isArray(st.chips[g.key]) ? st.chips[g.key].includes(v) : st.chips[g.key] === v;
            return html`<button type="button" class="chip chip--toggle ${on ? 'is-on' : ''}" data-chip="${g.key}" data-val="${String(v)}" aria-pressed="${on ? 'true' : 'false'}">${l}</button>`;
          })}</div></div>`)}
        <label class="field"><span>Kahan / kab khaayi thi? (city, festival, wedding…)</span><input name="where" maxlength="80" placeholder="Lucknow, shaadi"></label>
      </details>
      <button type="submit" class="btn btn--gold btn--lg">🔍 Paaji, pehchaano!</button>
    </form>`;

  const questionCard = () => {
    const q = st.pending;
    return html`<section class="bhooli-q" aria-live="polite">
      <p class="muted">Sawaal ${st.asked.length} / 3</p>
      <h2>🧔🏽 ${q.question}</h2>
      <div class="row-actions" style="justify-content:center">
        <button type="button" class="btn btn--gold btn--lg" data-answer="yes">Haan</button>
        <button type="button" class="btn btn--lg" data-answer="no">Nahi</button>
        <button type="button" class="link-btn" data-answer="skip">Pata nahi</button>
      </div></section>`;
  };

  const resultView = () => {
    const [top, ...rest] = st.results;
    const s = top && getById(top.sweet_id);
    if (!s || top.confidence < 20) {
      const near = st.results.slice(0, 3).map((r) => getById(r.sweet_id)).filter(Boolean);
      return html`<section class="stack">
        ${raw(emptyState({ icon: '🤔', title: 'Thodi mushkil hai ji', text: 'Ye teen sabse kareeb hain. Nahi mili? Dukaan ko bhej do — hum dhoond ke batayenge.' }))}
        <div class="bhooli-others">${near.map((x) => mini(x))}</div>
        ${requestForm()}
        <button type="button" class="btn" data-restart>Phir se try karo</button></section>`;
    }
    const v = firstAvailableVariant(s);
    return html`<section class="bhooli-reveal" aria-live="polite">
        <div>${sweetImage(s, { size: 'hero' })}</div>
        <div class="stack">
          <p class="bhooli-reveal__kicker">Mil gayi ji! Yeh thi…</p>
          <h2 class="bhooli-reveal__name">${sweetName(s)}!</h2>
          <p class="muted">${s.name_hi || ''} · ${s.region}</p>
          <div><p class="small muted">Paaji ko ${top.confidence}% yakeen hai</p>
            <div class="confidence" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${top.confidence}" aria-label="Confidence ${top.confidence} percent"><span style="--w:${top.confidence}%"></span></div></div>
          <p><strong>Kyun?</strong> <span class="chips clue-chips">${(top.clues || []).map((c) => html`<span class="chip chip--sm">${c}</span>`)}</span></p>
          <p class="small">${s.origin_story || s.description}</p>
          <div class="row-actions">
            ${v && s.in_stock ? html`<button type="button" class="btn btn--gold" data-add="${s.id}" data-variant="${v.id}" data-bhooli-ok="${s.id}">Add to cart · ${rupees(v.price)}</button>` : ''}
            <a class="btn" href="#/sweet/${s.slug}" data-open="${s.slug}" data-bhooli-ok="${s.id}">Poori kahani</a>
            <button type="button" class="btn" data-plan="${s.id}">👨‍👩‍👧 Gift plan mein daalo</button>
            <button type="button" class="link-btn" data-not>Ye wali nahi</button>
          </div>
        </div>
      </section>
      ${rest.length ? html`<section><h3>Ya phir ye toh nahi?</h3><div class="bhooli-others">${rest.map((r) => mini(getById(r.sweet_id), r.confidence))}</div></section>` : ''}
      ${requestForm()}
      <button type="button" class="btn" data-restart>Doosri mithai dhoondo</button>`;
  };

  const mini = (s, conf) => (s ? html`<button type="button" class="mini-match" data-pick="${s.id}">${sweetImage(s, { size: 'thumb' })}
    <strong>${sweetName(s)}</strong>${conf != null ? html`<span class="muted small">${conf}%</span>` : ''}</button>` : '');

  const requestForm = () => html`<details class="panel"><summary>Nahi mili? Dukaan ko bhejo — "Hum dhoond ke batayenge"</summary>
    <form class="stack" id="req-form"><label class="field"><span>Phone or email (optional, so we can tell you)</span><input name="contact" maxlength="80"></label>
      <button type="submit" class="btn btn--sm">Send to the shop</button></form></details>`;

  async function search() {
    const where = $('#bhooli-form', view)?.elements.where?.value || '';
    const full = `${st.text} ${where}`.trim();
    const { traits } = describeToTraits(full, st.chips);
    Object.assign(traits, st.answers);
    st.traits = traits;
    const { data, error } = await supabase.rpc('identify_sweet', { p_description: full, p_traits: traits, p_exclude: st.exclude });
    if (error) { toast(error.message, 'error'); return; }
    st.results = data || [];
    if (!st.logId) {
      supabase.rpc('log_identify', { p_description: full, p_chips: st.chips, p_top: st.results.map((r) => r.sweet_id) })
        .then(({ data: id }) => { st.logId = id; }, () => {});
    }
    // Close call between the top two? Ask the question that best splits them (max 3).
    const [a, b] = st.results;
    if (a && b && st.asked.length < 3 && a.confidence - b.confidence < 25) {
      const { data: q } = await supabase.rpc('next_question', { p_ids: st.results.map((r) => r.sweet_id), p_asked: st.asked });
      if (q) {
        st.pending = q;
        st.asked.push(q.key);
        st.step = 'question';
        draw();
        paajiSay('bhooli_ask', { q: q.question }, { mood: 'think', group: 'bhooli' });
        return;
      }
    }
    st.step = 'result';
    draw();
    const top = st.results[0] && getById(st.results[0].sweet_id);
    if (top && st.results[0].confidence >= 20) {
      paajiSay('bhooli_found', { sweet: top.name }, { mood: 'celebrate', priority: 'high' });
      document.dispatchEvent(new CustomEvent('ss:celebrate'));
    } else paajiSay('bhooli_none', {}, { mood: 'think' });
  }

  view.addEventListener('submit', async (e) => {
    if (e.target.id === 'bhooli-form') {
      e.preventDefault();
      st.text = e.target.elements.desc.value.trim();
      if (st.text.length < 4 && !Object.keys(st.chips).length) { toast('Thoda sa toh batao ji — shape, rang, ya kahan khaayi thi.', 'info'); return; }
      st.asked = []; st.answers = {}; st.exclude = []; st.logId = null;
      e.target.querySelector('[type=submit]').textContent = 'Paaji soch rahe hain…';
      await search();
    }
    if (e.target.id === 'req-form') {
      e.preventDefault();
      const { error } = await supabase.from('sweet_requests').insert({ user_id: store.get('user')?.id || null, description: `${st.text}`.slice(0, 500), contact: e.target.elements.contact.value.slice(0, 80) || null });
      if (error) toast(error.message, 'error'); else { toast('Bhej diya ji! Hum dhoond ke batayenge. 🙏', 'success'); e.target.closest('details').open = false; }
      if (st.logId) supabase.rpc('set_identify_result', { p_log_id: st.logId, p_chosen: null, p_success: false }).then(() => {}, () => {});
    }
  });

  view.addEventListener('click', async (e) => {
    const ex = e.target.closest('[data-example]');
    if (ex) { st.text = EXAMPLES[Number(ex.dataset.example)]; draw(); return; }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const g = CHIP_GROUPS.find((x) => x.key === chip.dataset.chip);
      const raw2 = chip.dataset.val;
      const val = raw2 === 'true' ? true : raw2 === 'false' ? false : raw2;
      st.text = $('#bhooli-form', view)?.elements.desc.value || st.text;
      if (['shape', 'colours', 'texture', 'flavours'].includes(g.key)) {
        const cur = st.chips[g.key] || [];
        st.chips[g.key] = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
      } else st.chips[g.key] = st.chips[g.key] === val ? undefined : val;
      draw();
      $('.bhooli__chips', view).open = true;
      return;
    }
    const ans = e.target.closest('[data-answer]');
    if (ans) {
      const q = st.pending;
      if (ans.dataset.answer === 'yes') Object.assign(st.answers, q.yes);
      if (ans.dataset.answer === 'no') Object.assign(st.answers, q.no);
      await search();
      return;
    }
    if (e.target.closest('[data-not]')) {
      st.exclude.push(st.results[0].sweet_id);
      if (st.logId) supabase.rpc('set_identify_result', { p_log_id: st.logId, p_chosen: null, p_success: false }).then(() => {}, () => {});
      await search();
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const id = Number(pick.dataset.pick);
      const r = st.results.find((x) => x.sweet_id === id) || { sweet_id: id, confidence: 50, clues: [] };
      st.results = [r, ...st.results.filter((x) => x.sweet_id !== id)];
      st.step = 'result';
      draw();
      return;
    }
    const ok = e.target.closest('[data-bhooli-ok]');
    if (ok && st.logId) supabase.rpc('set_identify_result', { p_log_id: st.logId, p_chosen: Number(ok.dataset.bhooliOk), p_success: true }).then(() => {}, () => {});
    const plan = e.target.closest('[data-plan]');
    if (plan) {
      const wish = new Set(local.get('ss:plan-wish', []));
      wish.add(Number(plan.dataset.plan));
      local.set('ss:plan-wish', [...wish].slice(-12));
      toast('Gift planner mein yaad rakhi ji!', 'success');
      if (st.logId) supabase.rpc('set_identify_result', { p_log_id: st.logId, p_chosen: Number(plan.dataset.plan), p_success: true }).then(() => {}, () => {});
      location.hash = '#/gift-planner';
      return;
    }
    if (e.target.closest('[data-restart]')) { Object.assign(st, { text: '', chips: {}, asked: [], answers: {}, results: [], logId: null, exclude: [], step: 'ask' }); draw(); return; }
    if (e.target.closest('[data-mic]')) listen();
  });

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Is browser mein mic nahi chalta — type kar do ji.', 'info'); return; }
    const rec = new SR();
    rec.lang = 'hi-IN';
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const ta = $('#bhooli-form', view)?.elements.desc;
      if (ta) ta.value = `${ta.value} ${ev.results[0][0].transcript}`.trim();
    };
    rec.onerror = () => toast('Sun nahi paaya ji, phir se bolo.', 'info');
    rec.start();
    toast('Bolo ji, Paaji sun rahe hain… 🎙️', 'info', 2500);
  }

  draw();
  document.dispatchEvent(new CustomEvent('ss:say', { detail: { text: 'Batao ji, kaunsi mithai yaad aa rahi hai? Jaisa yaad hai waisa bolo — Paaji pehchaan lenge!', mood: 'wave', group: 'bhooli' } }));
}
