import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { send, pulseNudge } from '@/lib/email';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* The monthly nudge to the executive.
   ----------------------------------
   The talent were asked every Friday how the week went. The executive was
   asked never — the monthly pulse existed as a page and nothing ever prompted
   it, so the only client news that reached Relève was a cancellation. That is
   the expensive way to learn something.

   Called by a scheduled task on the first working day of the month, guarded by
   the same shared secret as Friday's nudge. Runs with the service role because
   it must see every placement, which no signed-in person can.

   Placements inside their first fortnight are skipped: asking an executive how
   it is going on day three produces an answer about nothing, and teaches them
   the message is not worth opening. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  /* Supabase renamed this key. Older projects call it the service_role key;
     newer ones issue an sb_secret_... key. Accept either name so a rename in
     the dashboard does not silently break the first of the month. */
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

  /* Who is due, worked out in the database rather than here — the same
     definition the console reads, so the two can never drift apart. */
  const { data: due, error } = await sb.rpc('pulse_due');
  if (error) {
    console.error('[pulse-nudge] pulse_due failed:', error.message);
    return NextResponse.json({ error: 'could not read who is due' }, { status: 500 });
  }

  const rows = (due ?? []) as { placement_id: string; client_id: string; month_of: string }[];
  if (!rows.length) return NextResponse.json({ ok: true, sent: 0, skipped: 0, due: 0 });

  const { data: people } = await sb.from('profiles')
    .select('id, full_name, email')
    .in('id', rows.map(r => r.client_id));
  const by = new Map((people ?? []).map((p: any) => [p.id, p]));

  const month = new Date(rows[0].month_of + 'T00:00:00Z')
    .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  let sent = 0, skipped = 0;
  for (const r of rows) {
    const who = by.get(r.client_id) as any;
    if (!who?.email) { skipped++; continue; }

    /* Same guard as the Friday nudge: if this ever fires twice in the same
       month, email_log is what stops the executive hearing from us about
       the same pulse a second time. */
    const { data: already } = await sb.from('email_log')
      .select('id').eq('kind', 'pulseNudge').eq('to_addr', who.email)
      .gt('sent_at', new Date(Date.now() - 27 * 86_400_000).toISOString())
      .limit(1).maybeSingle();
    if (already) { skipped++; continue; }

    const first = String(who.full_name ?? '').split(' ')[0] || 'there';
    if (await send(who.email, pulseNudge(first, month, r.placement_id))) sent++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, month, due: rows.length, sent, skipped });
}
