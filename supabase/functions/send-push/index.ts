// AtelierPro — envoi des notifications push (appelé par la base à chaque nouvelle notification).
// La configuration (clés VAPID + secret partagé) est lue dans public.push_config avec la clé service.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let cfg: { secret: string; vapid_public: string; vapid_private: string } | null = null;

async function config() {
  if (cfg) return cfg;
  const { data, error } = await sb.from('push_config').select('secret, vapid_public, vapid_private').eq('id', 1).single();
  if (error || !data) throw new Error('push_config absente');
  webpush.setVapidDetails('mailto:kassoumdolo2@gmail.com', data.vapid_public, data.vapid_private);
  cfg = data;
  return cfg;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405 });
  let c;
  try { c = await config(); } catch (e) { return new Response(String(e), { status: 500 }); }
  if (req.headers.get('x-push-secret') !== c.secret) return new Response('Accès refusé', { status: 403 });

  const { user_id, title, link } = await req.json();
  if (!user_id || !title) return new Response('Requête incomplète', { status: 400 });

  const { data: subs } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', user_id);
  const payload = JSON.stringify({ title: 'AtelierPro', body: title, url: link || '/' });
  let sent = 0, removed = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await sb.from('push_subscriptions').delete().eq('id', s.id); removed++; }
    }
  }));
  return Response.json({ sent, removed });
});
