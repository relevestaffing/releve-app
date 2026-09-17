import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getMySignature, archetype, dispositionLine } from '@/lib/data';
import { execSelfLines, talentSelfLines, facetDetail } from '@/lib/plain';
import { matchConfidence } from '@/lib/signature/score';
import { L1, L2_SHOWN } from '@/lib/signature/model';
import { AxisBars, FacetBars } from '@/components/Viz';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import SignatureFlow from '@/components/SignatureFlow';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

/* Once a Signature exists, this page's job is to show it — this is where
   "what did I get, and how do I work" lives, not the profile page, and not
   a click straight into the quiz. The assessment is a deliberate, rare
   action from here on, so it sits behind one small button rather than being
   what loads by default every time someone opens this from the sidebar. */
export default async function SignaturePage({ searchParams }: {
  searchParams: Promise<{ retake?: string }>;
}) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  const side = profile.role === 'client' ? 'client' : 'talent';
  const sig = await getMySignature(profile, side);
  const { retake } = await searchParams;
  const title = side === 'client' ? 'Executive Signature' : 'Talent Signature';

  if (sig && !retake) {
    const type = archetype(sig.scores, side);
    const selfLines = side === 'client' ? execSelfLines(sig.scores) : talentSelfLines(sig.scores);
    const facets = facetDetail(side, sig.facets ?? {});
    const conf = matchConfidence({ validity: sig.validity, confidence: sig.confidence });
    const validityWord = sig.validity?.verdict === 'Valid' ? 'good' : sig.validity?.verdict === 'Review' ? 'warn' : 'crit';

    return (
      <Shell profile={profile} active="/app/signature" title={title} crumb="The Relève Signature">
        <div className="card dark">
          <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>Your Signature</div>
          <h2 style={{ fontSize: 32, color: 'var(--cream)', marginBottom: 10 }}>{type.n}</h2>
          <p style={{ fontFamily: 'Marcellus,serif', fontSize: 19, color: 'var(--pale)', marginBottom: 16 }}>{type.tag}</p>
          <p className="small" style={{ maxWidth: 640, marginBottom: 18 }}>{type.d}</p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="pill" style={{ borderColor: 'var(--pale)', color: 'var(--pale)', background: 'transparent' }}>
              {dispositionLine(sig.scores)}
            </span>
            {sig.validity && (
              <span className={`pill ${validityWord}`}>
                <span className="dot" />
                {sig.validity.verdict === 'Valid' ? 'Profile verified' : sig.validity.verdict === 'Review' ? 'Up for review' : 'Needs retaking'}
              </span>
            )}
            <span className={`pill ${conf.level === 'High' ? 'good' : conf.level === 'Moderate' ? 'warn' : 'crit'}`}>
              <span className="dot" />{conf.level} confidence
            </span>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>How you work</h3></div>
          <ul className="plain">{selfLines.map(l => <li key={l}>{l}</li>)}</ul>
          <details className="more">
            <summary>See the working-style axes</summary>
            <div className="inner">
              <div style={{ marginBottom: 18 }}>
                <Explain>
                  The six axes that shape how work actually moves between you and the person beside you.
                </Explain>
              </div>
              <AxisBars values={sig.scores} axes={L1} />
            </div>
          </details>
        </div>

        <div className="card">
          <div className="card-head"><h3>In detail</h3></div>
          <div style={{ marginBottom: 22, maxWidth: 640 }}>
            <Explain>
              Six disposition traits, three measured facets each — eighteen points of resolution,
              not six. This is the granularity every match is actually scored on{
                side === 'client' ? ', and it is the same depth your candidates are measured at.' : '.'}
            </Explain>
          </div>
          <div className="grid-2">
            {L2_SHOWN.map(trait => (
              <div key={trait.key} style={{ marginBottom: 8 }}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>{trait.name}</div>
                {trait.def_ && <p className="small muted" style={{ marginBottom: 12 }}>{trait.def_}</p>}
                <FacetBars items={facets.filter(f => f.trait === trait.key)} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h3>Where you're strongest</h3></div>
            <ul className="plain">{type.strengths?.map((s: string) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div className="card">
            <div className="card-head"><h3>Worth knowing</h3></div>
            <p className="small">{type.growth}</p>
          </div>
        </div>

        <div className="row">
          <Link className="btn sm ghost" href="/app/signature?retake=1">Retake the assessment</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell profile={profile} active="/app/signature" title={title} crumb="The Relève Signature">
      <SignatureFlow side={side} existing={!!sig} fresh={!!retake} />
    </Shell>
  );
}
