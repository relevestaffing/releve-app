import { redirect } from 'next/navigation';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { moneySummary, money } from '@/lib/money';
import { calibration } from '@/lib/care';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';

export const dynamic = 'force-dynamic';

type Counts = {
  clients: number; talent: number; vetted: number;
  searchesOpen: number; searchesPlaced: number;
  placementsLive: number; placementsEnded: number;
  endedNotWorking: number; medianDaysToPlace: number | null;
  interviewsBooked: number; interviewsCompleted: number;
  checkinsFlagged: number;
};

async function counts(): Promise<Counts> {
  const zero: Counts = {
    clients: 0, talent: 0, vetted: 0, searchesOpen: 0, searchesPlaced: 0,
    placementsLive: 0, placementsEnded: 0, endedNotWorking: 0, medianDaysToPlace: null,
    interviewsBooked: 0, interviewsCompleted: 0, checkinsFlagged: 0
  };
  if (!configured()) return zero;
  const sb = await supabaseServer();
  const c = { ...zero };

  const { data: people } = await sb.from('profiles').select('id, role');
  for (const p of (people ?? []) as any[]) {
    if (p.role === 'client') c.clients++;
    if (p.role === 'talent') c.talent++;
  }

  const { data: vetted } = await sb.from('vetting')
    .select('talent_id, kind, state').eq('state', 'verified');
  const byPerson = new Map<string, Set<string>>();
  for (const v of (vetted ?? []) as any[]) {
    if (!byPerson.has(v.talent_id)) byPerson.set(v.talent_id, new Set());
    byPerson.get(v.talent_id)!.add(String(v.kind));
  }
  for (const kinds of byPerson.values())
    if (kinds.has('identity') && kinds.has('agreement')) c.vetted++;

  const { data: searches } = await sb.from('searches').select('stage');
  for (const s of (searches ?? []) as any[]) {
    if (s.stage === 'Placed') c.searchesPlaced++;
    else if (s.stage !== 'On hold') c.searchesOpen++;
  }

  const { data: places } = await sb.from('placements')
    .select('started_on, ended_on, ended_reason, client_id');
  const gaps: number[] = [];
  const { data: opened } = await sb.from('searches').select('client_id, opened_at');
  const firstOpen = new Map<string, string>();
  for (const s of (opened ?? []) as any[])
    if (!firstOpen.has(s.client_id) || s.opened_at < firstOpen.get(s.client_id)!)
      firstOpen.set(s.client_id, s.opened_at);

  for (const p of (places ?? []) as any[]) {
    if (p.ended_on) { c.placementsEnded++; if (p.ended_reason === 'not_working') c.endedNotWorking++; }
    else c.placementsLive++;
    const o = firstOpen.get(p.client_id);
    if (o) {
      const d = Math.round((Date.parse(p.started_on) - Date.parse(o)) / 86_400_000);
      if (d >= 0 && d < 400) gaps.push(d);
    }
  }
  if (gaps.length) {
    gaps.sort((a, b) => a - b);
    c.medianDaysToPlace = gaps[Math.floor(gaps.length / 2)];
  }

  const { data: ints } = await sb.from('interviews').select('status');
  for (const i of (ints ?? []) as any[]) {
    c.interviewsBooked++;
    if (i.status === 'Completed') c.interviewsCompleted++;
  }

  const { count } = await sb.from('checkins')
    .select('id', { count: 'exact', head: true }).eq('needs_attention', true);
  c.checkinsFlagged = count ?? 0;
  return c;
}

