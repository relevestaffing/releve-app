import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { tellTeam } from '@/lib/billing';
import { billingTemplates } from '@/lib/email-billing';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* Where a scheduled function reports that its job did not finish. The
   Netlify scheduler cannot send email itself, so every scheduled function
   posts here on a failure and the team hears about it the same morning,
   rather than finding out at the end of the month that nothing ran.
   Guarded by the same shared secret as the jobs themselves. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const job = String(b.job ?? 'a scheduled job').slice(0, 120);
  const detail = String(b.detail ?? 'No detail was returned.').slice(0, 1500);
  await tellTeam(() => billingTemplates.cronFailed({ job, detail }));
  return NextResponse.json({ ok: true });
}
