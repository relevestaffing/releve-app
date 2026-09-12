import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSelfProfile, getSearch } from '@/lib/store';
import { getMySignature, archetype } from '@/lib/data';
import { execSelfLines, talentSummary, facetDetail, L1, L2 } from '@/lib/plain';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import NextStep from '@/components/NextStep';
import { setupFor } from '@/lib/setup';
import ExecProfileEditor from '@/components/ExecProfileEditor';
import { AxisBars, Portrait } from '@/components/Viz';
import { executiveStage } from '@/lib/stage';
import { WORDS } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function ExecProfile() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'client') redirect('/app');
  const self = await getSelfProfile(profile.id);
  const initial = {
    full_name: profile.full_name, headline: profile.headline, org_name: profile.org_name, ...self
  };

  const stage = await executiveStage(profile.id);
  const brief = stage.hiring ? await getSearch(profile.id) : null;

  /* This used to be the whole reason /app/profile existed — "the archetype,
     the working-style signature" — but the move that promised it never
     actually landed the content, so an executive who spent twelve minutes
     on the Executive Signature had nowhere in the app to ever see the
     result again. */
  const sig = await getMySignature(profile, 'client');
  const type = sig ? archetype(sig.scores, 'client') : null;
  const hasFacets = !!(sig && Object.keys(sig.facets ?? {}).length > 0);

  return (
    <Shell profile={profile} active="/app/profile" title="Your profile" crumb="What a candidate sees before meeting you">
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 16 }}>How this reads to a candidate</div>
        <div className="row" style={{ gap: 18 }}>
          <Portrait id={profile.id} name={initial.full_name ?? ''} cls="lg" url={initial.photo_url} />
          <div>
            <h2 style={{ fontSize: 24, color: 'var(--cream)', marginBottom: 6 }}>{initial.full_name || 'Your name'}</h2>
            <p style={{ fontFamily: 'Marcellus,serif', fontSize: 16, color: 'var(--pale)' }}>
              {[initial.headline, initial.org_name].filter(Boolean).join(' · ') || 'Your title and company'}
            </p>
          </div>
        </div>
        {initial.bio && <p className="small" style={{ maxWidth: 620, marginTop: 18 }}>{initial.bio}</p>}
      </div>

      {/* This card owns the edit form now — it opens read-only, the same way
         everything else on this page reads, and a button switches it into
         the three-card form. A page that looks editable everywhere you look
         reads as unfinished; a page with one clearly-marked way in doesn't. */}
      <ExecProfileEditor initial={initial} />
      <NextStep steps={await setupFor(profile)} current="intro" />

      {!sig ? (
        <div className="card empty-card">
          <div className="empty-mark" aria-hidden="true" />
          <h3>Your profile starts with your {WORDS.execSignature}</h3>
          <p className="small">
            Every candidate is scored against it — it is how we tell who will actually
            suit you, not just who is available. Takes about twelve to sixteen minutes.
          </p>
          <a className="btn solid" href="/app/signature" style={{ marginTop: 20 }}>
            Take the {WORDS.execSignature}
          </a>
        </div>
      ) : type && (
        <>
          <div className="card dark">
            <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>Your {WORDS.execSignature}</div>
            <h2 style={{ fontSize: 32, color: 'var(--cream)', marginBottom: 10 }}>{type.n}</h2>
            <p style={{ fontFamily: 'Marcellus,serif', fontSize: 19, color: 'var(--pale)', marginBottom: 16 }}>{type.tag}</p>
            <p className="small" style={{ maxWidth: 640 }}>{type.d}</p>
          </div>

          <div className="card">
            <div className="card-head"><h3>What stands out</h3></div>
            <p className="small muted" style={{ marginBottom: 18 }}>{talentSummary(sig.scores, type.n)}</p>
            <ul className="plain">{execSelfLines(sig.scores).map(l => <li key={l}>{l}</li>)}</ul>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h3>What to look for</h3></div>
              <p className="small">{type.seek}</p>
            </div>
            <div className="card">
              <div className="card-head"><h3>What to watch for</h3></div>
              <p className="small">{type.friction}</p>
              <div style={{ marginTop: 14 }}>
                <Explain>
                  Not a flaw — it is what your Client Success Manager weighs when deciding who to put in front of you.
                </Explain>
              </div>
            </div>
          </div>

          {type.strengths?.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>{type.n}, at your best</h3></div>
              <ul className="plain">{type.strengths.map((s: string) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {type.growth && (
            <div className="card">
              <div className="card-head"><h3>Where to grow</h3></div>
              <p className="small">{type.growth}</p>
            </div>
          )}

          <div className="card">
            <div className="card-head"><h3>Your results in full</h3><span className="pill">See the full assessment</span></div>
            <p className="small muted">Most people never need this. It is here because it is your data.</p>
            <details className="more">
              <summary>See every score</summary>
              <div className="inner">
                <div className="grid-2" style={{ marginBottom: 22 }}>
                  <div><div className="eyebrow" style={{ marginBottom: 12 }}>Working style</div>
                    <AxisBars values={sig.scores} axes={L1} /></div>
                  <div><div className="eyebrow" style={{ marginBottom: 12 }}>Disposition</div>
                    <AxisBars values={sig.scores} axes={L2} /></div>
                </div>
                {hasFacets && (
                  <>
                    <div className="eyebrow" style={{ marginBottom: 12 }}>In detail</div>
                    <div className="grid-2">
                      {L2.map(t => (
                        <div key={t.key} style={{ marginBottom: 18 }}>
                          <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', fontSize: 15 }}>{t.name}</b>
                          {facetDetail('client', sig.facets).filter(f => f.trait === t.key).map(f => (
                            <div className="row between" key={f.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', gap: 14 }}>
                              <span className="small">{f.name}</span>
                              <div className="row" style={{ gap: 10 }}>
                                <div className="bar-mini" style={{ width: 56 }}><span style={{ width: `${f.value}%` }} /></div>
                                <span className="small" style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', width: 26, textAlign: 'right' }}>{f.value}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="row" style={{ marginTop: 20 }}>
                  <a className="btn sm ghost" href="/app/signature">Retake the assessment</a>
                </div>
              </div>
            </details>
          </div>
        </>
      )}

      {brief?.role_title && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>The role we are filling</h3>
              <div className="small muted" style={{ marginTop: 4 }}>As we captured it. Tell your Client Success Manager if any of it has changed.</div>
            </div>
            {brief.stage && <span className="pill">{brief.stage}</span>}
          </div>
          <p style={{ fontFamily: 'Marcellus,serif', fontSize: 21, color: 'var(--fern)', marginBottom: 14 }}>{brief.role_title}</p>
          <dl className="brief-facts">
            {brief.scope && <><dt>Owns</dt><dd>{brief.scope}</dd></>}
            {brief.hours && <><dt>Hours</dt><dd>{brief.hours}</dd></>}
            {brief.tools && <><dt>Tools</dt><dd>{brief.tools}</dd></>}
            {brief.target_at && <><dt>Start</dt><dd>{brief.target_at}</dd></>}
          </dl>
        </div>
      )}
    </Shell>
  );
}
