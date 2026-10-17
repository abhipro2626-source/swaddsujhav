// Sign up, log in, log out and the signed-in user's profile.
import { supabase } from './supabase.js';
import { store } from './state.js';

const FRIENDLY = [
  [/invalid login credentials/i, 'Email or password galat hai ji. Please try again.'],
  [/email not confirmed/i, 'Please confirm your email first — check your inbox.'],
  [/user already registered/i, 'This email already has an account. Try logging in.'],
  [/password should be at least/i, 'Password should be at least 6 characters.'],
  [/rate limit|too many/i, 'Too many tries. Please wait a minute and try again.'],
  [/network|fetch/i, 'Network problem. Check your connection and try again.'],
];

export function friendlyError(err) {
  const msg = err?.message || String(err || '');
  for (const [re, text] of FRIENDLY) if (re.test(msg)) return text;
  return msg || 'Something went wrong. Please try again.';
}

export async function loadProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, taste_profile, addresses, is_admin, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) { console.warn('[auth] profile load failed', error); return null; }
  return data;
}

async function applySession(session) {
  const user = session?.user ?? null;
  store.set({ session, user });
  store.set({ profile: user ? await loadProfile(user.id) : null });
}

/** Start listening to auth changes. Resolves once the initial session is known. */
export async function initAuth() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  await applySession(data.session);
  supabase.auth.onAuthStateChange((event, session) => {
    // Defer DB work out of the auth callback (recommended by supabase-js).
    setTimeout(() => applySession(session).then(() => {
      document.dispatchEvent(new CustomEvent('ss:auth', { detail: { event } }));
    }), 0);
  });
}

export async function signUp({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { name: name.trim() } },
  });
  if (error) throw new Error(friendlyError(error));
  // When email confirmation is on, there is a user but no session yet.
  return { needsConfirmation: !data.session, user: data.user };
}

export async function signIn({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyError(error));
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** Update the editable profile fields (name, phone, taste_profile, addresses). */
export async function updateProfile(patch) {
  const user = store.get('user');
  if (!user) throw new Error('Please log in first.');
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select('id, name, phone, taste_profile, addresses, is_admin, created_at')
    .single();
  if (error) throw new Error(friendlyError(error));
  store.set({ profile: data });
  return data;
}

export const isLoggedIn = () => !!store.get('user');
export const isAdmin = () => !!store.get('profile')?.is_admin;
export const firstName = () =>
  (store.get('profile')?.name || store.get('user')?.email || '').split(/[\s@]/)[0];
