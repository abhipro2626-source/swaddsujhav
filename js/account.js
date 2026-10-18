// Login / sign-up dialog. Opens the taste quiz after a fresh sign-up.
import { openModal, html, toast, $ } from './ui.js';
import { signIn, signUp } from './auth.js';
import { openQuiz } from './quiz.js';

const say = (text, mood = 'talk') =>
  document.dispatchEvent(new CustomEvent('ss:say', { detail: { text, mood } }));

export function openAuthModal(mode = 'login') {
  const modal = openModal({ title: mode === 'login' ? 'Log in' : 'Create account', size: 'sm', className: 'auth-modal' });

  const render = () => {
    const isLogin = mode === 'login';
    modal.body.innerHTML = html`
      <div class="auth">
        <div class="auth__head">
          <span class="auth__diya" aria-hidden="true">🪔</span>
          <h2>${isLogin ? 'Phir se swagat hai!' : 'Swaad Sujhaav parivaar mein aao'}</h2>
          <p class="muted">${isLogin ? 'Log in to see your sujhaav, orders and favourites.'
                                     : 'Sign up to save your taste, favourites and orders.'}</p>
        </div>
        <form class="auth__form" novalidate>
          ${isLogin ? '' : html`<label class="field">
            <span>Naam</span>
            <input name="name" autocomplete="name" required minlength="2" maxlength="60" placeholder="Aapka naam">
          </label>`}
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" required placeholder="you@example.com">
          </label>
          <label class="field">
            <span>Password</span>
            <input name="password" type="password" required minlength="6"
                   autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="••••••">
          </label>
          <p class="auth__error" role="alert" hidden></p>
          <button class="btn btn--gold btn--block" type="submit">${isLogin ? 'Log in' : 'Sign up'}</button>
        </form>
        <p class="auth__switch">
          ${isLogin ? 'Naye ho?' : 'Pehle se account hai?'}
          <button type="button" class="link-btn" data-switch>${isLogin ? 'Create an account' : 'Log in'}</button>
        </p>
      </div>`;
    $('input', modal.body)?.focus();
  };

  modal.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-switch]')) { mode = mode === 'login' ? 'signup' : 'login'; render(); }
  });

  modal.body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = $('.auth__error', form);
    const btn = $('button[type=submit]', form);
    const data = Object.fromEntries(new FormData(form));
    err.hidden = true;
    if (!form.checkValidity()) {
      err.textContent = mode === 'signup' && (data.name || '').trim().length < 2
        ? 'Please enter your name.'
        : !/^\S+@\S+\.\S+$/.test(data.email || '') ? 'Please enter a valid email.'
        : 'Password should be at least 6 characters.';
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Ek second…';
    try {
      if (mode === 'login') {
        await signIn(data);
        modal.close('done');
        toast('Logged in. Jee aayan nu!', 'success');
      } else {
        const { needsConfirmation } = await signUp(data);
        modal.close('done');
        if (needsConfirmation) {
          toast('Check your email to confirm your account, then log in.', 'success', 6000);
          say('Email check karo ji, confirm karke wapas aao. Main intezaar karunga!');
        } else {
          document.dispatchEvent(new CustomEvent('ss:celebrate', { detail: { kind: 'signup' } }));
          say(`Wah ji wah, ${data.name.split(' ')[0]} ji! Parivaar vich swagat hai!`, 'dance');
          setTimeout(() => openQuiz({ fromSignup: true }), 900);
        }
      }
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = mode === 'login' ? 'Log in' : 'Sign up';
    }
  });

  render();
  return modal;
}
