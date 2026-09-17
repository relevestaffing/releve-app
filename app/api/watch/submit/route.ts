import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { submitWatchAttempt } from '@/lib/watch';
import { safeMessage } from '@/lib/errors';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'talent') return NextResponse.json({ error: 'talent only' }, { status: 403 });
  const { attemptId } = await req.json();
  if (!attemptId) return NextResponse.json({ error: 'missing attempt' }, { status: 400 });
  try {
    await submitWatchAttempt(attemptId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
