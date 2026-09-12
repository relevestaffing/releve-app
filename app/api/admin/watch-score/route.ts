import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { scoreWatchAttempt, getAttemptForReview } from '@/lib/watch';
import { personEmail } from '@/lib/work';
import { send, templates } from '@/lib/email';
import { DISCIPLINE } from '@/lib/disciplines';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });

  const { attemptId, accuracy, judgment, communication, time_management, overall_result, reviewer_notes, talent_feedback } = await req.json();
  if (!attemptId) return NextResponse.json({ error: 'missing attempt' }, { status: 400 });
  if (!['cleared', 'needs_retake'].includes(overall_result))
    return NextResponse.json({ error: 'pick a result' }, { status: 400 });
  if (!talent_feedback || !String(talent_feedback).trim())
    return NextResponse.json({ error: 'feedback for the talent is required' }, { status: 400 });
  for (const [k, v] of Object.entries({ accuracy, judgment, communication, time_management })) {
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 100)
      return NextResponse.json({ error: `${k.replace('_', ' ')} must be a number 0–100` }, { status: 400 });
  }

  try {
    await scoreWatchAttempt(attemptId, me.id, {
      accuracy, judgment, communication, time_management,
      overall_result, reviewer_notes: reviewer_notes ? String(reviewer_notes).trim() || null : null,
      talent_feedback: String(talent_feedback).trim()
    });
    /* The feedback is required on this form and used to reach nobody — the
       talent found out by reopening their Watch page, if they thought to. */
    try {
      const a = await getAttemptForReview(attemptId);
      const who = a ? await personEmail(a.talentId) : null;
      if (who?.email) await send(who.email, templates.watchScored({
        name: who.name, discipline: DISCIPLINE[a!.discipline]?.name ?? a!.discipline,
        cleared: overall_result === 'cleared', feedback: String(talent_feedback).trim() }));
    } catch { /* the score stands */ }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
