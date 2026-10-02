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
import TalentPaySetter from '@/components/TalentPaySetter';
import ResumePlacement from '@/components/ResumePlacement';
import { dayLabel, addDaysISO, noticeReasonLabel } from '@/lib/money-public';
import { ENDED_REASONS } from '@/lib/care-public';
import { TimeOffDecider } from '@/components/CareControls';
import { configured, supabaseServer } from '@/lib/supabase/server';
import { todayIn } from '@/lib/experience-public';

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
      action={
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Link className="btn sm ghost" href={`/app/brief?placement=${id}`}>Edit the briefing</Link>
          <Link className="btn sm ghost" href="/console/placements">All placements</Link>
        </span>
      }>

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
            <dd>{p.client_name}<div className="small muted">{p.client_email}{p.client_tz ? ` · ${p.client_tz.replaceAll('_', ' ')}` : ''}</div></dd>
            <dt>Talent</dt>
            <dd>{p.talent_name}<div className="small muted">{p.talent_headline ?? p.talent_email}{p.talent_tz ? ` · ${p.talent_tz.replaceAll('_', ' ')}` : ''}</div></dd>
            <dt>Started</dt><dd>{day(p.started_on)}</dd>
            {p.ended_on && <><dt>Ended</dt>
              <dd>{day(p.ended_on)}{p.ended_reason ? ` · ${ENDED_REASONS.find(r => r.key === p.ended_reason)?.label ?? p.ended_reason}` : ''}
                {p.ended_on && ENDED_REASONS.find(r => r.key === p.ended_reason)?.guaranteed && (
                  terms?.replaced_by
                    ? <div className="xs muted" style={{ marginTop: 4 }}>Replaced by <Link href={`/console/placements/${terms.replaced_by.id}`}>{terms.replaced_by.name}</Link></div>
                    : <div style={{ marginTop: 6 }}><Link className="btn sm ghost" href={`/console/placements?replace=${id}`}>Place the replacement</Link></div>
                )}
              </dd></>}
            {terms?.replaces && <><dt>Replaces</dt>
              <dd><Link href={`/console/placements/${terms.replaces.id}`}>{terms.replaces.name}</Link>
                <div className="xs muted">Carries the rest of that placement&rsquo;s minimum term.</div></dd></>}
            <dt>Minimum term</dt>
            <dd>{terms?.minimum_ends ? `Through ${dayLabel(addDaysISO(terms.minimum_ends, -1))}` : '–'}</dd>
            <dt>Client pays</dt>
            <dd><RateSetter placementId={id} cents={terms?.rate_month_cents ?? null} />
              {terms?.notice_given_on && <div className="xs muted" style={{ marginTop: 4 }}>
                Notice given {day(terms.notice_given_on)}{terms.notice_ends_on ? `, billed through ${dayLabel(terms.notice_ends_on)}` : ''}
                {terms.notice_reason ? `. ${noticeReasonLabel(terms.notice_reason)}` : ''}</div>}</dd>
            <dt>Talent is paid</dt>
            <dd><TalentPaySetter placementId={id} cents={terms?.talent_pay_cents ?? null}
              fallbackCents={terms?.roster_pay_cents ?? null} clientCents={terms?.rate_month_cents ?? null} /></dd>
            {terms?.suspended_at && <><dt>Paused</dt>
              <dd><span className="pill warn">Since {dayLabel(terms.suspended_at.slice(0, 10))}</span>
                <div className="xs muted" style={{ margin: '4px 0 6px' }}>{terms.suspended_reason ?? 'An invoice is open fourteen days.'} Payroll is not created while paused; it resumes on its own when paid.</div>
                <ResumePlacement placementId={id} /></dd></>}
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
              <span className="xs muted">rapport {c.rapport ?? '–'}/5 · workload {c.workload ?? '–'}</span>
            </div>
            {c.shipped && <p className="small"><span className="muted">Shipped: </span>{c.shipped}</p>}
            {c.blocked && <p className="small"><span className="muted">Blocked: </span>{c.blocked}</p>}
            {c.note && <p className="small"><span className="muted">Private: </span>{c.note}</p>}
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
                {GOING.find(g => g.n === pulse.going)?.label ?? '–'}
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

      <EndPlacement placementId={id} noticeGivenOn={terms?.notice_given_on ?? null} endedOn={p.ended_on}
        noticeEndsOn={terms?.notice_ends_on ?? null} noticeReason={terms?.notice_reason ?? null}
        minimumEnds={terms?.minimum_ends ?? null} startedOn={p.started_on} />

      <FirstFortnight steps={steps} startedOn={p.started_on} side="admin" today={todayIn('America/Los_Angeles')} />

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

type Terms = {
  rate_month_cents: number | null; talent_pay_cents: number | null; roster_pay_cents: number | null;
  notice_given_on: string | null; notice_ends_on: string | null; notice_reason: string | null;
  minimum_ends: string | null; suspended_at: string | null; suspended_reason: string | null;
  replaces: { id: string; name: string } | null; replaced_by: { id: string; name: string } | null;
};

/* The commercial terms on this placement, for the pairing card. Each read is
   its own, so a database one migration behind still shows what it can. */
async function termsFor(placementId: string): Promise<Terms | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const [{ data: t }, { data: pl }, { data: minEnds }, { data: next }] = await Promise.all([
    sb.from('placement_terms')
      .select('rate_month_cents, talent_pay_cents, notice_given_on, notice_ends_on, notice_reason')
      .eq('placement_id', placementId).maybeSingle(),
    sb.from('placements')
      .select('talent_id, suspended_at, suspended_reason, replaces_id, prev:replaces_id(id, talent:talent_id(full_name))')
      .eq('id', placementId).maybeSingle(),
    sb.rpc('placement_minimum_ends', { p_id: placementId }),
    sb.from('placements').select('id, talent:talent_id(full_name)').eq('replaces_id', placementId).limit(1).maybeSingle()
  ]);
  let roster: number | null = null;
  if ((pl as any)?.talent_id) {
    const { data: tp } = await sb.from('talent_pay').select('rate_month_cents').eq('talent_id', (pl as any).talent_id).maybeSingle();
    roster = (tp as any)?.rate_month_cents ?? null;
  }
  const prev = (pl as any)?.prev;
  return {
    rate_month_cents: (t as any)?.rate_month_cents ?? null,
    talent_pay_cents: (t as any)?.talent_pay_cents ?? null,
    roster_pay_cents: roster,
    notice_given_on: (t as any)?.notice_given_on ?? null,
    notice_ends_on: (t as any)?.notice_ends_on ?? null,
    notice_reason: (t as any)?.notice_reason ?? null,
    minimum_ends: typeof minEnds === 'string' ? minEnds : null,
    suspended_at: (pl as any)?.suspended_at ?? null,
    suspended_reason: (pl as any)?.suspended_reason ?? null,
    replaces: prev ? { id: prev.id, name: prev.talent?.full_name ?? 'the earlier placement' } : null,
    replaced_by: next ? { id: (next as any).id, name: (next as any).talent?.full_name ?? 'the replacement' } : null
  };
}
