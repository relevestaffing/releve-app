import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { saveAttempt } from '@/lib/attempts';

export async function POST(req: Request) {
  const { side, answers, pairs, timings } = await req.json();
  const profile = await currentProfile();
  await saveAttempt(side, profile?.id ?? null, { answers, pairs, timings });
  return NextResponse.json({ ok: true });
}
