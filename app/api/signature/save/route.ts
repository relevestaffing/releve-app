import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { saveAttempt } from '@/lib/attempts';
import { safeMessage } from '@/lib/errors';
import { depositLocked } from '@/lib/stage';

export async function POST(req: Request) {
  const { side: asked, answers, pairs, timings, conditions } = await req.json().catch(() => ({} as any));
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: 'Your session has expired. Sign in again and your answers so far are kept.' }, { status: 401 });
  /* A talent takes the talent instrument and a client the executive one; the
     side is the account's, not the request's. */
  const side = profile.role === 'admin' ? asked : profile.role;
  if (side !== 'client' && side !== 'talent') return NextResponse.json({ error: 'unknown instrument' }, { status: 400 });
  if (await depositLocked(profile)) return NextResponse.json({ error: 'Your deposit comes first. Once it is in, this opens.' }, { status: 403 });
  try {
    await saveAttempt(side, profile?.id ?? null, { answers, pairs, timings, conditions: conditions ?? {} });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    /* A session that has expired mid-questionnaire fails right here — the
       screen needs a real 400 to react to, not a false "ok" it will believe. */
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
