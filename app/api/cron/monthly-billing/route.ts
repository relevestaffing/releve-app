import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* The first Monday. There is no scheduler inside the app, so a scheduled task
   calls this — the same shape as the Friday check-in nudge, and guarded by the
   same shared secret.

   Revenue collection used to begin when somebody remembered to open Billing
   and press a button. Miss the first Monday and nobody was invoiced, nobody
   was paid, and nothing anywhere said so. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.SUPABASE_SECRET_KEY
           ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    const seen = Object.keys(process.env)
      .filter(k => k.startsWith('SUPABASE') || k.startsWith('NEXT_PUBLIC_SUPABASE')).sort();
    return NextResponse.json({
      error: 'Supabase secret key not configured',
      lookedFor: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY'],
      supabaseVarsTheServerCanSee: seen
    }, { status: 500 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const month = new Date().toISOString().slice(0, 10);

  /* Both halves, in one call, so a month can never be half-run: invoices
     raised and nobody paid, or the reverse. */
  const { data, error } = await sb.rpc('run_the_month', { for_month: month });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true, month,
    invoices: (data as any)?.invoices ?? 0,
    payments: (data as any)?.payments ?? 0,
    note: 'Invoices are drafts until somebody sends them, and payments are due until somebody records them. Nothing here moves money on its own.'
  });
}
