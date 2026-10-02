import Link from 'next/link';
import { feedbackFor, pulseFor, stepsFor, timeOffFor, FEEDBACK_SCORES } from '@/lib/care';
import { listTasks } from '@/lib/work';
import { getSelfProfile } from '@/lib/store';
import type { Placement } from '@/lib/work-public';
import PulseForm from '@/components/PulseForm';
import TimeOffForm from '@/components/TimeOffForm';
import FirstFortnight from '@/components/FirstFortnight';
import SeenFeedback from '@/components/SeenFeedback';
import GiveNotice from '@/components/GiveNotice';
import { TIME_OFF_STATE } from '@/lib/care-public';
import { dayLabel } from '@/lib/money-public';
import { configured, supabaseServer } from '@/lib/supabase/server';
import { Portrait } from '@/components/Viz';
import { WORDS } from '@/lib/words';
import { getBrief, myRequests, primaryManager, viewerTimezone, todayIn } from '@/lib/experience';
import { currentProfile } from '@/lib/supabase/server';
import ManagerLine from '@/components/ManagerLine';
import ClientRequests from '@/components/ClientRequests';
import BriefEditor from '@/components/BriefEditor';
import { firstName } from '@/lib/words';

/* A rough, human "how long" rather than a precise day count — this is the
   executive reading about a relationship, not an admin reading a ledger.
   lib/console.ts already has an exact "days in seat" for that audience. */
