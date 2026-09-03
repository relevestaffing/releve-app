import Link from 'next/link';
import { redirect } from 'next/navigation';
import { configured, currentProfile } from '@/lib/supabase/server';
import { getMySignature, rankBench, archetype } from '@/lib/data';
import { getAvailability, getSelfProfile, getCalendar, getSearch } from '@/lib/store';
import { talentSteps, clientSteps, progress } from '@/lib/onboarding';
import Checklist from '@/components/Checklist';
import { listVetting } from '@/lib/work';
import { getRoleBreakdown, getSkills, AREAS } from '@/lib/roles';
import { L1, L2 } from '@/lib/signature/model';
import { execSelfLines, talentSelfLines, fitSentence, matchHeadline } from '@/lib/plain';
import Shell from '@/components/Shell';
import OfferCard from '@/components/OfferCard';
import { myOffer } from '@/lib/offer';
import { AxisBars, Portrait } from '@/components/Viz';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function AppHome() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');

  const side = profile.role === 'client' ? 'client' : 'talent';
  const self = await getSelfProfile(profile.id);

  /* first visit: say hello properly before asking for twenty minutes */
  if (!self.onboarded_at) redirect('/app/welcome');

  /* One place, so no screen ever renders "Welcome, and welcome" for an account
     that signed itself up and has not given a name yet. */
  const firstName = (profile.full_name ?? '').trim().split(' ')[0] || '';

  /* An offer outranks everything else on this page the day it lands. */
  const offer = await myOffer(profile.id, side);

  const sig = await getMySignature(profile, side);
  const brief = side === 'client' ? await getSearch(profile.id) : null;
  const avail = await getAvailability(profile.id, '');
  const vetting = side === 'talent' ? await listVetting(profile.id) : [];
  const role   = side === 'client' ? await getRoleBreakdown(profile.id) : null;
  const skills = side === 'talent' ? await getSkills(profile.id) : null;
  /* Half-answered is not answered: the questionnaire only earns its keep once
     every area has a view on it. */
  const hasRole   = !!role   && AREAS.every(a => role.ownership?.[a.key]);
  const hasSkills = !!skills && AREAS.every(a => skills.level?.[a.key]);
  const hasAvailability = !!avail.timezone && (avail.windows?.length ?? 0) > 0;
  const steps = side === 'client'
    ? clientSteps({ hasSignature: !!sig, hasAvailability, hasIntro: !!(self.bio && self.photo_url), hasRole })
    : talentSteps({
        hasSignature: !!sig, hasAvailability, hasSkills,
        hasProfile: !!(self.bio && (self.skills?.length ?? 0) > 0),
        hasPhoto: !!self.photo_url,
        vettingDone: vetting.filter(v => v.state === 'verified').length,
        vettingTotal: 2
      });
  const setup = progress(steps);

  if (!sig) return (
    <Shell profile={profile} active="/app"
      title={firstName ? `Welcome, ${firstName}` : 'Welcome to Relève'}
      crumb="Getting set up">
      <Checklist steps={steps} heading="A few things and you are done" />
      <div className="card tight">
        <p className="small muted">
          {side === 'client'
            ? 'Nothing is shown to you until your Signature exists — every candidate is scored against it first. Your Client Success Manager will be in touch either way.'
            : 'Nothing is matched until your Signature exists. Once these are done, we do the work — your Talent Success Manager will come to you when a role fits.'}
        </p>
      </div>
    </Shell>
  );

  const type = archetype(sig.scores, side);
  const ranked = side === 'client' ? await rankBench(sig) : [];
  const selfLines = side === 'client' ? execSelfLines(sig.scores) : talentSelfLines(sig.scores);

  return (
    <Shell profile={profile} active="/app"
      title={firstName ? `Good to see you, ${firstName}` : 'Your account'}
      crumb={side === 'client'
        ? (profile.org_name ?? 'Executive')
        : (self.headline ?? 'Talent')}>

      {offer && <OfferCard offer={offer} side={side} />}

      {/* who you are, in words */}
      {!setup.complete && <Checklist steps={steps} heading="Still to do" />}
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>Your profile</div>
        <h2 style={{ fontSize: 38, color: 'var(--cream)', marginBottom: 10 }}>{type.n}</h2>
        <p style={{ fontFamily: 'Marcellus,serif', fontSize: 19, color: 'var(--pale)', marginBottom: 16 }}>{type.tag}</p>
        <p className="small" style={{ maxWidth: 640 }}>{type.d}</p>
      </div>

      <div className="card">
        <div className="card-head"><h3>{side === 'client' ? 'How you work' : 'How you work best'}</h3></div>
        <ul className="plain">{selfLines.map(l => <li key={l}>{l}</li>)}</ul>
        <details className="more">
          <summary>See the full profile</summary>
          <div className="inner">
            <p className="small muted" style={{ marginBottom: 18 }}>
              Twelve measured axes. This is what the matching runs on.
            </p>
            <div className="grid-2">
              <div><div className="eyebrow" style={{ marginBottom: 12 }}>Working style</div>
                <AxisBars values={sig.scores} axes={L1} /></div>
              <div><div className="eyebrow" style={{ marginBottom: 12 }}>Disposition</div>
                <AxisBars values={sig.scores} axes={L2} /></div>
            </div>
            <div className="row" style={{ marginTop: 20 }}>
              <Link className="btn sm ghost" href="/app/signature">Retake the assessment</Link>
            </div>
          </div>
        </details>
      </div>

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

      {/* what to do next */}
      {side === 'client' ? (
        ranked.length === 0 ? (
          <div className="next-step">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Where you are</div>
              <div className="small">
                Your Signature is done, and your Client Success Manager is working the
                search now. We put people forward by hand rather than sending you a
                directory — you will hear from us within fourteen days of the search opening.
              </div>
            </div>
            <Link className="btn solid" href="/app/messages">Message your manager</Link>
          </div>
        ) : (
          <>
            <div className="card">
              <div className="card-head"><h3>Your strongest match</h3>
                <span className={`pill ${ranked[0].match.band.c}`}><span className="dot" />
                  {ranked[0].match.overall}% {ranked[0].match.band.k} fit</span></div>
              <div className="row" style={{ marginBottom: 18 }}>
                <Portrait id={ranked[0].person.id} name={ranked[0].person.name} cls="lg" url={ranked[0].person.photo_url} />
                <div>
                  <h4 style={{ fontSize: 20 }}>{ranked[0].person.name}</h4>
                  <div className="small muted">{ranked[0].person.role} · {ranked[0].person.yrs} years · {ranked[0].person.loc}</div>
                </div>
              </div>
              <p className="verdict">{fitSentence(ranked[0].match, ranked[0].person.name.split(' ')[0])}</p>
              {(() => { const h = matchHeadline(ranked[0].match, ranked[0].person.name.split(' ')[0]);
                return h.good ? <ul className="plain" style={{ marginTop: 14 }}><li>{h.good}</li></ul> : null; })()}
            </div>
            <div className="next-step">
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Next step</div>
                <div className="small">{ranked.length} people have been matched to your profile. Review them and tell us who you would like to meet.</div>
              </div>
              <Link className="btn solid" href="/app/pipeline">Review your matches</Link>
            </div>
          </>
        )
      ) : (
        <div className="next-step">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{setup.complete ? 'Where you are' : 'Next'}</div>
            <div className="small">{setup.complete
              ? 'Your profile is complete and visible to matched executives. We will be in touch when a role fits.'
              : setup.next!.blurb}</div>
          </div>
          <Link className="btn solid" href={setup.complete ? '/app/talent' : setup.next!.href}>
            {setup.complete ? 'See your profile' : setup.next!.title}</Link>
        </div>
      )}

      {!configured() && (
        <p className="small muted">Demo mode — add your Supabase keys to <code>.env.local</code> for live data.</p>
      )}
    </Shell>
  );
}
