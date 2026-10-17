// Supabase client. Every module imports `supabase` from here.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('YOUR-');

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Public URL for a file in the sweet-images storage bucket. */
export function storageUrl(path) {
  if (!supabase || !path) return null;
  return supabase.storage.from('sweet-images').getPublicUrl(path).data.publicUrl;
}

/**
 * Health check: can we reach the database and read the public catalog?
 * Resolves to { ok, count, error }.
 */
export async function checkConnection() {
  if (!supabase) return { ok: false, count: 0, error: 'Supabase key missing in js/config.js' };
  try {
    const { count, error } = await supabase
      .from('sweets')
      .select('id', { count: 'exact', head: true });
    if (error) return { ok: false, count: 0, error: error.message };
    return { ok: true, count: count ?? 0, error: null };
  } catch (err) {
    return { ok: false, count: 0, error: err?.message || 'Network error' };
  }
}
