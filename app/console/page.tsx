import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { consoleSnapshot } from '@/lib/console';
import { money } from '@/lib/money-public';
import Shell from '@/components/Shell';

/* Line icons at a single 1.25px stroke, matching MobileNav/QuickBar's. Kept
   local rather than pulled into QuickBar's icon set — that one is the
   mobile tab bar; this is a different, desktop-first job. */
const QA_ICONS: Record<string, React.ReactNode> = {
  calendar: <><rect x="3" y="4.5" width="14" height="12.5" rx="1.4" /><path d="M3 8.1h14M7 3v3M13 3v3" /></>,
  send:   <path d="M17.5 2.5 2.5 9l5.7 2.3M17.5 2.5 10.8 17.5l-2.6-6.2M17.5 2.5 8.2 11.3" />,
  invoice: <path d="M3.5 16.5V9M8 16.5V4.5M12.5 16.5v-5M17 16.5V7.5" />,
  payroll: <><rect x="3" y="6" width="14" height="9" rx="1.4" /><path d="M3 9.2h14" /><circle cx="14" cy="11.6" r="1" /></>,
  match:  <><circle cx="7.6" cy="10" r="4.1" /><circle cx="12.4" cy="10" r="4.1" /></>
};
const QaIcon = ({ k }: { k: string }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {QA_ICONS[k]}
  </svg>
);

export const dynamic = 'force-dynamic';

const day = (iso: string | null) => iso
  ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US',
      { day: 'numeric', month: 'short', timeZone: 'UTC' })
  : '—';

const HEALTH: Record<string, { label: string; tone: string }> = {
  good:  { label: 'On track', tone: 'good' },
  watch: { label: 'Watch',    tone: 'warn' },
  poor:  { label: 'Needs you', tone: 'crit' }
};

/* The first screen of the business. Ordered by what decays if nobody looks:
   what needs a person today, then the money, then the pipeline, then every
   live placement with its health on one line. */
