// Mithai Taste Quiz — 5 quick questions that build the taste profile
// (solves the cold-start problem for recommendations).
import { openModal, html, raw, toast, $, $$ } from './ui.js';
import { updateProfile, firstName } from './auth.js';
import { store, local } from './state.js';

const say = (text, mood = 'talk') =>
  document.dispatchEvent(new CustomEvent('ss:say', { detail: { text, mood } }));

const QUESTIONS = [
  {
    id: 'sweetness', type: 'scale', title: 'Kitna meetha pasand hai?',
    sub: 'How sweet do you like it?',
    options: [
      { v: 1, e: '🙂', l: 'Halka sa' }, { v: 2, e: '😊', l: 'Thoda' }, { v: 3, e: '😋', l: 'Balanced' },
      { v: 4, e: '🤤', l: 'Meetha' }, { v: 5, e: '🍯', l: 'Ekdum chashni!' },
    ],
    react: (v) => (v >= 4 ? 'Wah ji, asli meethe ke shaukeen ho!' : v <= 2 ? 'Halka meetha, samajhdaar choice ji!' : 'Balance mein hi maza hai ji!'),
  },
  {
    id: 'categories', type: 'multi', max: 3, title: 'Kaunsi mithai dil ke kareeb hai?',
    sub: 'Pick up to 3 favourite types',
    options: [
      { v: 'bengali', e: '⚪', l: 'Bengali (rasgulla, sandesh)' },
      { v: 'laddoo', e: '🟠', l: 'Laddoo' },
      { v: 'barfi', e: '🔷', l: 'Barfi' },
      { v: 'halwa', e: '🥣', l: 'Halwa' },
      { v: 'syrup-soaked', e: '🍯', l: 'Chashni wali (jamun)' },
      { v: 'fried', e: '🌀', l: 'Jalebi & fried' },
      { v: 'milk-based', e: '🥛', l: 'Rabri, kheer, kulfi' },
      { v: 'dry-fruit', e: '🥜', l: 'Dry fruit' },
      { v: 'world', e: '🌍', l: 'World desserts' },
    ],
    react: (v) => (v.includes('world') ? 'Duniya ghoomne ka shauk! Baklava se mochi tak sab hai ji.' : 'Badhiya pasand hai ji, note kar liya!'),
  },
  {
    id: 'prefers', type: 'single', title: 'Doodh wali ya dry fruit wali?',
    sub: 'Milky or nutty?',
    options: [
      { v: 'milky', e: '🥛', l: 'Doodh wali, naram naram' },
      { v: 'dry_fruit', e: '🌰', l: 'Dry fruit, crunchy' },
      { v: 'both', e: '🤝', l: 'Dono chalenge!' },
    ],
    react: (v) => (v === 'both' ? 'Dil bada hai tuhada ji!' : 'Theek hai ji, yaad rakhunga.'),
  },
  {
    id: 'diet', type: 'multi', title: 'Koi khaas parhez?',
    sub: 'Any diet needs? (skip if none)',
    options: [
      { v: 'sugar_free', e: '🩺', l: 'Sugar-free only' },
      { v: 'vegan', e: '🌱', l: 'Vegan' },
      { v: 'jain', e: '🙏', l: 'Jain' },
      { v: 'gluten_free', e: '🌾', l: 'Gluten-free' },
      { v: 'eggless', e: '🥚', l: 'Eggless' },
    ],
    react: (v) => (v.includes('sugar_free') ? 'Fikar na karo ji, sugar-free mithai bhi ekdum swaad hai!' : v.length ? 'Samajh gaya ji, sirf wahi dikhaunga.' : 'Sab kuch chalega? Wah!'),
  },
  {
    id: 'regions', type: 'multi', max: 3, title: 'Kahan ki mithai pasand hai?',
    sub: 'Favourite regions (up to 3)',
    options: [
      { v: 'Bengal', e: '🐟', l: 'Bengal & Odisha' },
      { v: 'Punjab', e: '🌾', l: 'Punjab' },
      { v: 'North India', e: '🕌', l: 'UP & North India' },
      { v: 'Rajasthan', e: '🏜️', l: 'Rajasthan' },
      { v: 'Gujarat', e: '🪁', l: 'Gujarat' },
      { v: 'Maharashtra', e: '🐘', l: 'Maharashtra' },
      { v: 'South India', e: '🌴', l: 'South India' },
      { v: 'Hyderabad', e: '🏰', l: 'Hyderabad & Awadh' },
      { v: 'World', e: '🌍', l: 'Around the world' },
    ],
    react: () => 'Shukriya ji! Hun main tuhade layi khaas sujhaav bana raha haan.',
  },
];

// Region answers also cover their neighbours, so scoring matches the catalog.
const REGION_EXPAND = {
  Bengal: ['Bengal', 'Odisha', 'Assam', 'Bihar'],
  Punjab: ['Punjab'],
  'North India': ['North India', 'Uttar Pradesh', 'Uttarakhand', 'Bihar'],
  Rajasthan: ['Rajasthan', 'Madhya Pradesh'],
  Gujarat: ['Gujarat'],
  Maharashtra: ['Maharashtra', 'Goa'],
  'South India': ['South India', 'Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh'],
  Hyderabad: ['Hyderabad', 'Awadh'],
  World: ['Turkey', 'Middle East', 'Japan', 'Italy', 'France', 'Spain', 'Portugal', 'USA'],
};
const CATEGORY_BASES = {
  bengali: ['chhena'], 'milk-based': ['milk', 'khoya'], 'dry-fruit': ['dry-fruit'],
  laddoo: ['besan', 'flour'], barfi: ['khoya', 'besan'], halwa: ['semolina', 'carrot', 'lentil'],
  'syrup-soaked': ['khoya'], fried: ['flour'], world: ['flour', 'cheese'],
};

