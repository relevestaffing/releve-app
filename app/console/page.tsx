import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { consoleSnapshot } from '@/lib/console';
import { money } from '@/lib/money-public';
import Shell from '@/components/Shell';

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

      {/* ---------- what needs a person ---------- */}
      <div className="card" style={{ marginBottom: 26 }}>
        <div className="card-head">
          <h3>Today</h3>
          <span className={`pill ${urgent.length ? 'crit' : attention.length ? 'warn' : 'good'}`}>
            {attention.length
              ? `${attention.reduce((n, a) => n + a.count, 0)} things`
              : <><span className="dot" />All clear</>}
          </span>
        </div>

        {!attention.length ? (
          <div className="empty"><span className="tick" />
            <p className="small">
              Nothing is waiting on you. Every check-in is current, every invoice is
              settled, and nobody is stuck.
            </p>
          </div>
        ) : (
          <ul className="attention">
            {attention.map(a => (
              <li key={a.key} className={a.level}>
                <span className="att-n">{a.count}</span>
                <div className="att-body">
                  <b>{a.what}</b>
                  <span className="xs muted">{a.why}</span>
                </div>
                <Link className="btn sm ghost" href={a.href}>{a.cta}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- the numbers ---------- */}
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

      <h3 className="section-h">The pipeline</h3>
      <div className="money-strip">
        <div className="money-stat"><div className="n">{vitals.clients}</div><div className="k">Executives</div></div>
        <div className="money-stat"><div className="n">{vitals.searchesOpen}</div><div className="k">Open searches</div></div>
        <div className="money-stat"><div className="n">{vitals.shortlistsOut}</div><div className="k">Shortlists out</div></div>
        <div className="money-stat"><div className="n">{vitals.interviewsUpcoming}</div><div className="k">Interviews, 14 days</div></div>
      </div>

      <h3 className="section-h">The bench</h3>
      <div className="money-strip">
        <div className="money-stat"><div className="n">{vitals.talent}</div><div className="k">Talent</div></div>
        <div className="money-stat"><div className="n">{vitals.verified}</div><div className="k">Fully verified</div></div>
        <div className={`money-stat ${vitals.available && !vitals.verified ? 'alert' : ''}`}>
          <div className="n">{vitals.available}</div><div className="k">Available to place</div></div>
        <div className="money-stat"><div className="n">{vitals.placementsLive}</div><div className="k">In seat</div></div>
      </div>

      {/* ---------- every live placement, at a glance ---------- */}
      <div className="card" style={{ marginTop: 26 }}>
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
              <th>Executive</th><th>Talent</th><th>In seat</th>
              <th>Last check-in</th><th>Open work</th>
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
                      {!p.csm_id && <div className="xs muted">No manager assigned</div>}
                    </td>
                    <td>{p.talent_name}</td>
                    <td className="xs">{p.days} days</td>
                    <td className="xs">
                      {day(p.lastCheckin)}
                      {p.checkinFlagged && <><br /><span className="pill crit">Flagged</span></>}
                    </td>
                    <td className="xs">
                      {p.openTasks}
                      {p.overdueTasks > 0 && <span className="pill warn" style={{ marginLeft: 6 }}>
                        {p.overdueTasks} late</span>}
                    </td>
                    <td className="amount">{money(p.rate_month_cents)}</td>
                    <td>
                      <span className={`pill ${h.tone}`}><span className="dot" />{h.label}</span>
                      {p.pulseFlagged && <div className="xs muted">Executive flagged it</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!configured() && (
        <p className="small muted" style={{ marginTop: 20 }}>
          Demo mode — add your Supabase keys to <code>.env.local</code> for live data.
        </p>
      )}
    </Shell>
  );
}
