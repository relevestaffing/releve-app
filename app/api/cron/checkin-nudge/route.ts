import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { send, templates } from '@/lib/email';
import { weekEnding } from '@/lib/work-public';

export const dynamic = 'force-dynamic';

/* Friday's nudge. There is no scheduler inside the app, so this is called by
   a scheduled task. Guarded by a shared secret — without it, anyone could
   make Relève email its whole bench.

   Runs with the service role because it must see every placement, which no
   signed-in person can. That key never leaves the server. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || given !== secret)
    return NextResponse.json({ error: 'no' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  /* Supabase renamed this key. Older projects call it the service_role key;
     newer ones issue an sb_secret_... key. Accept either name so a rename in
     the dashboard does not silently break Friday. */
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.SUPABASE_SECRET_KEY
           ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    /* Names only, never values, so a 500 tells us what the server can
       actually see instead of leaving us guessing at a spelling. */
    const seen = Object.keys(process.env)
      .filter(k => k.startsWith('SUPABASE') || k.startsWith('NEXT_PUBLIC_SUPABASE'))
      .sort();
    return NextResponse.json({
      error: 'Supabase secret key not configured',
      missing: !url ? 'NEXT_PUBLIC_SUPABASE_URL' : 'the secret key',
      lookedFor: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY'],
      supabaseVarsTheServerCanSee: seen
    }, { status: 500 });
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
    const first = String(p.talent?.full_name ?? '').split(' ')[0] || 'there';
    const tpl = templates.checkinNudge(first);
    if (await send(email, tpl.subject, { text: tpl.text, html: tpl.html })) sent++;
  }

  return NextResponse.json({ ok: true, week, sent, skipped });
}
