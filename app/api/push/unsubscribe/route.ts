import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (!hasServiceKey()) return NextResponse.json({ ok: true });
  const b = await req.json().catch(() => ({} as any));
  const endpoint = (b?.endpoint ?? b?.subscription?.endpoint) as string | undefined;
  if (!endpoint) return NextResponse.json({ error: 'No endpoint.' }, { status: 400 });
  await adminClient().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', me.id);
  return NextResponse.json({ ok: true });
}
