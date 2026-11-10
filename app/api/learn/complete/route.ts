import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { counts, finished, mergeProgress, trainingByToken } from '@/lib/learn';
import { COURSES } from '@/lib/learn-courses';
import { send } from '@/lib/email';
import { learnFinished } from '@/lib/learn-email';

export const dynamic = 'force-dynamic';

const CONSOLE_INBOX = 'hello@relevestaffing.com';

/* The sign-off. Only once every lesson is read and every check passed; the
   person types their full name, and the team is told the same minute. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const row = await trainingByToken(String(b?.token ?? ''));
  if (!row) return NextResponse.json({ error: 'That link is no longer active.' }, { status: 404 });
  if (row.completed_at) return NextResponse.json({ ok: true, completedAt: row.completed_at });

  const name = String(b?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (name.split(' ').length < 2) return NextResponse.json({ error: 'Please type your first and last name.' }, { status: 400 });

  const progress = mergeProgress(row.course, row.progress, b);
  if (!finished(row.course, progress))
    return NextResponse.json({ error: 'A few lessons or checks are still open. Finish those, then sign off.' }, { status: 400 });

  const completedAt = new Date().toISOString();
  const { error } = await adminClient().from('team_trainings')
    .update({ progress, ...counts(row.course, progress), completed_at: completedAt, signed_name: name, last_seen_at: completedAt })
    .eq('id', row.id).is('completed_at', null);
  if (error) return NextResponse.json({ error: 'That did not go through. Please try again.' }, { status: 500 });

  await send(CONSOLE_INBOX, learnFinished({ name: row.name, signedAs: name, email: row.email, course: COURSES[row.course].title }));
  return NextResponse.json({ ok: true, completedAt });
}
