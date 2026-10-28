import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { importProspectsFromCalendar } from '@/lib/prospects';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* New discovery calls off hello@'s calendar become leads, on their own.
   -------------------------------------------------------------------
   Booking a call used to be the one part of the pipeline nobody had to
   touch the console for, and so the lead it should have created never got
   made. This runs every few hours and imports each upcoming call with an
   outside attendee as a booked lead, once, keyed on the calendar event id.
   Guarded by the cron secret. The calendar is read over its own
   service-account JWT, and the service-role client is passed in so the
   writes run with no signed-in person. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('[cron] missing', !url ? 'NEXT_PUBLIC_SUPABASE_URL' : 'the Supabase service key');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  /* Never throws on a calendar outage or a missing table: a clear reason
     comes back instead, so a bad morning is a logged no-op, not a 500. */
  try {
    const { added, skipped, reason } = await importProspectsFromCalendar(sb);
    return NextResponse.json({ ok: true, added, skipped, ...(reason ? { reason } : {}) });
  } catch (e: any) {
    console.error('[cron] import-calls failed', e);
    return NextResponse.json({ ok: false, added: 0, skipped: 0, reason: e?.message ?? 'The import could not run.' });
  }
}
