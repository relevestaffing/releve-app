import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { markSeen } from '@/lib/tasks-extra';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* The talent's list, opened: every task somebody else gave them is stamped
   seen, once. Row level security limits the update to their own placements. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'talent') return NextResponse.json({ ok: true, seen: 0 });
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b.ids) ? b.ids.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : [];
  if (!ids.length) return NextResponse.json({ ok: true, seen: 0 });
  try {
    const seen = await markSeen(ids, me.id);
    return NextResponse.json({ ok: true, seen });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
