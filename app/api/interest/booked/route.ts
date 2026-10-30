import { NextResponse } from 'next/server';
import { hasServiceKey, adminClient } from '@/lib/supabase/admin';
import { corsHeaders, preflight } from '@/lib/cors';
import { importProspectsFromCalendar } from '@/lib/prospects';

export const dynamic = 'force-dynamic';

/* A Calendly booking on relevestaffing.com, filed the moment it is made.
   -------------------------------------------------------------------
   Calendly's embed tells the page a call was booked but not who booked it,
   and the booking itself lands on hello@'s calendar within seconds. So the
   page pings this, and this runs the same calendar import the hourly job
   runs, straight away, against a fresh read of the calendar. Nothing comes
   off the wire: the body is ignored, so a stranger calling it can only make
   the import run early, and the throttle below keeps that to once every
   fifteen seconds per server. The import is keyed on the calendar event id,
   so running it twice never files anyone twice. Added 29 October 2026. */

let lastRun = 0;

export async function OPTIONS(req: Request) { return preflight(req); }

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'));
  if (!hasServiceKey()) return NextResponse.json({ ok: false }, { status: 503, headers: cors });
  const now = Date.now();
  if (now - lastRun < 15_000) return NextResponse.json({ ok: true, throttled: true }, { headers: cors });
  lastRun = now;
  try {
    const { added, reason } = await importProspectsFromCalendar(adminClient(), true);
    return NextResponse.json({ ok: true, added, ...(reason ? { reason } : {}) }, { headers: cors });
  } catch (e: any) {
    console.error('[interest/booked] import failed', e);
    return NextResponse.json({ ok: false }, { status: 500, headers: cors });
  }
}
