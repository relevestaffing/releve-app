import { redirect } from 'next/navigation';
import ConsoleTabs from '@/components/ConsoleTabs';
import { currentProfile } from '@/lib/supabase/server';
import { allDecisions, allFeedback } from '@/lib/work';
import Shell from '@/components/Shell';
import { fmtDate, DASH } from '@/lib/words';

export const metadata = { title: 'Match accuracy' };

export const dynamic = 'force-dynamic';

const day = (d: string) =>
  fmtDate(d);

export default async function Signals() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const [decisions, feedback] = await Promise.all([allDecisions(), allFeedback()]);

  const passed = decisions.filter(d => d.state === 'passed');
  const shortlisted = decisions.filter(d => d.state === 'shortlisted' || d.state === 'hired');
  const rate = decisions.length ? Math.round((shortlisted.length / decisions.length) * 100) : null;

  const reasons = new Map<string, number>();
  passed.forEach(d => { if (d.reason) reasons.set(d.reason, (reasons.get(d.reason) ?? 0) + 1); });
  const ranked = [...reasons.entries()].sort((a, b) => b[1] - a[1]);
  const worst = ranked[0];

  const rated = feedback.filter(f => f.rating != null);
  const avg = rated.length
    ? (rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length).toFixed(1) : null;
  const noes = feedback.filter(f => f.proceed === 'no').length;

  return (
    <Shell profile={profile} active="/console/business" title="The business"
      crumb="Match accuracy">
      <ConsoleTabs active="/console/signals" items={[
        { href: '/console/reports', label: 'Reports' },
        { href: '/console/signals', label: 'Match accuracy' },
        { href: '/console/calendar', label: 'Calendar' },
        { href: '/console/booking', label: 'Booking page' },
        { href: '/console/team', label: 'Team' },
        { href: '/console/training', label: 'Training' }
      ]} />

      <div className="card tight">
        <p className="small" style={{ margin: 0, maxWidth: 660 }}>
          <b>How well your candidates land.</b> How often executives approve a candidate,
          how they score interviews, and why they decline. The six-month view is on
          Reports under <i>Assessment accuracy</i>.
        </p>
      </div>

      <div className="grid-4">
        <div className="card stat"><div className="eyebrow">Decisions recorded</div>
          <div className="score">{decisions.length}</div></div>
        <div className="card stat"><div className="eyebrow">Approval rate</div>
          <div className="score">{rate === null ? DASH : `${rate}%`}</div></div>
        <div className="card stat"><div className="eyebrow">Interviews scored</div>
          <div className="score">{rated.length}</div></div>
        <div className="card stat"><div className="eyebrow">Average interview</div>
          <div className="score">{avg ?? DASH}{avg && <span className="of">/5</span>}</div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Why executives pass</h3>
          {passed.length > 0 && <span className="pill">{passed.length} on file</span>}</div>
        {ranked.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">No declines with a reason recorded yet.</p></div>
        ) : (
          <>
            <ul className="past-list">
              {ranked.map(([reason, n]) => (
                <li key={reason}>
                  <span className="past-date">{n}×</span>
                  <span className="small">{reason}</span>
                </li>
              ))}
            </ul>
            {worst && worst[1] >= 3 && (
              <p className="small" style={{ marginTop: 18 }}>
                <b>Most common reason:</b> “{worst[0]}”.
                {worst[0].includes('experience') && ' This usually means the role brief and the roster describe different jobs. Tighten the brief first.'}
                {worst[0].includes('timezone') && ' The overlap check should catch this before a candidate reaches an executive.'}
                {worst[0].includes('Communication') && ' The Relève Signature™ should predict this. If it keeps appearing, the assessment is missing something.'}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Recent decisions</h3></div>
        {decisions.length === 0 ? (
          <div className="empty"><span className="tick" /><p className="small">No decisions recorded yet.</p></div>
        ) : (
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Executive</th><th>Candidate</th><th>Decision</th><th>In their words</th><th>When</th></tr></thead>
            <tbody>
              {decisions.slice(0, 25).map(d => (
                <tr key={d.id}>
                  <td><b>{d.client?.full_name ?? DASH}</b>
                    {d.client?.org_name && <div className="small muted">{d.client.org_name}</div>}</td>
                  <td>{d.talent?.full_name ?? DASH}</td>
                  <td><span className={`pill ${d.state === 'shortlisted' || d.state === 'hired' ? 'good' : ''}`}>
                    {d.state === 'shortlisted' ? 'Approved' : d.state === 'passed' ? 'Declined'
                      : d.state === 'interviewing' ? 'Interviewing' : 'Hired'}</span></td>
                  <td className="small muted">{d.reason ?? DASH}{d.note ? ` · ${d.note}` : ''}</td>
                  <td className="small muted">{day(d.decided_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Interview feedback</h3>
          {noes > 0 && <span className="pill warn">{noes} said no</span>}</div>
        {feedback.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">No interviews scored yet. Both sides are asked for a score after each interview.</p></div>
        ) : feedback.slice(0, 20).map(f => (
          <div key={f.id} className={`checkin ${f.proceed === 'no' ? 'flagged' : ''}`}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <b>{f.side === 'client' ? 'Executive' : 'Talent'} · {f.interview?.stage ?? 'Interview'}</b>
              <span className="xs muted">
                {f.rating ?? DASH}/5 · would proceed: {f.proceed ?? DASH} · {day(f.created_at)}
              </span>
            </div>
            {f.strengths && <p className="small"><span className="muted">Stood out: </span>{f.strengths}</p>}
            {f.concerns && <p className="small"><span className="muted">Concerns: </span>{f.concerns}</p>}
            {f.notes && <p className="small"><span className="muted">For Relève: </span>{f.notes}</p>}
          </div>
        ))}
      </div>
    </Shell>
  );
}
