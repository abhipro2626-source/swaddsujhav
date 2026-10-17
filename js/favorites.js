// Favourite (heart) sweets for the signed-in user.
import { supabase } from './supabase.js';
import { store } from './state.js';
import { toast } from './ui.js';
import { logEvent } from './cart.js';

let favs = new Set();

export async function loadFavorites() {
  favs = new Set();
  if (store.get('user') && supabase) {
    const { data } = await supabase.from('favorites').select('sweet_id');
    favs = new Set((data || []).map((r) => r.sweet_id));
  }
  document.dispatchEvent(new CustomEvent('ss:favs'));
  return favs;
}

export const isFav = (id) => favs.has(Number(id));
export const favIds = () => [...favs];

export async function toggleFav(sweetId) {
  const user = store.get('user');
  if (!user) {
    toast('Log in to save favourites ❤️', 'info');
    location.hash = '#/profile';
    return false;
  }
  const id = Number(sweetId);
  const on = !favs.has(id);
  on ? favs.add(id) : favs.delete(id);
  document.dispatchEvent(new CustomEvent('ss:favs'));
  const { error } = on
    ? await supabase.from('favorites').insert({ user_id: user.id, sweet_id: id })
    : await supabase.from('favorites').delete().eq('user_id', user.id).eq('sweet_id', id);
  if (error && !/duplicate/i.test(error.message)) {
    on ? favs.delete(id) : favs.add(id);
    document.dispatchEvent(new CustomEvent('ss:favs'));
    toast('Could not update favourites. Please try again.', 'error');
    return !on;
  }
  if (on) logEvent('favorite', id);
  return on;
}
