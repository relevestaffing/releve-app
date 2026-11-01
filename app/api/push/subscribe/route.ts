import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/* The browser hands us a PushSubscription; we store it against the signed-in
   person so the server can notify them later. Upsert by endpoint so turning
   notifications on twice on the same device does not pile up rows. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (!hasServiceKey()) return NextResponse.json({ error: 'Notifications are not available right now.' }, { status: 503 });

  const b = await req.json().catch(() => ({} as any));
  const sub = b?.subscription ?? b;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'That subscription was incomplete.' }, { status: 400 });

  const { error } = await adminClient().from('push_subscriptions').upsert({
    user_id: me.id, endpoint, p256dh, auth,
    user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
    last_used_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ error: 'Could not turn on notifications. Try again.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
