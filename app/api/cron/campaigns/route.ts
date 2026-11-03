import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { campaignsReady, draftUpcoming, sendDue } from '@/lib/campaigns';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* Hourly at :05. Sends whatever is due and not held first. If nothing went
   out this run, writes the next Tuesday or Thursday email due within two
   days and previews it to the team. One job per run keeps each request
   inside its time limit; the next hour picks up the rest. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });
  if (!campaignsReady()) return NextResponse.json({ error: 'The Supabase service key is not set.' }, { status: 500 });

  const out: Record<string, unknown> = {};
  try { out.sent = await sendDue(); }
  catch (e: any) { out.sendError = e?.message ?? String(e); }
  if (!(out.sent as unknown[] | undefined)?.length) {
    try { out.drafted = await draftUpcoming(); }
    catch (e: any) { out.draftError = e?.message ?? String(e); }
  }
  /* A slow draft retries next hour on its own. A draft failure inside the
     last day before a send is a real problem, so it answers 500 and Netlify's
     function log shows it (QA, 2 Nov 2026). */
  const late = Boolean(out.draftError) && (() => {
    const now = new Date();
    const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const d = pt.getDay(); const h = pt.getHours();
    return (d === 1 || d === 3) || ((d === 2 || d === 4) && h < 9);
  })();
  return NextResponse.json(out, { status: out.sendError || late ? 500 : 200 });
}
