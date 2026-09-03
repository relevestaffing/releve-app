import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { allDecisions, allFeedback } from '@/lib/work';
import Shell from '@/components/Shell';

export const dynamic = 'force-dynamic';

const day = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

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
    <Shell profile={profile} active="/console/signals" title="What we are learning"
      crumb="Decisions and interview feedback">

      <div className="grid-4">
        <div className="card stat"><div className="eyebrow">Decisions recorded</div>
          <div className="score">{decisions.length}</div></div>
        <div className="card stat"><div className="eyebrow">Shortlisted</div>
          <div className="score">{rate === null ? '—' : `${rate}%`}</div></div>
        <div className="card stat"><div className="eyebrow">Interviews scored</div>
          <div className="score">{rated.length}</div></div>
        <div className="card stat"><div className="eyebrow">Average interview</div>
          <div className="score">{avg ?? '—'}{avg && <span className="of">/5</span>}</div></div>
      </div>

      {decisions.length < 8 && (
        <div className="card">
          <p className="small muted" style={{ margin: 0 }}>
            These numbers only start meaning something after a few dozen decisions.
            Until then, read the individual reasons rather than the percentages.
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Why executives pass</h3>
          <span className="pill">{passed.length}</span></div>
        {ranked.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">Nobody has passed on a candidate yet — or nobody has told you why.</p></div>
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
                <b>Worth noticing:</b> “{worst[0]}” is your most common rejection.
                {worst[0].includes('experience') && ' That is a briefing problem, not a matching one — it means the role brief and the bench are describing different jobs.'}
                {worst[0].includes('timezone') && ' That is a conditions problem — the overlap check should be catching this before a name reaches an executive.'}
                {worst[0].includes('Communication') && ' That is the one your Signature should be predicting. If it keeps appearing, the instrument is missing something real.'}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Recent decisions</h3></div>
        {decisions.length === 0 ? (
          <div className="empty"><span className="tick" /><p className="small">Nothing recorded yet.</p></div>
        ) : (
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Executive</th><th>Candidate</th><th>Decision</th><th>Reason</th><th>When</th></tr></thead>
            <tbody>
              {decisions.slice(0, 25).map(d => (
                <tr key={d.id}>
                  <td><b>{d.client?.full_name ?? '—'}</b>
                    {d.client?.org_name && <div className="small muted">{d.client.org_name}</div>}</td>
                  <td>{d.talent?.full_name ?? '—'}</td>
                  <td><span className={`pill ${d.state === 'shortlisted' || d.state === 'hired' ? 'good' : ''}`}>
                    {d.state}</span></td>
                  <td className="small muted">{d.reason ?? '—'}{d.note ? ` · ${d.note}` : ''}</td>
                  <td className="small muted">{day(d.decided_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Interview feedback</h3>
          <span className={`pill ${noes ? 'warn' : ''}`}>{noes} said no</span></div>
        {feedback.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">No interview has been scored yet. Both sides are asked once the time has passed.</p></div>
        ) : feedback.slice(0, 20).map(f => (
          <div key={f.id} className={`checkin ${f.proceed === 'no' ? 'flagged' : ''}`}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <b>{f.side === 'client' ? 'Executive' : 'Talent'} · {f.interview?.stage ?? 'Interview'}</b>
              <span className="xs muted">
                {f.rating ?? '—'}/5 · would proceed: {f.proceed ?? '—'} · {day(f.created_at)}
              </span>
            </div>
            {f.strengths && <p className="small"><span className="muted">Stood out — </span>{f.strengths}</p>}
            {f.concerns && <p className="small"><span className="muted">Pause — </span>{f.concerns}</p>}
            {f.notes && <p className="small"><span className="muted">For Relève — </span>{f.notes}</p>}
          </div>
        ))}
      </div>
    </Shell>
  );
}
