import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { submitWatchAttempt } from '@/lib/watch';
import { safeMessage } from '@/lib/errors';
import { teamEmails } from '@/lib/work';
import { send, templates } from '@/lib/email';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'talent') return NextResponse.json({ error: 'talent only' }, { status: 403 });
  const { attemptId } = await req.json();
  if (!attemptId) return NextResponse.json({ error: 'missing attempt' }, { status: 400 });
  try {
    await submitWatchAttempt(attemptId);
    /* The team promised a review within two working days; tell them it is waiting. */
    try {
      const sb = await supabaseServer();
      const { data: a } = await sb.from('taking_the_watch_attempts').select('discipline').eq('id', String(attemptId)).maybeSingle();
      const team = await teamEmails();
      for (const to of team) await send(to, templates.watchSubmitted({ talent: me.full_name || me.email || 'A candidate', discipline: String((a as any)?.discipline ?? 'a discipline') })).catch(() => false);
    } catch { /* the submission stands; the queue shows it regardless */ }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
