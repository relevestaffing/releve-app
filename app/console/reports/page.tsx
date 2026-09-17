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

/* Revenue concentration — the exposure the rest of the reports do not show.
   Run rate on its own hides how much of it leans on one relationship; if the
   biggest client is a third of the money, their notice is a third of the
   business gone in a month. Built from live placements and their rates, summed
   per client, so it is always consistent with the run rate above it. */
type Exposure = {
  clientsPaying: number; totalCents: number;
  topShare: number | null; top3Share: number | null; topName: string | null;
};

async function exposure(): Promise<Exposure> {
  const zero: Exposure = { clientsPaying: 0, totalCents: 0, topShare: null, top3Share: null, topName: null };
  if (!configured()) return zero;
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('client_id, client:client_id(full_name, org_name), terms:placement_terms(rate_month_cents)')
    .is('ended_on', null);

  const byClient = new Map<string, { cents: number; name: string }>();
  for (const p of (data ?? []) as any[]) {
    const cents = Array.isArray(p.terms) ? (p.terms[0]?.rate_month_cents ?? 0) : (p.terms?.rate_month_cents ?? 0);
    if (!cents) continue;
    const name = p.client?.org_name ?? p.client?.full_name ?? 'A client';
    const cur = byClient.get(p.client_id) ?? { cents: 0, name };
    cur.cents += cents; cur.name = name;
    byClient.set(p.client_id, cur);
  }

  const rows = [...byClient.values()].sort((a, b) => b.cents - a.cents);
  const total = rows.reduce((s, r) => s + r.cents, 0);
  if (!total) return { ...zero, clientsPaying: rows.length };
  return {
    clientsPaying: rows.length,
    totalCents: total,
    topShare: Math.round((rows[0].cents / total) * 100),
    top3Share: Math.round((rows.slice(0, 3).reduce((s, r) => s + r.cents, 0) / total) * 100),
    topName: rows[0].name
  };
}

export default async function Reports() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const [c, m, cal, exp] = await Promise.all([counts(), moneySummary(), calibration(), exposure()]);

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

      {/* Concentration: how exposed the run rate is to a single relationship.
          A third or more resting on one client is the line where one notice
          stops being a dip and starts being a crisis. */}
      <h3 className="section-h">Exposure</h3>
      <div className="money-strip">
        <div className="money-stat"><div className="n">{exp.clientsPaying}</div>
          <div className="k">Clients paying</div></div>
        <div className={`money-stat ${exp.topShare != null && exp.topShare >= 33 ? 'alert' : ''}`}>
          <div className="n">{exp.topShare != null ? `${exp.topShare}%` : '—'}</div>
          <div className="k">Biggest client&rsquo;s share</div></div>
        <div className={`money-stat ${exp.top3Share != null && exp.clientsPaying > 3 && exp.top3Share >= 75 ? 'alert' : ''}`}>
          <div className="n">{exp.top3Share != null ? `${exp.top3Share}%` : '—'}</div>
          <div className="k">Top three&rsquo;s share</div></div>
        <div className="money-stat"><div className="n">{retention ?? '—'}{retention != null && '%'}</div>
          <div className="k">Placements retained</div></div>
      </div>
      <div className="card tight" style={{ marginTop: -8 }}>
        <p className="small muted" style={{ margin: 0, maxWidth: 680 }}>
          {exp.clientsPaying === 0
            ? 'No paying clients yet — concentration starts mattering the moment the second one signs.'
            : exp.clientsPaying === 1
              ? <>Everything currently rests on one client{exp.topName ? <> — <b>{exp.topName}</b></> : ''}. Normal this early, and the number to watch: the second and third placements are what turn a single thread into a business.</>
              : exp.topShare != null && exp.topShare >= 33
                ? <>{exp.topName ? <><b>{exp.topName}</b> is</> : 'Your largest client is'} <b>{exp.topShare}%</b> of the run rate. That is past the line where one notice is a real hole — worth having a second search in flight before you would feel it.</>
                : <>No single client is more than a third of the run rate — the base is spread enough that one departure is a dip, not a crisis. Keep it here as you grow.</>}
        </p>
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
