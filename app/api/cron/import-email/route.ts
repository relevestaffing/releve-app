import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { importProspectsFromInbox } from '@/lib/prospects';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* Strangers who email hello@ become leads, on their own.
   Hourly, guarded by the cron secret, writes under the service role.
   The inbox is read over the calendar's service account with the Gmail
   readonly scope (lib/gmail.ts). Added 29 October 2026. */
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
    const { added, skipped, reason } = await importProspectsFromInbox(sb);
    return NextResponse.json({ ok: true, added, skipped, ...(reason ? { reason } : {}) });
  } catch (e: any) {
    console.error('[cron] import-email failed', e);
    return NextResponse.json({ ok: false, added: 0, skipped: 0, reason: e?.message ?? 'The import could not run.' });
  }
}
