// Cart state. Guests: localStorage. Logged in: public.cart_items (synced).
// The guest cart is merged into the account on login.
import { supabase } from './supabase.js';
import { store, local } from './state.js';
import { getById, variantById, loadCatalog } from './catalog.js';
import { toast } from './ui.js';

const KEY = 'ss:cart';
let lastRemoved = null;

// ---------------------------------------------------------------- helpers
const items = () => store.get('cart');
const commit = (next) => {
  store.set({ cart: next });
  if (!store.get('user')) local.set(KEY, next);
};
const maxFor = (variant) => (variant?.stock_qty == null ? 99 : Math.min(99, variant.stock_qty));

export function lines() {
  return items()
    .map((it) => {
      const sweet = getById(it.sweet_id);
      const variant = variantById(sweet, it.variant_id);
      return sweet && variant ? { ...it, sweet, variant, total: Number(variant.price) * it.quantity } : null;
    })
    .filter(Boolean);
}
// ---------------------------------------------------------------- gift boxes
// A box is { id?, size: 4|9|16, ribbon, message, items: [sweetId × size] }.
// Mirrors public.piece_price / gift_box_fee so the preview matches the server.
const BOX_KEY = 'ss:boxes';
export const BOX_FEE = { 4: 49, 9: 79, 16: 119 };
export function piecePrice(sweet) {
  if (!sweet) return 0;
  const pc = sweet.variants.find((v) => v.weight_label === '1 pc');
  if (pc) return Number(pc.price);
  const g250 = sweet.variants.find((v) => v.weight_label === '250g');
  if (g250) return Math.ceil(Number(g250.price) / 12);
  return Math.ceil(Math.min(...sweet.variants.map((v) => Number(v.price))) / 6);
}
export const boxPrice = (box) => BOX_FEE[box.size] + box.items.reduce((n, id) => n + piecePrice(getById(id)), 0);
export const boxes = () => store.get('boxes') || [];
const commitBoxes = (next) => {
  store.set({ boxes: next });
  if (!store.get('user')) local.set(BOX_KEY, next);
};

export async function addBox(box) {
  const clean = { size: box.size, ribbon: box.ribbon || 'gold', message: (box.message || '').slice(0, 200), items: box.items.map(Number) };
  if (clean.items.length !== clean.size) throw new Error('Fill every slot first');
  const user = store.get('user');
  if (user && supabase) {
    const { data, error } = await supabase.from('cart_gift_boxes').insert({ ...clean, user_id: user.id }).select('id').single();
    if (error) throw error;
    clean.id = data.id;
  } else {
    clean.id = `local-${Date.now()}`;
  }
  commitBoxes([...boxes(), clean]);
  document.dispatchEvent(new CustomEvent('ss:box-added', { detail: clean }));
  return clean;
}

export async function removeBox(id) {
  commitBoxes(boxes().filter((b) => b.id !== id));
  if (store.get('user') && supabase && typeof id === 'number') {
    await supabase.from('cart_gift_boxes').delete().eq('id', id);
  }
}

export const count = () => items().reduce((n, it) => n + it.quantity, 0) + boxes().length;
export const subtotal = () => lines().reduce((n, l) => n + l.total, 0) + boxes().reduce((n, b) => n + boxPrice(b), 0);
export const sweetIdsInCart = () => [...new Set([...items().map((it) => it.sweet_id), ...boxes().flatMap((b) => b.items)])];
export const qtyOf = (variantId) => items().find((it) => it.variant_id === variantId)?.quantity || 0;
export const qtyOfSweet = (sweetId) => items().filter((it) => it.sweet_id === sweetId).reduce((n, it) => n + it.quantity, 0);

// ---------------------------------------------------------------- sync
async function fetchRemote() {
  const { data, error } = await supabase.from('cart_items').select('sweet_id, variant_id, quantity').order('created_at');
  if (error) throw error;
  return data || [];
}

async function writeRemote(variantId, sweetId, quantity) {
  const user = store.get('user');
  if (!user || !supabase) return;
  const q = quantity > 0
    ? supabase.from('cart_items').upsert(
        { user_id: user.id, sweet_id: sweetId, variant_id: variantId, quantity },
        { onConflict: 'user_id,variant_id' })
    : supabase.from('cart_items').delete().eq('user_id', user.id).eq('variant_id', variantId);
  const { error } = await q;
  if (error) {
    console.warn('[cart] sync failed', error);
    toast('Cart could not sync. We will retry on refresh.', 'error');
  }
}

