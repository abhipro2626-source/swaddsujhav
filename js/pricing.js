// One price for everything: asks Postgres (price_cart) — deals, Jodi combos,
// Mix & Save and coupons are all decided there. The browser only shows it.
import { supabase } from './supabase.js';
import { store, local } from './state.js';

const COUPON_KEY = 'ss:coupon';
let seq = 0;

export const getCoupon = () => local.get(COUPON_KEY) || '';
export function setCoupon(code) {
  const c = String(code || '').trim().toUpperCase().slice(0, 20);
  if (c) local.set(COUPON_KEY, c); else local.remove(COUPON_KEY);
  document.dispatchEvent(new CustomEvent('ss:coupon', { detail: { code: c } }));
}

/**
 * Price the current cart. Signed-in: the server reads cart_items itself.
 * Guests: we send the lines (the server still prices them).
 * Returns the price_cart JSON, or null if the server is unreachable.
 */
export async function priceCart({ coupon = getCoupon(), orderType = 'regular' } = {}) {
  if (!supabase) return null;
  const my = ++seq;
  const user = store.get('user');
  const items = user ? null : (store.get('cart') || []).map((l) => ({ variant_id: l.variant_id, quantity: l.quantity }));
  const { data, error } = await supabase.rpc('price_cart', {
    p_coupon_code: user && coupon ? coupon : null, p_items: items, p_order_type: orderType,
  });
  if (error) { console.debug('[price]', error.message); return null; }
  if (my === seq) priceCart.last = data;
  return data;
}
priceCart.last = null;

/** My coupons (scratch-card prizes and owner gifts). */
export async function myCoupons() {
  if (!supabase || !store.get('user')) return [];
  const { data } = await supabase.rpc('my_coupons');
  return data || [];
}

export const couponUsable = (c) => !c.used_at && new Date(c.expires_at) > new Date();
