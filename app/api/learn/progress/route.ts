import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { counts, mergeProgress, trainingByToken } from '@/lib/learn';

export const dynamic = 'force-dynamic';

/* Saves a person's place in a team training. Called by the course page as
   lessons are finished and checks passed; the token is the only credential,
   and it can only ever move that one row forward. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const row = await trainingByToken(String(b?.token ?? ''));
  if (!row) return NextResponse.json({ error: 'That link is no longer active.' }, { status: 404 });
  const progress = mergeProgress(row.course, row.progress, b);
  const { lessons_done, checks_passed } = counts(row.course, progress);
  const { error } = await adminClient().from('team_trainings')
    .update({ progress, lessons_done, checks_passed, last_seen_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Not saved. Please try again.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