/** Load the right cart for the current user; merge the guest cart after login. */
export async function syncCart() {
  await loadCatalog().catch(() => null);
  const user = store.get('user');
  const guestBoxes = (local.get(BOX_KEY, []) || []).filter((b) => Array.isArray(b?.items) && b.items.length === b.size);
  if (!user || !supabase) {
    store.set({ cart: sanitize(local.get(KEY, [])), boxes: guestBoxes });
    return;
  }
  const guest = sanitize(local.get(KEY, []));
  try {
    if (guest.length) {
      const { error } = await supabase.rpc('merge_guest_cart', {
        p_items: guest.map(({ variant_id, quantity }) => ({ variant_id, quantity })),
      });
      if (error) throw error;
      local.remove(KEY);
    }
    if (guestBoxes.length) {
      const { error } = await supabase.rpc('merge_guest_gift_boxes', { p_boxes: guestBoxes.map(({ size, ribbon, message, items: it }) => ({ size, ribbon, message, items: it })) });
      if (error) throw error;
      local.remove(BOX_KEY);
    }
    if (guest.length || guestBoxes.length) toast('Your cart items are saved to your account.', 'success');
    const [remote, remoteBoxes] = await Promise.all([
      fetchRemote(),
      supabase.from('cart_gift_boxes').select('id, size, ribbon, message, items').order('created_at'),
    ]);
    store.set({ cart: sanitize(remote), boxes: remoteBoxes.data || [] });
  } catch (err) {
    console.warn('[cart] load failed', err);
    store.set({ cart: guest, boxes: guestBoxes });
  }
}

function sanitize(list) {
  return (Array.isArray(list) ? list : [])
    .map((it) => ({ sweet_id: Number(it.sweet_id), variant_id: Number(it.variant_id), quantity: Math.max(1, Math.min(99, Number(it.quantity) || 1)) }))
    .filter((it) => it.sweet_id && it.variant_id);
}

// ---------------------------------------------------------------- actions
/**
 * Add a sweet. Emits `ss:added` so Paaji, sparkles and the fly-to-cart
 * animation can react. `from` is the element the user clicked.
 */
export function add(sweet, variant, quantity = 1, { from = null, silent = false } = {}) {
  if (!sweet || !variant) return false;
  if (!sweet.in_stock || (variant.stock_qty != null && variant.stock_qty <= 0)) {
    toast(`${sweet.name} (${variant.weight_label}) is out of stock right now.`, 'error');
    return false;
  }
  const cur = items();
  const existing = cur.find((it) => it.variant_id === variant.id);
  const want = (existing?.quantity || 0) + quantity;
  const max = maxFor(variant);
  if (want > max) {
    toast(`Sirf ${max} hi bache hain ji (${variant.weight_label}).`, 'info');
    if ((existing?.quantity || 0) >= max) return false;
  }
  const qty = Math.min(want, max);
  const next = existing
    ? cur.map((it) => (it.variant_id === variant.id ? { ...it, quantity: qty } : it))
    : [...cur, { sweet_id: sweet.id, variant_id: variant.id, quantity: qty }];
  commit(next);
  writeRemote(variant.id, sweet.id, qty);
  logEvent('add_to_cart', sweet.id);
  if (!silent) document.dispatchEvent(new CustomEvent('ss:added', { detail: { sweet, variant, from, firstTime: !existing } }));
  return true;
}

export function setQty(variantId, quantity) {
  const it = items().find((x) => x.variant_id === variantId);
  if (!it) return;
  if (quantity <= 0) { remove(variantId); return; }
  const variant = variantById(getById(it.sweet_id), variantId);
  const qty = Math.min(quantity, maxFor(variant));
  if (qty < quantity) toast(`Sirf ${qty} hi bache hain ji.`, 'info');
  commit(items().map((x) => (x.variant_id === variantId ? { ...x, quantity: qty } : x)));
  writeRemote(variantId, it.sweet_id, qty);
}

/** Swap the weight of a cart line (e.g. 250g → 500g). */
export function changeVariant(oldVariantId, newVariantId) {
  const it = items().find((x) => x.variant_id === oldVariantId);
  if (!it || oldVariantId === newVariantId) return;
  const sweet = getById(it.sweet_id);
  const variant = variantById(sweet, newVariantId);
  remove(oldVariantId, { quiet: true });
  add(sweet, variant, it.quantity, { silent: true });
}

export function remove(variantId, { quiet = false } = {}) {
  const it = items().find((x) => x.variant_id === variantId);
  if (!it) return;
  lastRemoved = it;
  commit(items().filter((x) => x.variant_id !== variantId));
  writeRemote(variantId, it.sweet_id, 0);
  if (!quiet) {
    logEvent('remove', it.sweet_id);
    document.dispatchEvent(new CustomEvent('ss:removed', { detail: it }));
  }
}

export function undoRemove() {
  if (!lastRemoved) return;
  const { sweet_id, variant_id, quantity } = lastRemoved;
  lastRemoved = null;
  const sweet = getById(sweet_id);
  add(sweet, variantById(sweet, variant_id), quantity, { silent: true });
}

/** Called after a successful order (the server already emptied cart_items). */
export function clearLocal() {
  store.set({ cart: [], boxes: [] });
  local.remove(KEY);
  local.remove(BOX_KEY);
}

/** Best-effort analytics for recommendations; never blocks the UI. */
export function logEvent(action, sweetId, query = null) {
  const user = store.get('user');
  if (!user || !supabase) return;
  supabase.from('events').insert({ user_id: user.id, sweet_id: sweetId, action, query }).then(({ error }) => {
    if (error) console.debug('[events]', error.message);
  });
}
