import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { alertsFor, getPlacement, listCheckins, listNotes, listTasks, weekEnding } from '@/lib/work';
import { listInterviews } from '@/lib/store';
import Shell from '@/components/Shell';
import NoteAdder from '@/components/NoteAdder';
import FeedbackWriter from '@/components/FeedbackWriter';
import FirstFortnight from '@/components/FirstFortnight';
import ManagerPicker from '@/components/ManagerPicker';
import { feedbackFor, pulseFor, stepsFor, timeOffFor, teamRoles, GOING, WORKLOADS, TIME_OFF_STATE, nights } from '@/lib/care';
import { fmtDate, fmtWhen } from '@/lib/words';
import TaskBoard from '@/components/TaskBoard';
import RateSetter from '@/components/RateSetter';
import EndPlacement from '@/components/EndPlacement';
import { TimeOffDecider } from '@/components/CareControls';
import { configured, supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const day = fmtDate;

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
    timeOffFor(id),
  ]);
  const team = await teamRoles();
  const terms = await termsFor(id);
  const mine = checkins.filter(c => c.placement_id === id);
  const alerts = alertsFor({ tasks, checkins: mine, startedOn: p.started_on, thisWeek: week });
  const open = tasks.filter(t => !t.done);
  const daysIn = Math.floor((Date.now() - new Date(p.started_on + 'T00:00:00').getTime()) / 86400000);

  return (
    <Shell profile={profile} active="/console/placements"
      title={`${p.talent_name} with ${p.org_name ?? p.client_name}`}
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
          <dl className="brief-facts">
            <dt>Executive</dt>
            <dd>{p.client_name}<div className="small muted">{p.client_email}{p.client_tz ? ` · ${p.client_tz.replace('_', ' ')}` : ''}</div></dd>
            <dt>Talent</dt>
            <dd>{p.talent_name}<div className="small muted">{p.talent_headline ?? p.talent_email}{p.talent_tz ? ` · ${p.talent_tz.replace('_', ' ')}` : ''}</div></dd>
            <dt>Started</dt><dd>{day(p.started_on)}</dd>
            {p.ended_on && <><dt>Ended</dt>
              <dd>{day(p.ended_on)}{p.ended_reason ? ` · ${p.ended_reason}` : ''}</dd></>}
            <dt>Client pays</dt>
            <dd><RateSetter placementId={id} cents={terms?.rate_month_cents ?? null} />
              {terms?.notice_given_on && <div className="xs muted" style={{ marginTop: 4 }}>Notice given {day(terms.notice_given_on)}</div>}</dd>
          </dl>
          <div className="hr" style={{ margin: '18px 0 16px' }} />
          <div className="eyebrow" style={{ marginBottom: 12 }}>Who looks after this</div>
          <ManagerPicker key={`${p.csm_id}-${p.tsm_id}`} placementId={id} team={team}
            csm={p.csm_id} tsm={p.tsm_id} />
        </div>

        <div className="card">
          <div className="card-head"><h3>Interviews</h3><span className="pill">{interviews.length}</span></div>
          {interviews.length === 0 ? (
            <div className="empty"><span className="tick" /><p className="small">None recorded.</p></div>
          ) : (
            <ul className="past-list">
              {interviews.slice(0, 6).map(iv => (
                <li key={iv.id}>
                  <span className="past-date">{fmtWhen(iv.starts_at)}</span>
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

      {/* The shared task list, live — the console used to show a read-only
          excerpt, with no way to add, assign or unblock anything from the one
          place where Relève is looking at the whole placement. */}
      <TaskBoard placementId={id} me={profile.id} side="admin" counterpart={p.talent_name} />

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
                {t.state === 'requested' && <div style={{ width: '100%' }}><TimeOffDecider id={t.id} state={t.state} /></div>}
              </div>
            );
          })}
        </div>
      )}

      <FeedbackWriter placementId={id} talentId={p.talent_id}
        talentName={p.talent_name} existing={feedback} />

      <EndPlacement placementId={id} noticeGivenOn={terms?.notice_given_on ?? null} endedOn={p.ended_on} />

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
                  <span className="xs muted">{fmtDate(n.created_at)}</span>
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

/* The commercial terms on this placement, for the pairing card. */
async function termsFor(placementId: string): Promise<{ rate_month_cents: number | null; notice_given_on: string | null } | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('placement_terms').select('rate_month_cents, notice_given_on').eq('placement_id', placementId).maybeSingle();
  return (data as any) ?? null;
}
