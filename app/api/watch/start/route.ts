import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { startWatchAttempt } from '@/lib/watch';
import { safeMessage } from '@/lib/errors';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'talent') return NextResponse.json({ error: 'talent only' }, { status: 403 });
  const { discipline } = await req.json();
  if (!discipline) return NextResponse.json({ error: 'which discipline?' }, { status: 400 });
  try {
    const attemptId = await startWatchAttempt(me.id, discipline);
    return NextResponse.json({ ok: true, attemptId });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
