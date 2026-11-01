/* Web push (VAPID). Server-only.
   -----------------------------
   One person can have several subscriptions (phone added to Home Screen,
   laptop, etc.); we send to all of them and quietly drop any the push
   service reports as gone (404/410). Everything here is best-effort: a push
   must never be the reason an email, a save or a request fails, so callers
   fire-and-forget and every path swallows its own errors. */
import webpush from 'web-push';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';

/* Public VAPID key (not a secret). Baked in so the only thing the server must
   be given is the private key; env still wins if set, for rotation. */
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BL1YZ9kmHrX33B3kJAsojGt1J4XS8B89RMTMhIhBbPm589-8RAO-AqZl4zAbLS9WYGZxI5dbayWMd3vuoIr9CYo';

let ready = false;
function configure(): boolean {
  if (ready) return true;
  const pub = VAPID_PUBLIC;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@relevestaffing.com';
  try { webpush.setVapidDetails(subject, pub, priv); ready = true; return true; }
  catch { return false; }
}

/** True when the server can actually send a push. */
export function pushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && process.env.VAPID_PRIVATE_KEY && hasServiceKey());
}

export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configure() || !hasServiceKey() || !userId) return;
  const sb = adminClient();
  const { data: subs } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId);
  if (!subs || !subs.length) return;
  const data = JSON.stringify({
    title: payload.title, body: payload.body ?? '', url: payload.url ?? '/app', tag: payload.tag
  });
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
      await sb.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('endpoint', s.endpoint);
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) { try { await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint); } catch { /* */ } }
    }
  }));
}

export async function sendPushToEmail(email: string, payload: PushPayload): Promise<void> {
  if (!configure() || !hasServiceKey() || !email) return;
  try {
    const sb = adminClient();
    const { data: prof } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
    if (prof?.id) await sendPushToUser(prof.id as string, payload);
  } catch { /* best-effort */ }
}