export function buildTasteProfile(a) {
  const diet = Object.fromEntries((a.diet || []).map((d) => [d, true]));
  const regions = [...new Set((a.regions || []).flatMap((r) => REGION_EXPAND[r] || [r]))];
  const bases = [...new Set((a.categories || []).flatMap((c) => CATEGORY_BASES[c] || []))];
  const cats = [...(a.categories || [])];
  if (a.regions?.includes('World') && !cats.includes('world')) cats.push('world');
  return {
    sweetness: a.sweetness ?? 3, categories: cats, bases, regions,
    prefers: a.prefers || 'both', diet, quiz_done: true, quiz_answers: a,
  };
}

/** Open the quiz. Resolves with the saved taste profile, or null if skipped. */
export function openQuiz({ fromSignup = false } = {}) {
  return new Promise((resolve) => {
    const answers = { ...(store.get('profile')?.taste_profile?.quiz_answers || {}) };
    let step = 0;
    let done = false;

    const modal = openModal({
      title: 'Mithai Taste Quiz', size: 'md', className: 'quiz-modal',
      onClose: () => { if (!done) resolve(null); },
    });

    say(fromSignup
      ? `Swagat hai ${firstName() || 'ji'}! Paanch chhote sawaal, phir main tuhanu best mithai dikhaunga.`
      : 'Chalo ji, tuhadi pasand phir se samajhde haan!', 'wave');

    const render = () => {
      const q = QUESTIONS[step];
      const val = answers[q.id];
      const selected = (v) => (q.type === 'multi' ? (val || []).includes(v) : val === v);
      modal.body.innerHTML = html`
        <div class="quiz" data-step="${step}">
          <div class="quiz__progress" role="progressbar" aria-valuemin="1" aria-valuemax="${QUESTIONS.length}"
               aria-valuenow="${step + 1}" aria-label="Question ${step + 1} of ${QUESTIONS.length}">
            ${raw(QUESTIONS.map((_, i) => `<span class="${i <= step ? 'is-on' : ''}"></span>`).join(''))}
          </div>
          <p class="quiz__count muted">Sawaal ${step + 1} / ${QUESTIONS.length}</p>
          <h2 class="quiz__title">${q.title}</h2>
          <p class="quiz__sub muted">${q.sub}</p>
          <div class="quiz__options quiz__options--${q.type}" role="${q.type === 'multi' ? 'group' : 'radiogroup'}"
               aria-label="${q.sub}">
            ${raw(q.options.map((o) => html`
              <button type="button" class="quiz-opt ${selected(o.v) ? 'is-selected' : ''}"
                      data-v="${String(o.v)}" role="${q.type === 'multi' ? 'checkbox' : 'radio'}"
                      aria-checked="${selected(o.v) ? 'true' : 'false'}">
                <span class="quiz-opt__e" aria-hidden="true">${o.e}</span>
                <span class="quiz-opt__l">${o.l}</span>
              </button>`).join(''))}
          </div>
          <div class="quiz__nav">
            <button type="button" class="btn" data-back ${step === 0 ? 'disabled' : ''}>Peeche</button>
            <button type="button" class="btn btn--gold" data-next>
              ${step === QUESTIONS.length - 1 ? 'Ho gaya! 🎉' : 'Aage'}
            </button>
          </div>
          ${fromSignup && step === 0 ? raw('<button type="button" class="link-btn quiz__skip" data-skip>Skip for now</button>') : ''}
        </div>`;
      modal.body.querySelector('.quiz-opt')?.focus({ preventScroll: true });
    };

    modal.body.addEventListener('click', async (e) => {
      const q = QUESTIONS[step];
      const opt = e.target.closest('.quiz-opt');
      if (opt) {
        const raw_ = opt.dataset.v;
        const v = q.type === 'scale' ? Number(raw_) : raw_;
        if (q.type === 'multi') {
          const cur = new Set(answers[q.id] || []);
          if (cur.has(v)) cur.delete(v);
          else if (!q.max || cur.size < q.max) cur.add(v);
          else { toast(`Bas ${q.max} choose karo ji`, 'info', 1800); return; }
          answers[q.id] = [...cur];
        } else {
          answers[q.id] = v;
        }
        render();
        return;
      }
      if (e.target.closest('[data-back]') && step > 0) { step -= 1; render(); return; }
      if (e.target.closest('[data-skip]')) { local.set('ss:quiz-skipped', true); modal.close('skip'); return; }
      if (e.target.closest('[data-next]')) {
        if (q.type !== 'multi' && answers[q.id] == null) { toast('Ek option chuno ji 🙂', 'info', 1800); return; }
        say(q.react(answers[q.id] ?? []));
        if (step < QUESTIONS.length - 1) { step += 1; render(); return; }
        const btn = e.target.closest('[data-next]');
        btn.disabled = true;
        try {
          const profile = buildTasteProfile(answers);
          await updateProfile({ taste_profile: profile });
          done = true;
          document.dispatchEvent(new CustomEvent('ss:quiz-done', { detail: profile }));
          modal.close('done');
          toast('Taste profile saved! Paaji ke sujhaav ab tuhade layi hain.', 'success');
          resolve(profile);
        } catch (err) {
          btn.disabled = false;
          toast(err.message, 'error');
        }
      }
    });

    // Keyboard: arrows move between options in a group.
    modal.body.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
      const opts = $$('.quiz-opt', modal.body);
      const i = opts.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = opts[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length];
      next.focus();
    });

    render();
  });
}

export const needsQuiz = () => {
  const p = store.get('profile');
  return !!p && !p.is_admin && !p.taste_profile?.quiz_done && !local.get('ss:quiz-skipped');
};

export { $ };