export default async function Reports() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const [c, m, cal] = await Promise.all([counts(), moneySummary(), calibration()]);

  const started = c.placementsLive + c.placementsEnded;
  const retention = started ? Math.round((c.placementsLive / started) * 100) : null;
  const gaps = cal.map((r: any) => r.gap).filter((g: any) => typeof g === 'number');
  const meanGap = gaps.length
    ? Math.round(gaps.reduce((a: number, b: number) => a + b, 0) / gaps.length)
    : null;

  return (
    <Shell profile={profile} active="/console/reports" title="Reports"
      crumb="How the business is actually doing">

      <h3 className="section-h">Money</h3>
      <div className="money-strip">
        <div className="money-stat">
          <div className="n">{money(m.monthlyRunRateCents)}</div><div className="k">Monthly run rate</div></div>
        <div className="money-stat">
          <div className="n">{money(m.monthlyRunRateCents * 12)}</div><div className="k">Annualised</div></div>
        <div className={`money-stat ${m.overdueCents ? 'alert' : ''}`}>
          <div className="n">{money(m.overdueCents)}</div><div className="k">Overdue</div></div>
        <div className="money-stat">
          <div className="n">{c.placementsLive ? money(Math.round(m.monthlyRunRateCents / c.placementsLive)) : '—'}</div>
          <div className="k">Average placement</div></div>
      </div>

      <h3 className="section-h">The pipeline</h3>
      <div className="money-strip">
        <div className="money-stat"><div className="n">{c.clients}</div><div className="k">Clients</div></div>
        <div className="money-stat"><div className="n">{c.searchesOpen}</div><div className="k">Open searches</div></div>
        <div className="money-stat">
          <div className="n">{c.medianDaysToPlace ?? '—'}</div><div className="k">Median days to place</div></div>
        <div className="money-stat">
          <div className="n">{c.interviewsBooked ? Math.round((c.interviewsCompleted / c.interviewsBooked) * 100) : 0}%</div>
          <div className="k">Interviews completed</div></div>
      </div>

      <h3 className="section-h">The roster</h3>
      <div className="money-strip">
        <div className="money-stat"><div className="n">{c.talent}</div><div className="k">Talent</div></div>
        <div className="money-stat"><div className="n">{c.vetted}</div><div className="k">Fully verified</div></div>
        <div className={`money-stat ${c.talent && c.vetted / c.talent < 0.5 ? 'alert' : ''}`}>
          <div className="n">{c.talent ? Math.round((c.vetted / c.talent) * 100) : 0}%</div>
          <div className="k">Releasable</div></div>
        <div className={`money-stat ${c.checkinsFlagged ? 'alert' : ''}`}>
          <div className="n">{c.checkinsFlagged}</div><div className="k">Check-ins to review</div></div>
      </div>

      <h3 className="section-h">Placements</h3>
      <div className="money-strip">
        <div className="money-stat"><div className="n">{c.placementsLive}</div><div className="k">Live</div></div>
        <div className="money-stat"><div className="n">{retention ?? '—'}{retention != null && '%'}</div>
          <div className="k">Still running</div></div>
        <div className={`money-stat ${c.endedNotWorking ? 'alert' : ''}`}>
          <div className="n">{c.endedNotWorking}</div><div className="k">Ended not working</div></div>
        <div className="money-stat"><div className="n">{cal.length}</div><div className="k">Reviewed at six months</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Is the assessment right?</h3>
          <span className="xs muted">Six-month calibration</span>
        </div>
        <div style={{ marginBottom: 16, maxWidth: 640 }}>
          <Explain>
            What the engine predicted, against what actually happened. If it runs
            consistently high it is promising more than it delivers; consistently
            low and you are turning down people you should be placing.
          </Explain>
        </div>
        {!cal.length ? (
          <p className="small muted">
            Nothing to compare yet. Every six-month review you record on the Care page
            adds a point here, and until there are a handful this question has no answer.
          </p>
        ) : (
          <>
            <p className="small" style={{ marginBottom: 16 }}>
              Across {cal.length} reviewed placement{cal.length === 1 ? '' : 's'}, the engine
              was on average <b>{meanGap != null && meanGap > 0 ? `${meanGap} points pessimistic` :
                meanGap != null && meanGap < 0 ? `${Math.abs(meanGap)} points optimistic` : 'exactly right'}</b>.
              {meanGap != null && meanGap < -8 &&
                ' Consistently optimistic means the matching is promising more than it delivers — worth looking at before it costs a client.'}
            </p>
            <table className="data">
              <thead><tr>
                <th>Client</th><th>Talent</th>
                <th style={{ textAlign: 'right' }}>Predicted</th>
                <th style={{ textAlign: 'right' }}>Actual</th>
                <th style={{ textAlign: 'right' }}>Out by</th>
                <th>Kept</th>
              </tr></thead>
              <tbody>
                {cal.map((r: any) => (
                  <tr key={r.id}>
                    <td className="xs">{r.client_name}</td>
                    <td className="xs">{r.talent_name}</td>
                    <td className="amount">{r.predicted_fit}</td>
                    <td className="amount">{r.outcome_score}</td>
                    <td className="amount">{r.gap > 0 ? `+${r.gap}` : r.gap}</td>
                    <td><span className={`pill ${r.retained ? 'good' : 'crit'}`}>
                      {r.retained ? 'Yes' : 'No'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Shell>
  );
}
