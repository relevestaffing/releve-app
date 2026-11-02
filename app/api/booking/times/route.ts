import { NextResponse } from 'next/server';
import { preflight } from '@/lib/cors';
import { guard } from '@/lib/booking-http';
import { bookingReady, openSlots } from '@/lib/booking';

export const dynamic = 'force-dynamic';

/* Open discovery-call times and the page wording, for relevestaffing.com/book
   and the site's Book a Call. Read only. Cached for half a minute so a busy
   page does not become a stream of calendar reads. { configured: false }
   (booking off, or the calendar unreachable) sends the site to its fallback. */
let cache: { at: number; body: any } | null = null;

export async function OPTIONS(req: Request) { return preflight(req); }

export async function GET(req: Request) {
  const { cors } = guard(req);
  if (!bookingReady()) return NextResponse.json({ configured: false }, { headers: cors });
  try {
    if (!cache || Date.now() - cache.at > 30_000) {
      const { settings, slots } = await openSlots();
      cache = { at: Date.now(), body: {
        configured: settings.enabled, slots, durationMin: settings.durationMin, page: settings.page
      } };
    }
    return NextResponse.json(cache.body, { headers: { ...cors, 'cache-control': 'no-store' } });
  } catch (e: any) {
    console.error('[booking/times]', e?.message ?? e);
    return NextResponse.json({ configured: false, error: 'unavailable' }, { headers: cors });
  }
}

