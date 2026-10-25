import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { send, templates } from '@/lib/email';
import { weekEnding } from '@/lib/work-public';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* The executive's week, in their inbox (Sage, 25 October 2026).
   ------------------------------------------------------------
   Every premium agency that has a product pushes a written report to the
   client: Magic's end-of-day, Prialto's daily review, Double's weekly
   digest. Relève had the material, in the end-of-week report the talent
   file for Relève and the highlights they choose to share, and never sent
   it. This does, once a week, per live placement: hours, what got done, the
   win, and any highlight shared that week. Concerns stay with Relève, as
   promised on the form. Called by a scheduled task after Friday's reports
   are in, guarded by the cron secret, and runs with the service role. */
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

  /* The week that just closed. Run on a Monday, this is the Friday before. */
  const week = weekEnding(new Date(Date.now() - 3 * 86400000));
  const weekStart = new Date(week + 'T00:00:00Z'); weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const from = weekStart.toISOString().slice(0, 10);

  const { data: placements } = await sb.from('placements')
    .select('id, client_id, talent_id, client:client_id(full_name, email), talent:talent_id(full_name)')
    .is('ended_on', null);

  let sent = 0, skipped = 0;
  for (const p of (placements ?? []) as any[]) {
    const to = p.client?.email as string | undefined;
    const execName = (p.client?.full_name as string | undefined) ?? '';
    const talentName = (p.talent?.full_name as string | undefined) ?? 'Your talent';
    if (!to) { skipped++; continue; }

    const [{ data: report }, { data: logs }] = await Promise.all([
      sb.from('checkins').select('hours, shipped, win').eq('placement_id', p.id).eq('week_ending', week).maybeSingle(),
      sb.from('talent_logs').select('log_date, highlight, hours').eq('placement_id', p.id)
        .gte('log_date', from).lte('log_date', week).eq('share_highlight', true).order('log_date')
    ]);
    const highlights = ((logs ?? []) as any[]).filter(l => l.highlight).map(l => ({ date: l.log_date, text: l.highlight as string }));
    const r = report as any;
    if (!r && !highlights.length) { skipped++; continue; }   // nothing to say is better than an empty letter

    const hours = r?.hours != null ? Number(r.hours)
      : ((logs ?? []) as any[]).reduce((s, l) => s + (Number(l.hours) || 0), 0) || null;

    const ok = await send(to, templates.weeklyDigest({
      name: execName, talent: talentName, week,
      hours, accomplished: r?.shipped ?? null, win: r?.win ?? null, highlights
    }));
    if (ok) sent++; else skipped++;
  }
  return NextResponse.json({ ok: true, week, sent, skipped });
}