export default async function Console() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');

  const { attention, vitals, placements } = await consoleSnapshot();
  const first = (profile.full_name ?? '').trim().split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const urgent = attention.filter(a => a.level === 'high');

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console"
      title={first ? `${greeting}, ${first}` : greeting}
      crumb={new Date().toLocaleDateString('en-US',
        { weekday: 'long', day: 'numeric', month: 'long' })}>

      {/* ---------- the five things this console exists to make easy ----------
         Every manager's first question is "where do I go to do the thing",
         not "what needs attention" — that comes next, in Today. One-click
         launchers, in the order she asked for them: her calendar, matching
         and placements, client onboarding, talent onboarding, payroll, then
         invoices and money. */}
      <h3 className="section-h" style={{ marginTop: 0 }}>Dashboard</h3>
      <div className="qa-grid">
        <Link className="qa-tile" href="/console/calendar">
          <QaIcon k="calendar" />
          <div><div className="qa-t">Your calendar</div>
            <div className="qa-s">Discovery calls, interviews and everything else on hello@.</div></div>
        </Link>
        <Link className="qa-tile" href="/console/matching">
          <QaIcon k="match" />
          <div><div className="qa-t">Matching and placements</div>
            <div className="qa-s">Move a search from candidates to an offer to a seat filled.</div></div>
        </Link>
        <Link className="qa-tile" href="/console/people">
          <QaIcon k="send" />
          <div><div className="qa-t">Send client onboarding</div>
            <div className="qa-s">Discovery call done — open their search and email the deposit link.</div></div>
        </Link>
        <Link className="qa-tile" href="/console/bench">
          <QaIcon k="send" />
          <div><div className="qa-t">Send talent onboarding</div>
            <div className="qa-s">Sourced someone yourself — email their account and assessment link.</div></div>
        </Link>
        <Link className="qa-tile" href="/console/money#money-out">
          <QaIcon k="payroll" />
          <div><div className="qa-t">Run and track payroll</div>
            <div className="qa-s">Pay every live placement and keep the record of it.</div></div>
        </Link>
        <Link className="qa-tile" href="/console/money#invoices">
          <QaIcon k="invoice" />
          <div><div className="qa-t">Send invoices, see money</div>
            <div className="qa-s">Draft, send and track what every executive owes.</div></div>
        </Link>
      </div>

      {/* ---------- what needs a person ----------
         Each row used to be a short label plus a "why" hidden behind a tap
         on a question mark, so the one thing that would tell her whether to
         actually care was the one thing not on the screen. It reads as one
         sentence now — what's true, then what happens if it sits — nothing
         to open, worst first. */}
      <div className="card">
        <div className="card-head">
          <h3>Today</h3>
          {/* Counts the things that are actually urgent, not the sum of every
              queue. Summing meant a dozen routine items greeted her as
              "22 items need you" on a perfectly good morning, which teaches
              anyone to stop reading the number. */}
          <span className={`pill ${urgent.length ? 'crit' : attention.length ? 'warn' : 'good'}`}>
            {urgent.length
              ? `${urgent.length} need${urgent.length === 1 ? 's' : ''} you today`
              : attention.length
                ? `${attention.length} to pick up`
                : <><span className="dot" />All clear</>}
          </span>
        </div>

        {!attention.length ? (
          <div className="empty"><span className="tick" />
            {vitals.clients + vitals.talent === 0 ? (
              <p className="small">
                Nothing here yet because nothing has started. The order is: add an
                executive, write their brief, then build the roster. Everything else
                on this page fills itself in from there.
              </p>
            ) : (
              <p className="small">
                Nothing is waiting on you. Every check-in is current, every invoice is
                settled, and nobody is stuck.
              </p>
            )}
          </div>
        ) : (
          <ul className="attention">
            {attention.map(a => (
              <li key={a.key} className={a.level}>
                <span className="att-n">{a.count}</span>
                <div className="att-body">
                  <p className="att-line"><b>{a.what}</b> — {a.why}</p>
                </div>
                <Link className="btn sm solid" href={a.href}>{a.cta}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- the numbers, and every live placement, side by side ----------
         A stat rail next to a working table reads as an app's dashboard; the
         same content stacked full-width top to bottom reads as a web page.
         The rail collapses back above the table under 900px, where there is
         no width to spare for two columns. */}
      <div className="overview-grid">
        <div className="stack overview-stats">
          <div>
            <h3 className="section-h">The money</h3>
            <div className="money-strip">
              <div className="money-stat">
                <div className="n">{money(vitals.runRateCents)}</div>
                <div className="k">Monthly run rate</div>
              </div>
              <div className="money-stat">
                <div className="n">{money(vitals.runRateCents * 12)}</div>
                <div className="k">Annualised</div>
              </div>
              <div className="money-stat">
                <div className="n">{money(vitals.outstandingCents)}</div>
                <div className="k">Outstanding</div>
              </div>
              <div className={`money-stat ${vitals.overdueCents ? 'alert' : ''}`}>
                <div className="n">{money(vitals.overdueCents)}</div>
                <div className="k">Overdue</div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="section-h">The pipeline</h3>
            <div className="money-strip">
              <Link className="money-stat" href="/console/people"><div className="n">{vitals.clients}</div><div className="k">Executives</div></Link>
              <Link className="money-stat" href="/console/people"><div className="n">{vitals.searchesOpen}</div><div className="k">Open searches</div></Link>
              <Link className="money-stat" href="/console/matching"><div className="n">{vitals.candidatesOut}</div><div className="k">Candidates out</div></Link>
              <Link className="money-stat" href="/console/interviews"><div className="n">{vitals.interviewsUpcoming}</div><div className="k">Interviews, 14 days</div></Link>
            </div>
          </div>

          <div>
            <h3 className="section-h">The roster</h3>
            <div className="money-strip">
              <Link className="money-stat" href="/console/bench"><div className="n">{vitals.talent}</div><div className="k">Talent</div></Link>
              <Link className="money-stat" href="/console/vetting"><div className="n">{vitals.verified}</div><div className="k">Fully verified</div></Link>
              <Link className="money-stat" href="/console/bench">
                <div className="n">{vitals.available}</div><div className="k">Assessed, not placed</div></Link>
              <Link className="money-stat" href="/console/placements"><div className="n">{vitals.placementsLive}</div><div className="k">In seat</div></Link>
            </div>
          </div>
        </div>

        <div className="card overview-table">
          <div className="card-head">
            <h3>Live placements</h3>
            <Link className="btn sm ghost" href="/console/placements">All placements</Link>
          </div>

          {!placements.length ? (
            <div className="empty"><span className="tick" />
              <p className="small">
                Nobody is placed yet. When a search closes, place the pair from the
                Placements page and they will appear here with their health.
              </p>
              <Link className="btn sm solid" href="/console/placements" style={{ marginTop: 14 }}>
                Make a placement
              </Link>
            </div>
          ) : (
            <table className="data">
              <thead><tr>
                <th>Executive</th><th>Talent</th>
                <th style={{ textAlign: 'right' }}>Rate</th><th>Health</th>
              </tr></thead>
              <tbody>
                {placements.map(p => {
                  const h = HEALTH[p.health];
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/console/placements/${p.id}`}>
                          <b>{p.org_name ?? p.client_name}</b>
                        </Link>
                        {!p.csm_id && <div className="xs muted">Ready for a manager</div>}
                      </td>
                      <td>{p.talent_name}
                        <div className="xs muted">
                          {p.days} days in seat · last check-in {day(p.lastCheckin)}
                          {p.overdueTasks > 0 && ` · ${p.overdueTasks} to follow up on`}
                        </div>
                      </td>
                      <td className="amount">{money(p.rate_month_cents)}</td>
                      <td>
                        <span className={`pill ${h.tone}`}><span className="dot" />{h.label}</span>
                        {p.pulseFlagged && <div className="xs muted">Executive shared feedback</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Shell>
  );
}
