import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { getMySignature, rankBench, archetype } from '@/lib/data';
import { L1, L2 } from '@/lib/signature/model';
import Shell from '@/components/Shell';
import { Radar } from '@/components/Viz';
import MatchControls from '@/components/MatchControls';
import { listMatches } from '@/lib/store';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function Matching() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');
  const exec = await getMySignature(profile, 'client');
  if (!exec) redirect('/app/signature');
  const ranked = await rankBench(exec);
  const type = archetype(exec.scores, 'client');
  const clientId = 'demo-client';
  const matches = await listMatches(clientId);
  const byTalent = Object.fromEntries(matches.map(m => [m.talent_id, m]));
  const releasedCount = matches.filter(m => m.released).length;

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/matching" title="Matching Engine" crumb="Run & release"
      action={<span className="pill fern">{type.n}</span>}>
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
        </div>
      </div>
    </Shell>
  );
}
