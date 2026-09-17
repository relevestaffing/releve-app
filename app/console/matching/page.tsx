import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { signatureOf, rankBench, archetype } from '@/lib/data';
import { L1, L2 } from '@/lib/signature/model';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import { Radar } from '@/components/Viz';
import MatchControls from '@/components/MatchControls';
import { listMatches } from '@/lib/store';
import { listPeople, listDecisions, verifiedSet } from '@/lib/work';
import { getRoleBreakdown, skillsFor, fitByDiscipline, roleFitScore, roleShape } from '@/lib/roles';
import Link from 'next/link';
import ClientSwitcher from '@/components/ClientSwitcher';
import RecordAnswer from '@/components/RecordAnswer';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

/* Matching runs against a chosen executive's Signature — never against
   whoever happens to be signed in. This page used to rank the bench against
   the admin's own profile and write every release to a hardcoded
   'demo-client', which meant no real executive ever received a candidate.

   Relève presents one candidate at a time. Releasing a second person while the
   first is still undecided does not show the executive two options — their
   account only ever displays the highest-ranked person they have not declined —
   so this page warns rather than quietly queueing people behind the scenes. */
export default async function Matching({ searchParams }: {
  searchParams: Promise<{ client?: string }>;
}) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const { client } = await searchParams;
  const people = await listPeople();
  const clients = people.filter(p => p.role === 'client');
  const clientId = client || clients[0]?.id || '';
  const chosen = clients.find(c => c.id === clientId) ?? null;

  const picker = <ClientSwitcher clients={clients as any} current={clientId} />;

  if (!clients.length) return (
    <Shell profile={profile} active="/console/matching" title="Matching"
      crumb="Nobody to match yet">
      <div className="card tight">
        <p className="small">
          There are no executives on the books yet. Add one and complete their
          Executive Signature, and this page will rank the roster against them.
        </p>
        <Link className="btn sm solid" href="/console/people" style={{ marginTop: 14 }}>
          Add an executive
        </Link>
      </div>
    </Shell>
  );

  const exec = await signatureOf(clientId, 'client');

  if (!exec) return (
    <Shell profile={profile} active="/console/matching" title="Matching"
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

  /* Two different questions, both worth an answer before you release anyone:
     will they get on, and can they do the job. */
  const role = await getRoleBreakdown(clientId);
  const skills = await skillsFor(ranked.map(r => r.person.id));
  const cover = Object.fromEntries(ranked.map(r =>
    [r.person.id, roleFitScore(fitByDiscipline(role, skills[r.person.id] ?? null))]));
  const matches = await listMatches(clientId);
  const byTalent = Object.fromEntries(matches.map(m => [m.talent_id, m]));
  const decisions = await listDecisions(clientId);
  /* Both gates the database enforces at release, shown before the click:
     verified (identity + agreement) and, for anyone who has claimed a
     discipline, a cleared Taking The Watch. */
  const verified = await verifiedSet(ranked.map(r => r.person.id));
  const readiness = (p: typeof ranked[number]['person']) => {
    const notes: string[] = [];
    if (!verified.has(p.id)) notes.push('Not verified');
    if (p.has_disciplines && p.watch_cleared === false) notes.push('Watch not cleared');
    return notes;
  };
  const decided = Object.fromEntries(decisions.map(d => [d.talent_id, d]));
  const released = matches.filter(m => m.released);
  const releasedCount = released.length;

  /* Who the executive is actually looking at right now, and who is sitting
     behind them unseen. Mirrors the rule in /app/pipeline exactly. */
  const inFront = ranked.find(r =>
    byTalent[r.person.id]?.released && decided[r.person.id]?.state !== 'passed') ?? null;
  const queued = released.filter(m =>
    m.talent_id !== inFront?.person.id && decided[m.talent_id]?.state !== 'passed').length;
  const openDecision = inFront && !decided[inFront.person.id];

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/matching"
      title="Matching"
      crumb={chosen?.org_name ? `${chosen.org_name} · ${chosen.full_name}` : (chosen?.full_name ?? 'Rank and approve')}
      action={picker}>

      <div className="card tight">
        <p className="small" style={{ margin: 0 }}>
          Ranking the roster against <b>{chosen?.full_name}</b>{chosen?.org_name ? ` at ${chosen.org_name}` : ''},
          whose Signature reads as <b>{type.n}</b>. Release <b>one person at a time</b> —
          their account shows a single candidate to approve or decline, and anyone
          released behind that person stays invisible until it is their turn.
          {role
            ? <> The role is <b>{roleShape(role)}</b>, and the Role column scores each
                 candidate against exactly what they asked for.</>
            : <> <b>They have not broken the role down yet</b>, so the Role column
                 is empty — fit here is personality only, not capability.</>}
        </p>
      </div>

      {queued > 0 && (
        <div className="card tight" style={{ borderLeft: '3px solid var(--warn, #B4762E)' }}>
          <p className="small" style={{ margin: 0 }}>
            <b>{queued} extra {queued === 1 ? 'person is' : 'people are'} released but not visible.</b>{' '}
            {inFront ? <>{inFront.person.name} is the candidate {chosen?.full_name ?? 'this executive'} currently
            sees. </> : null}
            Nobody behind them appears until that decision is made. Pull the extras back
            unless you meant to queue them.
          </p>
        </div>
      )}

      {inFront && decided[inFront.person.id]?.state === 'shortlisted' && (
        <div className="card tight" style={{ borderLeft: '3px solid var(--fern)' }}>
          <p className="small" style={{ margin: 0 }}>
            <b>{inFront.person.name} was approved.</b> Book the introduction from
            Interviews — no further releases are needed for this search.
          </p>
        </div>
      )}

      {releasedCount > 0 && !inFront && (
        <div className="card tight" style={{ borderLeft: '3px solid var(--warn, #B4762E)' }}>
          <p className="small" style={{ margin: 0 }}>
            <b>Everyone released has been declined.</b> {chosen?.full_name ?? 'This executive'} has
            nothing in front of them right now — release the next candidate.
          </p>
        </div>
      )}

      {openDecision && queued === 0 && (
        <div className="card tight">
          <p className="small muted" style={{ margin: 0 }}>
            {inFront!.person.name} is with {chosen?.full_name ?? 'the executive'} and awaiting a
            yes or no. Hold the next release until they answer.
          </p>
        </div>
      )}

      <div className="match-layout">
        <div className="card">
          <div className="card-head"><h3>The executive</h3></div>
          <Radar series={[{ name: 'Executive', color: '#35443A', values: exec.scores, op: .2 }]} axes={L1} size={250} />
          <div className="hr" style={{ margin: '18px 0' }} />
          <div className="eyebrow" style={{ marginBottom: 10 }}>Disposition</div>
          <Radar series={[{ name: 'Executive', color: '#35443A', values: exec.scores, op: .2 }]} axes={L2} size={250} note={false} />
        </div>
        <div className="card">
          <div className="card-head"><h3>Ranked roster</h3>
            <div className="row" style={{ gap: 8 }}><span className="pill">{ranked.length} available</span>
              <span className="pill good"><span className="dot" />{releasedCount} approved &amp; sent</span></div></div>
          <div style={{ margin: '0 0 14px' }}>
            <Explain>
              Matching someone here changes nothing they can see. Nobody is sent until you
              approve it by name in the panel, and the executive is emailed the moment you do.
            </Explain>
          </div>
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Talent</th><th>Fit</th><th>Role</th><th>Ready</th><th>Style / Disp.</th><th>Confidence</th><th>Weakest axis</th><th>Status</th><th style={{textAlign:'right'}}>Match control</th></tr></thead>
            <tbody>
              {ranked.map(({ person, match, checks }) => {
                const worst = [...match.parts].sort((a, b) => a.score - b.score)[0];
                const gaps = checks.filter(c => c.state !== 'pass').length;
                const notReady = readiness(person);
                return (
                  <tr key={person.id}>
                    <td><Link href={`/console/talent/${person.id}`}><b>{person.name}</b></Link><div className="small muted">{person.role}</div></td>
                    <td><div className="row" style={{ gap: 10 }}><span className="num">{match.overall}%</span>
                      <div className="bar-mini" style={{ width: 60 }}><span style={{ width: `${match.overall}%` }} /></div></div></td>
                    <td>{cover[person.id] == null
                      ? <span className="xs muted">—</span>
                      : <span className={`pill ${cover[person.id]! >= 80 ? 'good' : cover[person.id]! >= 60 ? 'warn' : 'crit'}`}>
                          {cover[person.id]}%
                        </span>}</td>
                    <td>{notReady.length
                      ? notReady.map(n => <span key={n} className="pill warn" style={{ marginRight: 4 }}>{n}</span>)
                      : <span className="pill good"><span className="dot" />Ready</span>}</td>
                    <td className="small muted">{match.l1} / {match.l2}</td>
                    <td><span className={`pill ${match.confidence.level === 'High' ? 'good' : match.confidence.level === 'Moderate' ? '' : 'warn'}`}>{match.confidence.level}</span></td>
                    <td className="small muted">{worst.axis.name} · {worst.score}</td>
                    <td>{(() => { const m = byTalent[person.id]; const d = decided[person.id];
                      if (!m) return <span className="xs muted">Not matched</span>;
                      if (!m.released) return <span className="pill warn"><span className="dot" />Matched</span>;
                      if (d?.state === 'passed') return <span className="pill crit"><span className="dot" />Declined</span>;
                      if (d?.state === 'shortlisted' || d?.state === 'hired')
                        return <span className="pill good"><span className="dot" />Approved</span>;
                      return person.id === inFront?.person.id
                        ? <>
                            <span className="pill good"><span className="dot" />With them now</span>
                            <RecordAnswer clientId={clientId} clientName={chosen?.full_name ?? 'the executive'}
                              talentId={person.id} talentName={person.name} />
                          </>
                        : <span className="pill warn"><span className="dot" />Approved — queued</span>; })()}
                      {(() => { const d = decided[person.id];
                        if (!d || (!d.reason && !d.note)) return null;
                        return <div className="xs muted" style={{ marginTop: 4, maxWidth: 220 }}>
                          &ldquo;{d.reason ?? ''}{d.reason && d.note ? ' — ' : ''}{d.note ?? ''}&rdquo;
                        </div>; })()}
                      {gaps ? <div className="xs muted" style={{ marginTop: 4 }}>{gaps} condition gap{gaps > 1 ? 's' : ''}</div> : null}</td>
                    <td><MatchControls clientId={clientId} talentId={person.id}
                      talentName={person.name} clientName={chosen?.full_name ?? 'this executive'}
                      matched={!!byTalent[person.id]} released={!!byTalent[person.id]?.released}
                      manual={!!byTalent[person.id]?.manual}
                      blocked={notReady.length ? `${notReady.join(' · ')} — this person cannot be sent to an executive yet.` : null}
                      note={byTalent[person.id]?.release_note ?? null} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!ranked.length && (
            <div className="empty"><span className="tick" />
              <p className="small">
                No talent available to rank. Everyone on the roster is either placed
                already or has not completed their Talent Signature.
              </p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
