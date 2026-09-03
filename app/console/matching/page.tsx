import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { signatureOf, rankBench, archetype } from '@/lib/data';
import { L1, L2 } from '@/lib/signature/model';
import Shell from '@/components/Shell';
import { Radar } from '@/components/Viz';
import MatchControls from '@/components/MatchControls';
import { listMatches } from '@/lib/store';
import { listPeople } from '@/lib/work';
import Link from 'next/link';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

/* Matching runs against a chosen executive's Signature — never against
   whoever happens to be signed in. This page used to rank the bench against
   the admin's own profile and write every release to a hardcoded
   'demo-client', which meant no real executive ever received a shortlist. */
export default async function Matching({ searchParams }: {
  searchParams: Promise<{ client?: string }>;
}) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');

  const { client } = await searchParams;
  const people = await listPeople();
  const clients = people.filter(p => p.role === 'client');
  const clientId = client || clients[0]?.id || '';
  const chosen = clients.find(c => c.id === clientId) ?? null;

  const picker = (
    <form className="client-picker" action="/console/matching" method="get">
      <select name="client" defaultValue={clientId}>
        {clients.map(c => (
          <option key={c.id} value={c.id}>
            {c.org_name ? `${c.org_name} — ${c.full_name}` : c.full_name}
          </option>
        ))}
      </select>
      <button className="btn sm ghost" type="submit">Switch</button>
    </form>
  );

  if (!clients.length) return (
    <Shell profile={profile} active="/console/matching" title="Matching Engine"
      crumb="Nobody to match yet">
      <div className="card tight">
        <p className="small">
          There are no executives on the books yet. Add one and complete their
          Executive Signature, and this page will rank the bench against them.
        </p>
        <Link className="btn sm solid" href="/console/people" style={{ marginTop: 14 }}>
          Add an executive
        </Link>
      </div>
    </Shell>
  );

  const exec = await signatureOf(clientId, 'client');

  if (!exec) return (
    <Shell profile={profile} active="/console/matching" title="Matching Engine"
      crumb={chosen?.org_name ?? chosen?.full_name ?? 'Choose an executive'}
      action={picker}>
      <div className="card tight">
        <p className="small">
          <b>{chosen?.full_name ?? 'This executive'} has not completed their
          Executive Signature yet.</b> Nothing can be ranked against them until
          they do — the whole match is built on it.
        </p>
        <p className="small muted" style={{ marginTop: 10 }}>
          They complete it from their own account. Nudge them from Messages if
          it has been a while.
        </p>
      </div>
    </Shell>
  );

  const ranked = await rankBench(exec);
  const type = archetype(exec.scores, 'client');
  const matches = await listMatches(clientId);
  const byTalent = Object.fromEntries(matches.map(m => [m.talent_id, m]));
  const releasedCount = matches.filter(m => m.released).length;

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/matching"
      title="Matching Engine"
      crumb={chosen?.org_name ? `${chosen.org_name} · ${chosen.full_name}` : (chosen?.full_name ?? 'Run & release')}
      action={picker}>

      <div className="card tight" style={{ marginBottom: 20 }}>
        <p className="small" style={{ margin: 0 }}>
          Ranking the bench against <b>{chosen?.full_name}</b>{chosen?.org_name ? ` at ${chosen.org_name}` : ''},
          whose Signature reads as <b>{type.n}</b>. Only the people you
          <b> release</b> appear in their account — nothing else is visible to them.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 22, alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>The executive</h3></div>
          <Radar series={[{ name: 'Executive', color: '#35443A', values: exec.scores, op: .2 }]} axes={L1} size={250} />
          <div className="hr" style={{ margin: '18px 0' }} />
          <div className="eyebrow" style={{ marginBottom: 10 }}>Disposition</div>
          <Radar series={[{ name: 'Executive', color: '#35443A', values: exec.scores, op: .2 }]} axes={L2} size={250} note={false} />
        </div>
        <div className="card">
          <div className="card-head"><h3>Ranked bench</h3>
            <div className="row" style={{ gap: 8 }}><span className="pill">{ranked.length} available</span>
              <span className="pill good"><span className="dot" />{releasedCount} released</span></div></div>
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Talent</th><th>Fit</th><th>Style / Disp.</th><th>Confidence</th><th>Weakest axis</th><th>Status</th><th style={{textAlign:'right'}}>Match control</th></tr></thead>
            <tbody>
              {ranked.map(({ person, match, checks }) => {
                const worst = [...match.parts].sort((a, b) => a.score - b.score)[0];
                const gaps = checks.filter(c => c.state !== 'pass').length;
                return (
                  <tr key={person.id}>
                    <td><b>{person.name}</b><div className="small muted">{person.role}</div></td>
                    <td><div className="row" style={{ gap: 10 }}><span className="num">{match.overall}%</span>
                      <div className="bar-mini" style={{ width: 60 }}><span style={{ width: `${match.overall}%` }} /></div></div></td>
                    <td className="small muted">{match.l1} / {match.l2}</td>
                    <td><span className={`pill ${match.confidence.level === 'High' ? 'good' : match.confidence.level === 'Moderate' ? '' : 'warn'}`}>{match.confidence.level}</span></td>
                    <td className="small muted">{worst.axis.name} · {worst.score}</td>
                    <td>{(() => { const m = byTalent[person.id];
                      return !m ? <span className="xs muted">Not matched</span>
                        : m.released ? <span className="pill good"><span className="dot" />Released</span>
                        : <span className="pill warn"><span className="dot" />Matched</span>; })()}
                      {gaps ? <div className="xs muted" style={{ marginTop: 4 }}>{gaps} condition gap{gaps > 1 ? 's' : ''}</div> : null}</td>
                    <td><MatchControls clientId={clientId} talentId={person.id}
                      matched={!!byTalent[person.id]} released={!!byTalent[person.id]?.released}
                      manual={!!byTalent[person.id]?.manual} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!ranked.length && (
            <div className="empty"><span className="tick" />
              <p className="small">
                No talent available to rank. Everyone on the bench is either placed
                already or has not completed their Talent Signature.
              </p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
