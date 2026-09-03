import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { alertsFor, getPlacement, listCheckins, listNotes, listTasks, weekEnding } from '@/lib/work';
import { listInterviews } from '@/lib/store';
import Shell from '@/components/Shell';
import NoteAdder from '@/components/NoteAdder';
import FeedbackWriter from '@/components/FeedbackWriter';
import FirstFortnight from '@/components/FirstFortnight';
import { feedbackFor, pulseFor, stepsFor, timeOffFor, GOING, WORKLOADS, TIME_OFF_STATE, nights } from '@/lib/care';

export const dynamic = 'force-dynamic';

const day = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default async function PlacementFile({ params }: { params: Promise<{ id: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const { id } = await params;

  const p = await getPlacement(id);
  if (!p) redirect('/console/placements');

  const week = weekEnding();
  const [tasks, checkins, notes, interviews, steps, feedback, pulse, off] = await Promise.all([
    listTasks(id),
    listCheckins({ talentId: p.talent_id, limit: 20 }),
    listNotes(id),
    listInterviews({ talentId: p.talent_id }),
    stepsFor(id),
    feedbackFor(p.talent_id),
    pulseFor(id),
    timeOffFor(id)
  ]);
  const mine = checkins.filter(c => c.placement_id === id);
  const alerts = alertsFor({ tasks, checkins: mine, startedOn: p.started_on, thisWeek: week });
  const open = tasks.filter(t => !t.done);
  const daysIn = Math.floor((Date.now() - new Date(p.started_on + 'T00:00:00').getTime()) / 86400000);

  return (
    <Shell profile={profile} active="/console/placements"
      title={`${p.talent_name} → ${p.client_name}`}
      crumb={p.org_name ?? 'Placement file'}
      action={<Link className="btn sm ghost" href="/console/placements">← All placements</Link>}>

      <div className="grid-4">
        <div className="card stat"><div className="eyebrow">Running</div>
          <div className="score">{daysIn}<span className="of"> days</span></div></div>
        <div className="card stat"><div className="eyebrow">Open tasks</div>
          <div className="score">{open.length}</div></div>
        <div className="card stat"><div className="eyebrow">Check-ins filed</div>
          <div className="score">{mine.length}</div></div>
        <div className="card stat"><div className="eyebrow">Alerts</div>
          <div className="score">{alerts.filter(a => a.level === 'high').length}</div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Needs your attention</h3>
          <span className={`pill ${alerts.length ? 'warn' : 'good'}`}>
            {alerts.length ? `${alerts.length}` : <><span className="dot" />Clear</>}</span></div>
        {alerts.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">Nothing is off. Check-ins are current, tasks are moving.</p></div>
        ) : (
          <ul className="alert-list">
            {alerts.map((a, i) => (
              <li key={i} className={a.level}>
                <span className="alert-dot" />{a.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>The pairing</h3></div>
          <div className="brief-facts">
            <span className="eyebrow">Executive</span>
            <span>{p.client_name}<div className="small muted">{p.client_email}{p.client_tz ? ` · ${p.client_tz.replace('_', ' ')}` : ''}</div></span>
            <span className="eyebrow">Talent</span>
            <span>{p.talent_name}<div className="small muted">{p.talent_headline ?? p.talent_email}{p.talent_tz ? ` · ${p.talent_tz.replace('_', ' ')}` : ''}</div></span>
            <span className="eyebrow">Started</span><span>{day(p.started_on)}</span>
            {p.ended_on && <><span className="eyebrow">Ended</span>
              <span>{day(p.ended_on)}{p.ended_reason ? ` · ${p.ended_reason}` : ''}</span></>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Interviews</h3><span className="pill">{interviews.length}</span></div>
          {interviews.length === 0 ? (
            <div className="empty"><span className="tick" /><p className="small">None recorded.</p></div>
          ) : (
            <ul className="past-list">
              {interviews.slice(0, 6).map(iv => (
                <li key={iv.id}>
                  <span className="past-date">{new Date(iv.starts_at)
                    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  <span className="small">{iv.stage} · {iv.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Check-in history</h3></div>
        {mine.length === 0 ? (
          <div className="empty"><span className="tick" /><p className="small">Nothing filed yet.</p></div>
        ) : mine.map(c => (
          <div key={c.id} className={`checkin ${c.needs_attention ? 'flagged' : ''}`}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <b>{day(c.week_ending)}</b>
              <span className="xs muted">rapport {c.rapport ?? '—'}/5 · workload {c.workload ?? '—'}</span>
            </div>
            {c.shipped && <p className="small"><span className="muted">Shipped — </span>{c.shipped}</p>}
            {c.blocked && <p className="small"><span className="muted">Blocked — </span>{c.blocked}</p>}
            {c.note && <p className="small"><span className="muted">Private — </span>{c.note}</p>}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3>Open work</h3><span className="pill">{open.length}</span></div>
        {open.length === 0 ? (
          <div className="empty"><span className="tick" /><p className="small">Nothing outstanding.</p></div>
        ) : (
          <ul className="past-list">
            {open.slice(0, 12).map(t => (
              <li key={t.id}>
                <span className="past-date">{t.due_on ? day(t.due_on) : 'No date'}</span>
                <span className="small"><span className={`pri ${t.priority}`}>{t.priority}</span> {t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>What the executive says</h3>
          <span className="xs muted">Monthly pulse</span>
        </div>
        {!pulse ? (
          <div className="empty"><span className="tick" />
            <p className="small">Nothing filed this month. It sits on their Placement page.</p></div>
        ) : (
          <>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span className={`pill ${pulse.needs_attention ? 'crit' : 'good'}`}>
                {GOING.find(g => g.n === pulse.going)?.label ?? '—'}
              </span>
              <span className="pill">{WORKLOADS.find(w => w.key === pulse.workload)?.label}</span>
              {pulse.keep_going === false && <span className="pill crit">Would not place again</span>}
            </div>
            {pulse.standout && <p className="small"><b>Went well.</b> {pulse.standout}</p>}
            {pulse.friction && <p className="small" style={{ marginTop: 6 }}><b>Not working.</b> {pulse.friction}</p>}
          </>
        )}
      </div>

      {off.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Time off</h3></div>
          {off.map(t => {
            const st = TIME_OFF_STATE.find(x => x.key === t.state);
            return (
              <div key={t.id} className="row between" style={{ padding: '10px 0', gap: 12, flexWrap: 'wrap' }}>
                <div><b className="small">{day(t.starts_on)} – {day(t.ends_on)}</b>
                  <div className="xs muted">{nights(t.starts_on, t.ends_on)} days
                    {t.reason ? ` · ${t.reason}` : ''}{t.cover_note ? ` · cover: ${t.cover_note}` : ''}</div></div>
                <span className={`pill ${st?.tone ?? ''}`}>{st?.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <FeedbackWriter placementId={id} talentId={p.talent_id}
        talentName={p.talent_name} existing={feedback} />

      <FirstFortnight steps={steps} startedOn={p.started_on} side="admin" />

      <div className="card">
        <div className="card-head"><h3>Your file</h3><span className="pill">{notes.length}</span></div>
        <NoteAdder placementId={id} />
        {notes.length > 0 && (
          <ul className="note-list">
            {notes.map(n => (
              <li key={n.id}>
                <div className="row between">
                  <span className={`pill ${n.kind === 'escalation' ? 'crit' : n.kind === 'resolution' ? 'good' : ''}`}>{n.kind}</span>
                  <span className="xs muted">{new Date(n.created_at)
                    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <p className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
