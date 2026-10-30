import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getMySignature, rankBench, archetype } from '@/lib/data';
import { L1, L2_SHOWN } from '@/lib/signature/model';
import { fitSentence, matchReasons, conditionNote } from '@/lib/plain';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import { Portrait, AxisBars } from '@/components/Viz';
import DecisionControls from '@/components/DecisionControls';
import { listDecisions } from '@/lib/work';
import RoleFit from '@/components/RoleFit';
import { getRoleBreakdown, skillsFor } from '@/lib/roles';
import { listMatches } from '@/lib/store';
import { firstName, zoneLabel, EMPTY, WORDS } from '@/lib/words';
import { requireDeposit } from '@/lib/stage';

export const metadata = { title: 'Your candidate' };

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

/* One candidate. Not a pile.
   ---------------------------
   An executive is never handed a list to sort through. Relève does the
   sifting internally and puts forward a single vetted professional, who is
   either approved or declined. If they decline, the next one comes forward.

   rankBench already returns only the people Relève has released to this
   executive. This page then narrows that to exactly one — the highest-ranked
   person they have not declined — so that even if two are released by mistake
   in the console, the executive still has one decision in front of them. */
export default async function Pipeline() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  await requireDeposit(profile);
  if (profile.role !== 'client') redirect('/app');
  const sig = await getMySignature(profile, 'client');
  if (!sig) redirect('/app/signature');

  const ranked = await rankBench(sig);
  const decisions = await listDecisions(profile.id);
  const byTalent = Object.fromEntries(decisions.map(d => [d.talent_id, d]));
  /* The note written when this person was approved for them. It is the one
     place Relève speaks in its own words about why this candidate. */
  const released = await listMatches(profile.id);
  const noteFor = Object.fromEntries(released.map(m => [m.talent_id, m.release_note ?? null]));

  /* The one in front of them right now: the best-ranked person they have not
     declined. Anyone declined drops into the history below. Anyone released
     behind that person stays out of sight until it is their turn. */
  const current = ranked.find(r => byTalent[r.person.id]?.state !== 'passed') ?? null;
  const declined = ranked.filter(r =>
    r.person.id !== current?.person.id && byTalent[r.person.id]?.state === 'passed');

  /* The other half of the match: can this person actually do the job the
     executive described? */
  const role = await getRoleBreakdown(profile.id);
  const skills = await skillsFor(current ? [current.person.id] : []);

  return (
    <Shell profile={profile} active="/app/pipeline" title="Your candidate" crumb="One person, matched to you">
      {/* The page-level explanation lives inside whichever card opens the
         page: on its own it was the first child of the body, which on a
         desktop lands on the fern hero, unreadable. */}
      {!current && (
        <div className="card">
          <div className="card-head"><h3>{declined.length ? 'We are finding the next one' : EMPTY.shortlist.title}</h3></div>
          <p className="small" style={{ marginBottom: 16 }}>
            {declined.length
              ? 'Thank you for telling us why the last one was not right. That is exactly how the next match gets sharper. Your Client Success Manager is already on it.'
              : EMPTY.shortlist.body}
          </p>
          <div style={{ marginBottom: 18 }}>
            <Explain>
              Relève interviews widely, narrows the field itself, and puts forward one
              professional, matched to the role, matched to how you work, and briefed on
              your business before you meet. You will have an email the moment there is
              someone to see.
            </Explain>
          </div>
          <a className="btn sm ghost" href={EMPTY.shortlist.cta!.href}>{EMPTY.shortlist.cta!.label}</a>
        </div>
      )}

      {current && (() => {
        const { person, match, checks } = current;
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
                  <div className="small muted">
                    {[person.role, person.yrs ? `${person.yrs} years` : null, person.loc, zoneLabel(person.tz)].filter(Boolean).join(' · ')}
                  </div>
                  {/* Nobody reaches this card unverified: the database refuses the
                      release until identity and the agreement are confirmed, and
                      a person at Relève approved them by hand. Saying so here is
                      what turns the six-front promise into something you can see. */}
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <span className="pill good"><span className="dot" />Identity verified</span>
                    <span className="pill good"><span className="dot" />Agreement signed</span>
                    <span className="pill good"><span className="dot" />Reviewed by Relève</span>
                  </div>
                </div>
              </div>
              <div className="fit-score">
                <div className="score">{match.overall}<sup>%</sup></div>
                <div className="xs muted">{match.band.k} fit</div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <Explain>
                We do not hand you a stack to sort through. Relève interviews widely, narrows
                the field itself, and puts forward one professional, matched to the role,
                matched to how you work, and briefed on your business before you meet.
                Approve them, or decline and we bring the next.
              </Explain>
            </div>

            {person.intro_video_url && (
              <div style={{ marginTop: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>{first}, in their own words</div>
                <video src={person.intro_video_url} controls playsInline preload="metadata"
                  style={{ width: '100%', maxWidth: 420, background: 'var(--ink)', display: 'block' }} />
              </div>
            )}

            {noteFor[person.id] && (
              <div className="rationale" style={{ borderLeft: '3px solid var(--fern)' }}>
                <div className="eyebrow">Why we chose {first}</div>
                <p className="verdict" style={{ marginBottom: 0 }}>{noteFor[person.id]}</p>
                <p className="xs muted rationale-foot">
                  Written by the person at Relève who approved this introduction.
                </p>
              </div>
            )}

            <div className="rationale">
              <div className="eyebrow">The Signature match</div>
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
              <summary>{WORDS.moreDetail}</summary>
              <div className="inner">
                <div className="grid-2" style={{ marginBottom: 22 }}>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 12 }}>Working style · {match.l1}/100</div>
                    <AxisBars values={person.scores} axes={L1} />
                  </div>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 12 }}>Disposition · {match.l2}/100</div>
                    <AxisBars values={person.scores} axes={L2_SHOWN} />
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
                    {/* An executive is never shown a red "Fails" about a person we
                        put in front of them: a mismatch is a point to discuss. */}
                    <span className={`pill ${c.state === 'pass' ? 'good' : 'warn'}`}>
                      <span className="dot" />{c.state === 'pass' ? 'Clear' : c.state === 'warn' ? 'Worth a word' : 'To discuss'}
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
      })()}

      {declined.length > 0 && (
        <details className="more" style={{ marginTop: 18 }}>
          <summary>Previously put forward ({declined.length})</summary>
          <div className="inner">
            <div style={{ marginBottom: 14 }}>
              <Explain>
                People you have already declined. They are never told, and never shown why.
                If you change your mind about someone, tell your manager and we will bring
                them back.
              </Explain>
            </div>
            {declined.map(({ person, match }) => (
              <div className="row between" key={person.id}
                style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', gap: 16 }}>
                <div className="row">
                  <Portrait id={person.id} name={person.name} url={person.photo_url} />
                  <div>
                    <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', fontSize: 14 }}>{person.name}</b>
                    <div className="xs muted">{person.role} · {match.overall}% fit</div>
                  </div>
                </div>
                <span className="pill">Declined</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Shell>
  );
}
