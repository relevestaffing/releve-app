import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { send, templates } from '@/lib/email';
import { weekEnding } from '@/lib/work-public';

export const dynamic = 'force-dynamic';

/* A plain !== on a secret leaks its length and contents one comparison at a
   time to anyone who can measure response timing closely enough — the same
   reason the Stripe webhook and the signed pay links use a constant-time
   compare instead of a plain string comparison. */
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* Friday's nudge. There is no scheduler inside the app, so this is called by
   a scheduled task. Guarded by a shared secret — without it, anyone could
   make Relève email its whole bench.

   Runs with the service role because it must see every placement, which no
   signed-in person can. That key never leaves the server. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  /* Supabase renamed this key. Older projects call it the service_role key;
     newer ones issue an sb_secret_... key. Accept either name so a rename in
     the dashboard does not silently break Friday. */
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.SUPABASE_SECRET_KEY
           ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    /* The detail goes to the server log only. A response body is no place to
       list what the server can and cannot see. */
    console.error('[cron] missing', !url ? 'NEXT_PUBLIC_SUPABASE_URL' : 'the Supabase service key');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const week = weekEnding();

  const { data: placements } = await sb.from('placements')
    .select('id, talent_id, talent:talent_id(full_name, email)')
    .is('ended_on', null);

  const { data: filed } = await sb.from('checkins')
    .select('placement_id').eq('week_ending', week);
  const done = new Set((filed ?? []).map((r: any) => r.placement_id));

  let sent = 0, skipped = 0;
  for (const p of (placements ?? []) as any[]) {
    if (done.has(p.id)) { skipped++; continue; }
    const email = p.talent?.email;
    if (!email) { skipped++; continue; }

    /* If the scheduler ever fires twice for the same week — a retry, a
       duplicate trigger, someone re-running it by hand — this is what stops
       a second identical nudge reaching someone who simply has not filed
       yet. email_log is the only record of what has actually gone out, so
       it is what this checks against rather than trying to track it apart. */
    const { data: already } = await sb.from('email_log')
      .select('id').eq('kind', 'checkinNudge').eq('to_addr', email)
      .gt('sent_at', new Date(Date.now() - 6 * 86_400_000).toISOString())
      .limit(1).maybeSingle();
    if (already) { skipped++; continue; }

    const first = String(p.talent?.full_name ?? '').split(' ')[0] || 'there';
    const tpl = templates.checkinNudge(first);
    if (await send(email, tpl)) sent++;
  }

  return NextResponse.json({ ok: true, week, sent, skipped });
}
