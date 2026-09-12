import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { saveTaskResponse } from '@/lib/watch';

/* Autosave for one task's answer. Ownership and the in_progress window are
   both enforced by RLS on the update itself (see schema.sql) — this route
   only checks that someone is signed in as talent at all. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'talent') return NextResponse.json({ error: 'talent only' }, { status: 403 });
  const { taskId, response } = await req.json();
  if (!taskId) return NextResponse.json({ error: 'missing task' }, { status: 400 });
  try {
    await saveTaskResponse(taskId, String(response ?? ''));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
