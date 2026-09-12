import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/* No database call, on purpose — the only job here is to be a cheap,
   always-200 request that keeps the shared Next.js server function warm
   (see netlify/functions/warm-ping.mts). Anything that touches Supabase
   would make the ping itself part of what can go slow or fail. */
export async function GET() {
  return NextResponse.json({ ok: true, t: Date.now() });
}
