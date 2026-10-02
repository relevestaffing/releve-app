import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { saveAttempt } from '@/lib/attempts';
import { safeMessage } from '@/lib/errors';

export async function POST(req: Request) {
  const { side, answers, pairs, timings, conditions } = await req.json();
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: 'Your session has expired. Sign in again and your answers so far are kept.' }, { status: 401 });
  try {
    await saveAttempt(side, profile?.id ?? null, { answers, pairs, timings, conditions: conditions ?? {} });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    /* A session that has expired mid-questionnaire fails right here — the
       screen needs a real 400 to react to, not a false "ok" it will believe. */
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
