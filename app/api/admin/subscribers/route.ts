import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/* The email list, by hand (29 Oct 2026, Nona: "an option for me in my
   console to manually unsubscribe someone if they ask"). Admin only.
   Unsubscribing here does exactly what the person's own link does: the row
   stays, subscribed goes false, and every send skips them from then on. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
  if (!hasServiceKey()) return NextResponse.json({ error: 'The server cannot reach the list right now.' }, { status: 503 });

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which person?' }, { status: 400 });
  const now = new Date().toISOString();

  let patch: Record<string, unknown>;
  if (b.action === 'unsubscribe') patch = { subscribed: false, unsubscribed_at: now, updated_at: now };
  else if (b.action === 'resubscribe') patch = { subscribed: true, unsubscribed_at: null, updated_at: now };
  else return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  const { data, error } = await adminClient().from('subscribers').update(patch).eq('id', id).select('id, subscribed').maybeSingle();
  if (error) return NextResponse.json({ error: 'That did not save. Try again.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'That person is no longer on the list.' }, { status: 404 });
  return NextResponse.json({ ok: true, subscribed: data.subscribed });
}
