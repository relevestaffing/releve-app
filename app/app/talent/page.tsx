import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getMySignature, archetype } from '@/lib/data';
import { getSelfProfile } from '@/lib/store';
import { L1, L2, facetsOf } from '@/lib/signature/model';
import { talentSelfLines, talentSummary } from '@/lib/plain';
import Shell from '@/components/Shell';
import { AxisBars, Portrait } from '@/components/Viz';
import { WORDS } from '@/lib/words';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function TalentProfile() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  const sig = await getMySignature(profile, 'talent');
  /* Sending someone into a twenty-minute assessment without warning is not a
     redirect, it is an ambush. Say why, and let them choose the moment. */
  if (!sig) return (
    <Shell profile={profile} active="/app/talent" title="Your profile"
      crumb="One thing first">
      <div className="card empty-card">
        <div className="empty-mark" aria-hidden="true" />
        <h3>Your profile starts with your {WORDS.signature}</h3>
        <p className="small">
          Everything executives see about you is built on it — how you work, what you
          are like to work with, and which roles will suit you. It takes about twenty
          minutes and you can stop and come back at any point.
        </p>
        <a className="btn solid" href="/app/signature" style={{ marginTop: 20 }}>
          Take the {WORDS.talentSignature}
        </a>
      </div>
    </Shell>
  );
  const type = archetype(sig.scores, 'talent');
  const hasFacets = Object.keys(sig.facets ?? {}).length > 0;
  const self = await getSelfProfile(profile.id);
  const skills: string[] = self.skills ?? [];

  return (
    <Shell profile={profile} active="/app/talent" title="Your profile" crumb="What executives are told about you">

      {/* what they wrote themselves, exactly as an executive sees it */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3>What you wrote</h3>
            <div className="small muted" style={{ marginTop: 4 }}>An executive reads this before anything else.</div>
          </div>
          <Link className="btn sm ghost" href="/app/talent/edit">Edit</Link>
        </div>
        <div className="row" style={{ marginBottom: self.bio || skills.length ? 18 : 0 }}>
          <Portrait id={profile.id} name={self.full_name ?? profile.full_name ?? ''} cls="lg" url={self.photo_url} />
          <div>
            <h4 style={{ fontSize: 20 }}>{self.full_name ?? profile.full_name}</h4>
            <div className="small muted">
              {[self.headline, self.years_exp ? `${self.years_exp} years` : null, self.location, self.english]
                .filter(Boolean).join(' · ') || 'Nothing filled in yet'}
            </div>
          </div>
        </div>
        {self.bio
          ? <p className="small" style={{ maxWidth: 640 }}>{self.bio}</p>
          : <p className="small muted">You have not written an introduction yet — it is the part executives read first.</p>}
        {skills.length > 0 && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
            {skills.map(s => <span className="pill" key={s}>{s}</span>)}
          </div>
        )}
      </div>

      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>Your profile</div>
        <h2 style={{ fontSize: 32, color: 'var(--cream)', marginBottom: 10 }}>{type.n}</h2>
        <p style={{ fontFamily: 'Marcellus,serif', fontSize: 19, color: 'var(--pale)', marginBottom: 16 }}>{type.tag}</p>
        <p className="small" style={{ maxWidth: 640 }}>{type.d}</p>
      </div>

      <div className="card">
        <div className="card-head"><h3>What stands out</h3></div>
        <p className="small muted" style={{ marginBottom: 18 }}>{talentSummary(sig.scores, type.n)}</p>
        <ul className="plain">{talentSelfLines(sig.scores).map(l => <li key={l}>{l}</li>)}</ul>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Where you thrive</h3></div>
          <p className="small">{type.seek}</p>
        </div>
        <div className="card">
          <div className="card-head"><h3>What to watch for</h3></div>
          <p className="small">{type.friction}</p>
          <p className="xs muted" style={{ marginTop: 14 }}>
            This is not a criticism. It is what we tell an executive so they work with you well from day one.
          </p>
        </div>
      </div>

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
                      {facetsOf(t.key).map(f => (
                        <div className="row between" key={f.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', gap: 14 }}>
                          <span className="small">{f.name}</span>
                          <div className="row" style={{ gap: 10 }}>
                            <div className="bar-mini" style={{ width: 56 }}><span style={{ width: `${sig.facets[f.key]}%` }} /></div>
                            <span className="small" style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', width: 26, textAlign: 'right' }}>{sig.facets[f.key]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </details>
      </div>
    </Shell>
  );
}
