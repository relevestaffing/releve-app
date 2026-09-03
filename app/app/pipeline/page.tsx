import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getMySignature, rankBench, archetype } from '@/lib/data';
import { L1, L2 } from '@/lib/signature/model';
import { fitSentence, matchReasons, conditionNote } from '@/lib/plain';
import Shell from '@/components/Shell';
import { Portrait, AxisBars } from '@/components/Viz';
import DecisionControls from '@/components/DecisionControls';
import { listDecisions } from '@/lib/work';
import RoleFit from '@/components/RoleFit';
import { getRoleBreakdown, skillsFor } from '@/lib/roles';
import { firstName } from '@/lib/words';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function Pipeline() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'client') redirect('/app');
  const sig = await getMySignature(profile, 'client');
  if (!sig) redirect('/app/signature');
  /* rankBench reads talent_directory, which now runs under row level
     security rather than around it — so for an executive this returns
     exactly the people Relève has released to them, and nobody else. */
  const ranked = await rankBench(sig);
  const decisions = await listDecisions(profile.id);
  /* The other half of the match: can this person actually do the job the
     executive described? */
  const role = await getRoleBreakdown(profile.id);
  const skills = await skillsFor(ranked.map(r => r.person.id));
  const byTalent = Object.fromEntries(decisions.map(d => [d.talent_id, d]));

  return (
    <Shell profile={profile} active="/app/pipeline" title="Your matches" crumb="Chosen for how you work">
      <p className="small muted" style={{ maxWidth: 620 }}>
        Everyone here was chosen for you by hand, then ranked against your Signature.
        Say who you would like to meet and we will arrange it. If someone is not right,
        say so — knowing why is how the next shortlist gets better.
      </p>

      {ranked.length === 0 && (
        <div className="card">
          <div className="card-head"><h3>Your shortlist is being built</h3></div>
          <p className="small" style={{ marginBottom: 16 }}>
            Nobody has been put forward yet. This is deliberate — we do not send you a
            directory to search through. Your Client Success Manager reviews the bench
            against your Signature and puts forward only the people worth your time.
          </p>
          <p className="small muted" style={{ marginBottom: 18 }}>
            Our promise is a qualified candidate within fourteen days of your search
            opening. You will have an email the moment there is someone to see.
          </p>
          <a className="btn sm ghost" href="/app/messages">Ask your manager where things stand</a>
        </div>
      )}

      {ranked.map(({ person, match, checks }) => {
        const first = firstName(person.name);
        const why = matchReasons(match, first);
        const gaps = checks.filter(c => c.state !== 'pass');
        return (
          <div className="card" key={person.id}>
            <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 18 }}>
              <div className="row">
                <Portrait id={person.id} name={person.name} cls="lg" url={person.photo_url} />
                <div>
                  <h3>{person.name}</h3>
                  <div className="small muted">{person.role} · {person.yrs} years · {person.loc} ({person.tz})</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="score">{match.overall}<sup>%</sup></div>
                <div className="xs muted">{match.band.k} fit</div>
              </div>
            </div>

            <div className="rationale">
              <div className="eyebrow">The Signature Match</div>
              <p className="verdict">{fitSentence(match, first)}</p>

              {why.strong.length > 0 && (
                <>
                  <div className="rationale-h">Where you line up</div>
                  <ul className="plain">
                    {why.strong.map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                </>
              )}

              {(why.watch || gaps.length > 0) && (
                <>
                  <div className="rationale-h">Worth knowing before you meet</div>
                  <ul className="plain">
                    {why.watch && <li>{why.watch}</li>}
                    {gaps.length > 0 && <li>{conditionNote(gaps[0], first)}</li>}
                  </ul>
                </>
              )}

              <p className="xs muted rationale-foot">
                Scored against your own Signature, then read and approved by a
                person at Relève before it reached you. We put nobody forward
                on a number alone.
              </p>
            </div>

            <RoleFit role={role} skills={skills[person.id] ?? null} name={person.name} />

            <details className="more">
              <summary>See the full assessment</summary>
              <div className="inner">
                <div className="grid-2" style={{ marginBottom: 22 }}>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 12 }}>Working style — {match.l1}/100</div>
                    <AxisBars values={person.scores} axes={L1} />
                  </div>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 12 }}>Disposition — {match.l2}/100</div>
                    <AxisBars values={person.scores} axes={L2} />
                  </div>
                </div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Axis by axis</div>
                {[...match.parts].sort((a, b) => a.score - b.score).map(p => (
                  <div className="axis-row" key={p.axis.key}>
                    <div className="row between" style={{ marginBottom: 9 }}>
                      <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 11.5 }}>{p.axis.name}</b>
                      <span className="xs muted">{p.score}/100</span>
                    </div>
                    <div className="axis-track">
                      <span className="axis-fill" style={{ width: `${p.talent}%`, background: 'var(--pale)' }} />
                      <span className="axis-marker" style={{ left: `calc(${p.client}% - 1.5px)`, background: 'var(--fern)' }} />
                    </div>
                    <div className="axis-caption">{p.note}</div>
                  </div>
                ))}
                <div className="eyebrow" style={{ margin: '22px 0 12px' }}>Practical conditions</div>
                {checks.map(c => (
                  <div className="row between" key={c.label} style={{ padding: '11px 0', borderBottom: '1px solid var(--line)', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', fontSize: 14 }}>{c.label}</b>
                      <div className="xs muted">{c.note}</div>
                    </div>
                    <span className={`pill ${c.state === 'pass' ? 'good' : c.state === 'warn' ? 'warn' : 'crit'}`}>
                      <span className="dot" />{c.state === 'pass' ? 'Clear' : c.state === 'warn' ? 'Gap' : 'Fails'}
                    </span>
                  </div>
                ))}
                <p className="xs muted" style={{ marginTop: 16 }}>
                  Profile {match.confidence.level.toLowerCase()} confidence · {archetype(person.scores, 'talent').n}
                </p>
              </div>
            </details>

            <div className="decide-bar">
              <DecisionControls talentId={person.id} name={first} decision={byTalent[person.id] ?? null} />
            </div>
          </div>
        );
      })}
    </Shell>
  );
}
