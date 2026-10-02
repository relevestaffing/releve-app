import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { listPlacementsFor } from '@/lib/work';
import Shell from '@/components/Shell';
import Empty from '@/components/Empty';
import ReportPicker from '@/components/ReportPicker';
import { monthReport, reportMonths, viewerTimezone, todayIn, monthStart } from '@/lib/experience';
import { GOING } from '@/lib/care-public';
import { firstName, fmtDate, fmtDay, fmtMonth } from '@/lib/words';

export const dynamic = 'force-dynamic';

/* Your month: what the retainer bought.
   ------------------------------------
   An executive paying every month used to see two counts and a ninety-day
   plan. This is the month in full: every task finished by name, the
   highlights their talent chose to share, any time
   away, what the executive said in their own pulse, and what is next. The
   same page the email on the 1st links to. */
export default async function ReportPage({ searchParams }: {
  searchParams: Promise<{ placement?: string; month?: string }>;
}) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');
  if (profile.role !== 'client') redirect('/app');
  const sp = await searchParams;

  const [placements, tz] = await Promise.all([listPlacementsFor(profile.id), viewerTimezone(profile.id)]);
  if (!placements.length) return (
    <Shell profile={profile} active="/app/report" title="Your month" crumb="Once someone is working with you">
      <Empty of={{
        title: 'Your first month report is on its way',
        body: 'Once someone starts, this page fills in as the month goes: the tasks finished, the highlights they share with you and what is coming next. A summary arrives by email on the first of each month.',
        cta: { label: 'Ask your Client Success Manager', href: '/app/messages' }
      }} />
    </Shell>
  );

  const p = placements.find(x => x.id === sp.placement) ?? placements[0];
  const months = reportMonths(p.started_on, tz);
  const asked = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month + '-01' : null;
  const month = asked && months.includes(asked) ? asked : months[0];
  const r = await monthReport(p.id, month, { talentName: p.talent_name });
  const who = firstName(p.talent_name);
  const isCurrent = month === monthStart(todayIn(tz ?? 'America/Los_Angeles'));
  const going = r.pulse?.going ? GOING.find(g => g.n === r.pulse!.going)?.label : null;

  return (
    <Shell profile={profile} active="/app/report" title={`Your month with ${who}`}
      crumb={`${fmtMonth(month)}${isCurrent ? ', so far' : ''}`}
      action={<ReportPicker months={months} month={month}
        placements={placements.map(x => ({ id: x.id, name: x.talent_name }))} placement={p.id} />}>
      <div className="stack">
        <div className="report-stats">
          <div><b>{r.completed.length}</b><span>Tasks completed</span></div>
          <div><b>{r.daysLogged || '–'}</b><span>Days logged</span></div>
          <div><b>{r.open}</b><span>Still open</span></div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Completed</h3><span className="xs muted">{fmtMonth(month)}</span></div>
          {!r.completed.length ? (
            <p className="small muted" style={{ margin: 0 }}>
              {isCurrent ? `Nothing ticked off yet this month. As ${who} finishes work, it appears here by name.` : `No tasks were marked done in ${fmtMonth(month)}.`}
            </p>
          ) : (
            <ul className="report-list">
              {r.completed.map(t => (
                <li key={t.id}><span>{t.title}</span>
                  <span className="when">{t.done_at ? fmtDay(t.done_at) : ''}</span></li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Highlights from {who}</h3></div>
          {!r.highlights.length ? (
            <p className="small muted" style={{ margin: 0 }}>
              {who} writes a short note at the end of each day and can choose one highlight to share with you. None shared for this month yet.
            </p>
          ) : (
            <ul className="report-list">
              {r.highlights.map(h => (
                <li key={h.date + h.text.slice(0, 12)}><span>{h.text}</span><span className="when">{fmtDay(h.date)}</span></li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h3>Time away</h3></div>
            {!r.timeAway.length ? (
              <p className="small muted" style={{ margin: 0 }}>None this month.</p>
            ) : (
              <ul className="report-list">
                {r.timeAway.map(o => (
                  <li key={o.from}><span>{fmtDate(o.from)} to {fmtDate(o.to)}</span>
                    <span className="when">{o.state === 'approved' ? 'Cover arranged' : 'Being arranged'}</span></li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3>What you told us</h3></div>
            {!r.pulse ? (
              <>
                <p className="small muted" style={{ marginTop: 0 }}>
                  {isCurrent ? 'Your monthly pulse for this month is not in yet. It takes a minute, and it comes to us, not to ' + who + '.' : 'No pulse was filed for this month.'}
                </p>
                {isCurrent && <Link className="btn sm ghost" href={placements.length > 1 ? `/app/care/${p.id}` : '/app/care'}>File this month’s pulse</Link>}
              </>
            ) : (
              <>
                {going && <p className="verdict" style={{ marginTop: 0 }}>{going}</p>}
                {r.pulse.standout && <p className="small"><b>Went well.</b> {r.pulse.standout}</p>}
                {r.pulse.friction && <p className="small" style={{ marginBottom: 0 }}><b>Not working.</b> {r.pulse.friction}</p>}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Next month’s focus</h3></div>
          {!r.focus.length ? (
            <p className="small muted" style={{ marginTop: 0 }}>Nothing open. Hand {who} the next thing you want off your plate.</p>
          ) : (
            <ul className="report-list">
              {r.focus.map(t => (
                <li key={t.id}><span>{t.title}</span>
                  <span className="when">{t.due_on ? `Due ${fmtDay(t.due_on)}` : ''}</span></li>
              ))}
            </ul>
          )}
          <div className="row" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Link className="btn sm ghost" href="/app/tasks">Open the task list</Link>
            <Link className="btn sm ghost" href="/app/messages?tab=sm">Talk it through with your Client Success Manager</Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
