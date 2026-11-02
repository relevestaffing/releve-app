import { NextResponse } from 'next/server';
import { corsHeaders, preflight } from '@/lib/cors';
import { calendlyConfigured, availableTimes } from '@/lib/calendly';

export const dynamic = 'force-dynamic';

/* The open discovery-call times, for Relève's own picker on the website.
   Public (the site has no session), read only, and cached for a minute so a
   page full of visitors does not become a page full of Calendly calls.
   { configured: false } tells the site to fall back to the Calendly embed. */

let cache: { at: number; days: number; slots: string[] } | null = null;

export async function OPTIONS(req: Request) { return preflight(req); }

export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'));
  if (!calendlyConfigured()) return NextResponse.json({ configured: false }, { headers: cors });
  const days = Math.min(28, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 14));
  try {
    if (!cache || cache.days !== days || Date.now() - cache.at > 60_000) {
      const from = new Date(), to = new Date(Date.now() + days * 86_400_000);
      cache = { at: Date.now(), days, slots: await availableTimes(from, to) };
    }
    return NextResponse.json({ configured: true, slots: cache.slots }, {
      headers: { ...cors, 'cache-control': 'no-store' }
    });
  } catch (e: any) {
    console.error('[booking/times]', e?.message ?? e);
    /* A Calendly outage or a bad token: the site falls back to the embed. */
    return NextResponse.json({ configured: false, error: 'unavailable' }, { headers: cors });
  }
}
