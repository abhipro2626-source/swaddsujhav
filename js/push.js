// Optional Web Push for Garam Jalebi Alerts (best effort). If the browser has no
// push support or the customer says no, the in-app Realtime banner still works.
import { supabase } from './supabase.js';
import { store } from './state.js';

// Public VAPID key (safe to publish). The private key lives only in the
// Supabase Edge Function secrets (see README → Garam Jalebi Alert).
export const VAPID_PUBLIC_KEY = 'BKrFUnBaPZjdE2z1A8knqFlkOBlj_2NUJHbB_FEpz8nNacR_wBwU-gAq0Z52tZKspq6DEhH43Fmt6hX5RAqMIOo';

const urlB64ToUint8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Ask permission, subscribe and save the subscription (own row, RLS). */
export async function enablePush() {
  if (!pushSupported() || !supabase || !store.get('user')) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY) });
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: store.get('user').id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' });
  return !error;
}

/** Owner side: ask the Edge Function to push a new hot batch to opted-in customers. */
export async function sendHotPush(hotBatchId) {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('hot-alert-push', { body: { hot_batch_id: hotBatchId } });
  if (error) { console.debug('[push]', error.message); return null; }
  return data;
}
