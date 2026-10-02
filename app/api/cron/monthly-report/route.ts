import { NextResponse } from 'next/server';
import { send } from '@/lib/email';
import { experienceEmails } from '@/lib/email-experience';
import { cronAllowed, cronClient } from '@/lib/cron-auth';
import { monthReport } from '@/lib/experience';
import { monthStart, prevMonth, todayIn } from '@/lib/experience-public';
import { fmtMonth } from '@/lib/words';

export const dynamic = 'force-dynamic';

/* The month in one letter, on the 1st.
   ------------------------------------
   For every live placement that was running last month, the executive gets
   last month's report: tasks completed, hours, the highlights their talent
   chose to share, and next month's focus, with a link to the full page. Each
   send is claimed in report_sends first, so a re-run never sends twice.
   Dates are the business's (Pacific). An optional { "month": "YYYY-MM" } body
   re-sends a specific month for placements not yet sent it. */
export async function POST(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'no' }, { status: 401 });
  const sb = cronClient();
  if (!sb) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const b = await req.json().catch(() => ({}));
  const month = typeof b.month === 'string' && /^\d{4}-\d{2}$/.test(b.month)
    ? b.month + '-01'
    : prevMonth(monthStart(todayIn('America/Los_Angeles')));
  const monthEnd = (() => { const d = new Date(month + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();

  const { data: pls, error } = await sb.from('placements')
    .select('id, client_id, started_on, ended_on, client:client_id(full_name, email), talent:talent_id(full_name)')
    .lt('started_on', monthEnd)
    .or(`ended_on.is.null,ended_on.gte.${month}`);
  if (error) { console.error('[cron monthly-report]', error.message); return NextResponse.json({ error: 'read failed' }, { status: 500 }); }

  let sent = 0, skipped = 0;
  for (const p of (pls ?? []) as any[]) {
    if (p.ended_on) { skipped++; continue; }     // ended placements get no report letter
    const to = p.client?.email as string | undefined;
    if (!to) { skipped++; continue; }

    const { error: claim } = await sb.from('report_sends').insert({ placement_id: p.id, month_of: month });
    if (claim) { skipped++; continue; }

    const talent = String(p.talent?.full_name ?? '').trim() || 'your talent';
    const r = await monthReport(p.id, month, { sb, talentName: talent });
    const first = String(p.client?.full_name ?? '').trim().split(/\s+/)[0] || 'Hello';
    const ok = await send(to, experienceEmails.monthlyReport({
      name: first, talent, month: fmtMonth(month), monthParam: month.slice(0, 7),
      completed: r.completed.length, hours: r.hours,
      highlights: r.highlights.slice(0, 5).map(h => h.text),
      focus: r.focus.slice(0, 3).map(f => f.title)
    }));
    if (ok) sent++;
    else {
      /* Let a later run try again rather than marking it sent. */
      await sb.from('report_sends').delete().eq('placement_id', p.id).eq('month_of', month);
      skipped++;
    }
  }
  return NextResponse.json({ ok: true, month, sent, skipped });
}