function togetherFor(startedOn: string): string {
  const days = Math.floor((Date.now() - new Date(startedOn + 'T00:00:00Z').getTime()) / 86_400_000);
  if (days < 1) return 'Started today';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} together`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} together`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} year${years === 1 ? '' : 's'}${rest ? `, ${rest} mo` : ''} together`;
}

/* One placement, in full.
   ----------------------
   This used to be the whole of /app/care, which read the first placement and
   discarded the rest — an executive with two assistants could reach only one
   of them, and the second person's pulse, plan and time off were unreachable
   through the interface entirely.

   Pulling it out into a component is what lets the same view serve both the
   single-placement route and a page per person, so the two can never drift
   into showing different things about the same relationship.

   Order, for the executive: who this is, then how the relationship stands
   (together how long, task wins, what's open), then the plan, then a way to
   flag something. The monthly pulse used to sit second on the page — right
   where "See the full plan" landed — so clicking through to the plan opened
   on a feedback form instead. It is a deliberate, occasional thing to fill
   in, not what this page is for, so it now sits at the very bottom. */
export default async function PlacementView({
  placement, side, userId
}: {
  placement: Placement;
  side: 'client' | 'talent';
  userId: string;
}) {
  const p = placement;
  const [me, tz] = await Promise.all([currentProfile(), viewerTimezone(userId)]);
  const today = todayIn(tz ?? 'America/Los_Angeles');
  const [manager, brief, requests] = await Promise.all([
    me ? primaryManager(me, p.id) : Promise.resolve(null),
    side === 'client' ? getBrief(p.id) : Promise.resolve(null),
    side === 'client' ? myRequests(userId) : Promise.resolve([])
  ]);
  const [steps, pulse, off, feedback, tasks, talentSelf, terms] = await Promise.all([
    stepsFor(p.id),
    side === 'client' ? pulseFor(p.id) : Promise.resolve(null),
    /* Both sides: the executive can see leave coming, which is the whole
       point of asking ahead — the policy always allowed it, the page did not. */
    timeOffFor(p.id),
    side === 'talent' ? feedbackFor(userId) : Promise.resolve([]),
    listTasks(p.id),
    side === 'client' ? getSelfProfile(p.talent_id) : Promise.resolve(null),
    side === 'client' ? clientTerms(p.id) : Promise.resolve(null)
  ]);
  const upcomingOff = off.filter(o => (o.state === 'approved' || o.state === 'requested') && o.ends_on >= today);

  const shared = feedback.filter(f => f.shared);
  const unseen = shared.find(f => !f.seen_at);

  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  const overdue = open.filter(t => t.due_on && t.due_on < today);

  return (
    <div className="stack">
      {/* Who this is, before anything about the work — the same idea as the
         executive's own profile, for the person on the other side of it. */}
      {side === 'client' && talentSelf && (
        <Link href={`/app/care/talent/${p.talent_id}`} className="card dark link-card">
          <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 16 }}>Working with</div>
          <div className="row" style={{ gap: 18 }}>
            <Portrait id={p.talent_id} name={p.talent_name} cls="lg" url={talentSelf.photo_url} />
            <div>
              <h2 style={{ fontSize: 24, color: 'var(--cream)', marginBottom: 6 }}>{p.talent_name}</h2>
              <p style={{ fontFamily: 'Marcellus,serif', fontSize: 16, color: 'var(--pale)' }}>
                {[talentSelf.headline, talentSelf.location].filter(Boolean).join(' · ') || 'Your talent'}
              </p>
            </div>
          </div>
          {talentSelf.bio && <p className="small" style={{ maxWidth: 620, marginTop: 18 }}>{talentSelf.bio}</p>}
          <span className="xs muted" style={{ display: 'inline-block', marginTop: 14 }}>
            See their full profile, breakdown and intro video →
          </span>
        </Link>
      )}

      {/* What is actually happening: how long, and what the work has added
         up to, before anything asking for input. */}
      <div className="card">
        <div className="card-head">
          <h3>Where things stand</h3>
          <span className="xs muted">{togetherFor(p.started_on)}</span>
        </div>
        <div className="tally-row">
          <div><b>{open.length}</b><span>open {open.length === 1 ? 'task' : 'tasks'}</span></div>
          <div><b>{done.length}</b><span>task {done.length === 1 ? 'win' : 'wins'}</span></div>
          <div><b>{overdue.length}</b><span>overdue</span></div>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <a className="btn sm ghost" href="/app/tasks">
            {side === 'client' ? 'Assign and review work' : 'See your tasks'}
          </a>
          {side === 'client'
            ? <a className="btn sm ghost" href={`/app/report?placement=${p.id}`}>Your month with {firstName(p.talent_name)}</a>
            : <>
                <a className="btn sm ghost" href="/app/log">Today’s log</a>
                <a className="btn sm ghost" href={`/app/brief?placement=${p.id}`}>Your briefing</a>
              </>}
        </div>
      </div>

      <FirstFortnight steps={steps} startedOn={p.started_on} side={side} today={today} />

      {side === 'client' && (
        <BriefEditor placementId={p.id} talentName={firstName(p.talent_name)} initial={brief} />
      )}

      {side === 'talent' && (
        <>
          {unseen && <SeenFeedback id={unseen.id} />}
          <div className="card">
            <div className="card-head"><h3>How you are doing</h3></div>
            {!shared.length ? (
              <p className="small muted">
                Nothing yet. {WORDS.tsm}s write this after your first full month,
                and you will see it here the moment it is ready.
              </p>
            ) : shared.map(f => (
              <div key={f.id} style={{ paddingBottom: 20, marginBottom: 20, borderBottom: '1px solid var(--mist)' }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>{f.period}</div>
                <div className="fb-scores">
                  {FEEDBACK_SCORES.map(s => (
                    <div key={s.key} className="fb-score">
                      <div className="n">{f[s.key] ?? '–'}<small> / 5</small></div>
                      <div className="k">{s.label}</div>
                    </div>
                  ))}
                </div>
                <p className="small" style={{ marginBottom: 12 }}><b>What is going well.</b> {f.strengths}</p>
                {f.growing && <p className="small"><b>What to build on.</b> {f.growing}</p>}
              </div>
            ))}
          </div>

          <TimeOffForm placementId={p.id} existing={off} />
        </>
      )}

      <div className="card">
        <div className="card-head"><h3>{side === 'client' ? 'Your Client Success Manager' : 'Your Talent Success Manager'}</h3></div>
        {manager && <div style={{ marginBottom: 16 }}><ManagerLine manager={manager} /></div>}
        <p className="small muted" style={{ marginBottom: 16, maxWidth: 620 }}>
          {side === 'client'
            ? 'Anything that is not working, or anything you want changed, say it here directly. That is what they are for.'
            : 'Yours, not the executive’s. Nothing you send is passed on.'}
        </p>
        <a className="btn sm ghost" href="/app/messages?tab=sm">
          {manager?.id ? `Message ${firstName(manager.name)}` : 'Message your manager'}
        </a>
      </div>

      {side === 'client' && (
        <ClientRequests placementId={p.id} talentName={firstName(p.talent_name)} existing={requests} today={today} />
      )}

      {side === 'client' && upcomingOff.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Time away</h3></div>
          {upcomingOff.map(o => {
            const st = TIME_OFF_STATE.find(s => s.key === o.state);
            return (
              <div key={o.id} className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--mist)', gap: 12, flexWrap: 'wrap' }}>
                <span className="small"><b>{dayLabel(o.starts_on)}</b> to <b>{dayLabel(o.ends_on)}</b></span>
                <span className={`pill ${st?.tone ?? ''}`}>{o.state === 'requested' ? 'Requested, Relève arranging cover' : st?.label ?? o.state}</span>
                {o.cover_note && <span className="xs muted" style={{ width: '100%' }}>Cover: {o.cover_note}</span>}
              </div>
            );
          })}
          <p className="xs muted" style={{ marginTop: 10 }}>Relève arranges cover before the day. Nothing is approved without it.</p>
        </div>
      )}

      {/* The monthly check-in. Occasional and deliberate, so it goes last. */}
      {side === 'client' && (
        <PulseForm key={pulse?.filed_at ?? 'new'} placementId={p.id}
          talentName={p.talent_name} existing={pulse} />
      )}

      {side === 'client' && (
        <GiveNotice placementId={p.id} talentName={p.talent_name} noticeGivenOn={terms?.notice_given_on ?? null}
          noticeEndsOn={terms?.notice_ends_on ?? null} minimumEnds={terms?.minimum_ends ?? null} />
      )}
    </div>
  );
}

/* The executive's own terms, for the notice state only. Read through
   my_placement_terms, the client-safe view: the placement_terms base table
   carries talent pay and has no client policy. */
async function clientTerms(placementId: string): Promise<{
  notice_given_on: string | null; notice_ends_on: string | null; minimum_ends: string | null;
} | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('my_placement_terms')
    .select('notice_given_on, notice_ends_on, minimum_ends').eq('placement_id', placementId).maybeSingle();
  return (data as any) ?? null;
}
