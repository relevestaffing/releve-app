import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import {
  allPulses, guaranteeWatch, replacementsOwed, reviewsDue,
  upcomingTimeOff, GOING, WORKLOADS, TIME_OFF_STATE, nights
} from '@/lib/care';
import Shell from '@/components/Shell';
import ConsoleTabs from '@/components/ConsoleTabs';
import { TimeOffDecider, OutcomeForm } from '@/components/CareControls';
import { fmtDate, DASH } from '@/lib/words';
import Link from 'next/link';
import Empty from '@/components/Empty';
import RequestDesk from '@/components/RequestDesk';
import { allRequests, mineFor } from '@/lib/experience';

export const metadata = { title: 'Care' };

export const dynamic = 'force-dynamic';

const day = fmtDate;

/* Everything that needs a person to look at it, in the order it will hurt if
   nobody does. */
export default async function ConsoleCare({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const mine = (await searchParams).mine === '1';

  const [allPulsesRows, allOff, due, watch, owed, allReq, scope] = await Promise.all([
    allPulses(60), upcomingTimeOff(45), reviewsDue(), guaranteeWatch(), replacementsOwed(), allRequests(80),
    mine ? mineFor(profile.id) : Promise.resolve(null)
  ]);
  /* "Mine": only the placements this manager looks after as CSM or TSM.
     Searches with no placement yet (the 14-day watch) stay team-wide. */
  const inScope = (placementId: string | null | undefined) => !scope || (!!placementId && scope.placements.has(placementId));
  const pulses = allPulsesRows.filter(p => inScope(p.placement_id));
  const off = allOff.filter(t => inScope(t.placement_id));
  const requests = allReq.filter(r => inScope(r.placement_id));
  const flagged = pulses.filter(p => p.needs_attention);
  const waiting = off.filter(t => t.state === 'requested');
  const openRequests = requests.filter(r => r.state === 'open');

  return (
    <Shell profile={profile} active="/console/placements" title="Placements"
      crumb={mine ? 'Care, yours' : 'Care'}
      action={
        <span className="row" role="group" aria-label="Whose placements" style={{ gap: 6 }}>
          <Link className={`btn sm ${mine ? 'ghost' : 'solid'}`} href="/console/care">Everyone</Link>
          <Link className={`btn sm ${mine ? 'solid' : 'ghost'}`} href="/console/care?mine=1">Mine</Link>
        </span>
      }>
      <ConsoleTabs active="/console/care" items={[
        { href: '/console/placements', label: 'Placements' },
        { href: '/console/checkins', label: 'End of week' },
        { href: '/console/care', label: 'Care' }
      ]} />

      <div className="money-strip">
        <div className={`money-stat ${flagged.length ? 'alert' : ''}`}>
          <div className="n">{flagged.length}</div><div className="k">Check on</div>
        </div>
        <div className={`money-stat ${waiting.length ? 'alert' : ''}`}>
          <div className="n">{waiting.length}</div><div className="k">Time off</div>
        </div>
        <div className={`money-stat ${watch.length ? 'alert' : ''}`}>
          <div className="n">{watch.length}</div><div className="k">Fill by day 14</div>
        </div>
        <div className={`money-stat ${openRequests.length ? 'alert' : ''}`}>
          <div className="n">{openRequests.length}</div><div className="k">Requests</div>
        </div>
        <div className="money-stat">
          <div className="n">{due.length}</div><div className="k">6-month reviews</div>
        </div>
      </div>

      <div className="stack">
        <RequestDesk rows={requests} />

        {watch.length > 0 && (
          <div className="card">
            <div className="card-head"><h3>The 14-day promise</h3></div>
            {watch.map((w: any) => (
              <div key={w.id} className="row between" style={{ padding: '11px 0', gap: 12, flexWrap: 'wrap' }}>
                <div><b className="small">{w.org_name ?? w.client_name}</b>
                  <div className="xs muted">{w.role_title} · opened {day(w.opened_at)}</div></div>
                <span className={`pill ${w.days_open >= w.guarantee_days ? 'crit' : 'warn'}`}>
                  {w.days_open} days open
                </span>
              </div>
            ))}
          </div>
        )}

        {owed.length > 0 && (
          <div className="card">
            <div className="card-head"><h3>Replacements owed</h3></div>
            {owed.map((r: any) => (
              <div key={r.id} className="row between" style={{ padding: '11px 0', gap: 12, flexWrap: 'wrap' }}>
                <div><b className="small">{r.client_name}</b>
                  <div className="xs muted">{r.talent_name} · ended {day(r.ended_on)}</div></div>
                <span className="pill warn">
                  {r.ended_reason === 'talent_left' ? 'Talent left' : 'Not working out'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h3>Time off</h3>
            <span className="xs muted">Next 45 days</span>
          </div>
          {!off.length ? <Empty title="Nothing booked" body="No time off is booked or asked for in the next 45 days." /> : off.map(t => {
            const s = TIME_OFF_STATE.find(x => x.key === t.state);
            return (
              <div key={t.id} style={{ padding: '13px 0', borderTop: '1px solid var(--mist)' }}>
                <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <b className="small">{t.talent_name}</b>
                    <span className="xs muted"> · {t.org_name ?? t.client_name}</span>
                    <div className="xs muted">
                      {day(t.starts_on)} – {day(t.ends_on)} · {nights(t.starts_on, t.ends_on)} days
                      {t.reason ? ` · ${t.reason}` : ''}
                    </div>
                    {t.cover_note && <div className="xs muted">Cover: {t.cover_note}</div>}
                  </div>
                  <span className={`pill ${s?.tone ?? ''}`}>{s?.label}</span>
                </div>
                <TimeOffDecider id={t.id} state={t.state} talentName={t.talent_name} />
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>What the executives are saying</h3>
            <span className="xs muted">Monthly pulse</span>
          </div>
          {!pulses.length ? (
            <Empty title="Nothing filed yet"
              body="Clients see the pulse on their Placement page from the month their talent starts." />
          ) : pulses.slice(0, 20).map(p => (
            <div key={p.id} style={{ padding: '14px 0', borderTop: '1px solid var(--mist)' }}>
              <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <b className="small">{p.org_name ?? p.client_name}</b>
                  <span className="xs muted"> on {p.talent_name}</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {p.needs_attention && <span className="pill crit"><span className="dot" />Look at this</span>}
                  <span className="pill">{GOING.find(g => g.n === p.going)?.label ?? DASH}</span>
                </div>
              </div>
              <div className="xs muted" style={{ marginTop: 5 }}>
                {WORKLOADS.find(w => w.key === p.workload)?.label}
                {p.keep_going === false && ' · would not place them again'}
              </div>
              {p.standout && <p className="small" style={{ marginTop: 8 }}><b>Went well.</b> {p.standout}</p>}
              {p.friction && <p className="small" style={{ marginTop: 6 }}><b>Not working.</b> {p.friction}</p>}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-head"><h3>Six-month reviews due</h3>
            <span className="pill">Teaches the matching</span></div>
          {!due.length ? <Empty title="Nothing due" body="A review falls due six months after each placement starts." /> : due.map((d: any) => (
            <div key={d.id} style={{ padding: '14px 0', borderTop: '1px solid var(--mist)' }}>
              <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div><b className="small">{d.client_name}</b>
                  <div className="xs muted">{d.talent_name} · started {day(d.started_on)}</div></div>
                <span className="pill warn">Due {day(d.review_due_on)}</span>
              </div>
              <OutcomeForm placementId={d.id} predicted={d.predicted_fit} />
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
