import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { hasServiceKey } from '@/lib/supabase/admin';
import { sendDueFollowUps } from '@/lib/lead-booking';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* The 24-hour booking follow-up (Nona, 2 November 2026). Every website lead
   gets the booking link the moment they come in; anyone still without a call
   24 hours later gets one follow-up, once. Called hourly by
   netlify/functions/cron-lead-booking-follow-up.mts, guarded by the cron
   secret. The logic lives in lib/lead-booking.ts. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });
  if (!hasServiceKey()) return NextResponse.json({ error: 'not configured' }, { status: 500 });
  try {
    const sent = await sendDueFollowUps();
    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    console.error('[cron] lead booking follow-up failed:', e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
