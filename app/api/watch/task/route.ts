import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { saveTaskResponse } from '@/lib/watch';
import { safeMessage } from '@/lib/errors';

/* Autosave for one task's answer. Ownership and the in_progress window are
   both enforced by RLS on the update itself (see schema.sql) — this route
   only checks that someone is signed in as talent at all. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'talent') return NextResponse.json({ error: 'talent only' }, { status: 403 });
  const { taskId, response } = await req.json().catch(() => ({}));
  if (typeof taskId !== 'string' || !taskId) return NextResponse.json({ error: 'missing task' }, { status: 400 });
  if (response != null && typeof response !== 'string')
    return NextResponse.json({ error: 'That answer could not be read.' }, { status: 400 });
  if ((response ?? '').length > 20000)
    return NextResponse.json({ error: 'That answer is over 20,000 characters. Please shorten it.' }, { status: 413 });
  try {
    await saveTaskResponse(taskId, String(response ?? ''));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
