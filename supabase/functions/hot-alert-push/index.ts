// Garam Jalebi Alert — Web Push sender (Supabase Edge Function).
// Called by the shop owner right after creating a hot batch. Checks the caller is
// an admin, then pushes to customers who opted in, respecting their chosen items,
// quiet hours and the daily alert limit. The VAPID private key is read through a
// service-role-only database function; nothing secret ever reaches the browser.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const VAPID_PUBLIC = 'BKrFUnBaPZjdE2z1A8knqFlkOBlj_2NUJHbB_FEpz8nNacR_wBwU-gAq0Z52tZKspq6DEhH43Fmt6hX5RAqMIOo';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const minutesNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
};
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const quiet = (start: string, end: string) => {
  const n = minutesNow(); const s = toMin(start); const e = toMin(end);
  return s <= e ? n >= s && n < e : n >= s || n < e;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: isAdmin } = await user.rpc('is_admin');
    if (!isAdmin) return json({ error: 'Owner only' }, 403);

    const { hot_batch_id } = await req.json();
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: batch } = await admin.from('hot_batches').select('id, sweet_id, ready_at, quantity_g, sweets(name)').eq('id', hot_batch_id).single();
    if (!batch) return json({ error: 'Hot batch not found' }, 404);
    const { data: key } = await admin.rpc('vapid_private_key');
    if (!key) return json({ error: 'VAPID key missing' }, 500);
    webpush.setVapidDetails('mailto:shop@swaadsujhav.app', VAPID_PUBLIC, key as string);

    const { data: settings } = await admin.from('app_settings').select('value').eq('key', 'alerts').single();
    const maxPerDay = Number(settings?.value?.max_per_day ?? 3);
    const { data: prefs } = await admin.from('alert_preferences').select('*').eq('enabled', true).eq('push', true);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const name = (batch as any).sweets?.name ?? 'mithai';
    const mins = Math.max(0, Math.ceil((new Date(batch.ready_at).getTime() - Date.now()) / 60000));
    const payload = JSON.stringify({
      title: `🔥 Garam ${name} ${mins ? `${mins} minute mein` : 'abhi nikli'}!`,
      body: `Kadhai se seedhi garam ${name} — ${(batch.quantity_g / 1000).toFixed(1)} kg. Mere liye rakh lo?`,
      hot_batch_id: batch.id, url: './#/',
    });

    let sent = 0; let skipped = 0;
    for (const p of prefs ?? []) {
      if (p.sweet_ids?.length && !p.sweet_ids.includes(batch.sweet_id)) { skipped++; continue; }
      if (quiet(p.quiet_start, p.quiet_end)) { skipped++; continue; }
      const { count } = await admin.from('hot_alert_log').select('id', { count: 'exact', head: true })
        .eq('user_id', p.user_id).eq('kind', 'pushed').gte('created_at', since);
      if ((count ?? 0) >= maxPerDay) { skipped++; continue; }
      const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', p.user_id);
      let ok = false;
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 1800 });
          ok = true;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);   // expired subscription
        }
      }
      if (ok) { sent++; await admin.from('hot_alert_log').insert({ hot_batch_id: batch.id, user_id: p.user_id, kind: 'pushed' }); }
      else skipped++;
    }
    await admin.from('hot_batches').update({ notified: sent }).eq('id', batch.id);
    return json({ sent, skipped });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
