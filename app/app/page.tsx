import Link from 'next/link';
import { redirect } from 'next/navigation';
import { configured, currentProfile } from '@/lib/supabase/server';
import { getMySignature, rankBench, archetype } from '@/lib/data';
import { listDecisions } from '@/lib/work';
import { getAvailability, getSelfProfile, getCalendar, getSearch } from '@/lib/store';
import { talentSteps, clientSteps, progress } from '@/lib/onboarding';
import { watchStep } from '@/lib/setup';
import Checklist from '@/components/Checklist';
import { listVetting } from '@/lib/work';
import { getPayout } from '@/lib/payout';
import { payoutReady } from '@/lib/payout-public';
import { getRoleBreakdown, getSkills, roleComplete, skillsComplete } from '@/lib/roles';
import { L1, L2_SHOWN } from '@/lib/signature/model';
import { execSelfLines, talentSelfLines, fitSentence } from '@/lib/plain';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import OfferCard from '@/components/OfferCard';
import { myOffer } from '@/lib/offer';
import { AxisBars, Portrait } from '@/components/Viz';
import { executiveStage } from '@/lib/stage';
import { listPlacementsFor, getUnrevealedPlacement } from '@/lib/work';
import { stepsFor } from '@/lib/care';
import PlacedSummary from '@/components/PlacedSummary';
import PlacementProgress from '@/components/PlacementProgress';
import TaskBoard from '@/components/TaskBoard';
import ExecOnboarding from '@/components/ExecOnboarding';
import GuaranteeBadge from '@/components/GuaranteeBadge';
import { depositGateFor } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { firstName } from '@/lib/words';

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

  /* A placement just confirmed outranks the ordinary dashboard entirely —
     one indexed lookup, for either side, only until that side has seen it
     once. Client and talent each get their own showing, independently. */
  const unrevealed = await getUnrevealedPlacement(profile.id, side);
  if (unrevealed) redirect('/placement-confirmed');

  /* Empty rather than the fallback: these read "Welcome, {name}" and want to
     drop the name entirely when there isn't one. */
  const myName = firstName(profile.full_name, '');

  /* This whole page used to read as fifteen-odd sequential database round
     trips before the first byte went out — harmless on a fast connection
     hitting an already-warm server, but exactly what turns "opening the
     app" into several real seconds on a phone. Nearly all of these reads
     are independent of one another; only Promise.all was missing. Each
     conditional below still only calls its function when that side
     actually needs it — Promise.resolve(...) is a placeholder, never a
     query — so nobody gets a read they didn't get before, just sooner.

     An executive is not one kind of user for the life of their account
     either: while hiring, the candidate is the point; once somebody has
     started, the point is the working relationship, and search copy on
     this page would read as though Relève forgot they hired anyone. stage
     (executiveStage) is what "hiring" means below — "is a search open",
     never "do they have nobody", which is what lets an executive keep one
     assistant and still be shown hiring screens while Relève finds a
     second. */
  const [offer, sig, avail, vetting, role, stage, skills] = await Promise.all([
    myOffer(profile.id, side),
    getMySignature(profile, side),
    getAvailability(profile.id, ''),
    side === 'talent' ? listVetting(profile.id) : Promise.resolve([]),
    side === 'client' ? getRoleBreakdown(profile.id) : Promise.resolve(null),
    side === 'client'
      ? executiveStage(profile.id)
      : Promise.resolve({ hiring: true, placements: 0, placed: false }),
    side === 'talent' ? getSkills(profile.id) : Promise.resolve(null)
  ]);

  /* Talent gets the same read-only progress rail once placed as the
     executive does — listPlacementsFor already comes back empty for anyone
     with nothing active, so this is safe to call either way. The deposit
     stands between "the search is open" and "it is actually being worked" —
     checked only while there is a search to gate and nobody has been placed
     yet, falling open rather than closed when Stripe itself is not switched
     on, so a preview or unconfigured deploy never locks an executive out
     over a payment rail that is not live. brief is the 14-Day Placement
     Guarantee, made visible rather than left to a line of copy — same gate
     as the deposit. All three only need stage, not each other, so they run
     together rather than one after the next. */
  const [placements, deposit, brief] = await Promise.all([
    side === 'client'
      ? (stage.placed ? listPlacementsFor(profile.id) : Promise.resolve([]))
      : listPlacementsFor(profile.id),
    side === 'client' && stage.hiring && !stage.placed
      ? depositGateFor(profile.id) : Promise.resolve(null),
    side === 'client' && stage.hiring && !stage.placed
      ? getSearch(profile.id) : Promise.resolve(null)
  ]);
  /* Steps per placement, for the read-only onboarding progress card below —
     most executives have exactly one placement, so this is rarely more than
     a single extra read. */
  const stepsByPlacement = placements.length
    ? Object.fromEntries(await Promise.all(placements.map(async p => [p.id, await stepsFor(p.id)] as const)))
    : {};
  /* Half-answered is not answered: the breakdown only earns its keep once
     every competency in every chosen discipline has a view on it. */
  const hasRole   = roleComplete(role);
  const hasSkills = skillsComplete(skills);
  const hasAvailability = !!avail.timezone && (avail.windows?.length ?? 0) > 0;
  /* Talent-only and independent of each other — batched rather than
     awaited one at a time while building talentSteps below. */
  const [watch, payoutRow] = side === 'talent'
    ? await Promise.all([watchStep(profile.id, skills), getPayout(profile.id)])
    : ([null, null] as [Awaited<ReturnType<typeof watchStep>> | null, Awaited<ReturnType<typeof getPayout>>]);
  const steps = side === 'client'
    ? clientSteps({ hasSignature: !!sig, hasAvailability, hasIntro: !!(self.bio && self.photo_url), hasRole })
        /* With no search open there is nothing to describe, so asking them to
           finish the role brief is asking for work with no purpose. */
        .filter(st => stage.hiring || st.key !== 'role')
    : talentSteps({
        hasSignature: !!sig, hasAvailability, hasSkills,
        signatureInvalid: sig?.validity?.verdict === 'Invalid',
        watch: watch!,
        hasProfile: !!(self.bio && (self.skills?.length ?? 0) > 0),
        hasPhoto: !!self.photo_url,
        vettingDone: vetting.filter(v => v.state === 'verified').length,
        vettingTotal: 2,
        vettingSent: vetting.filter(v => v.state === 'submitted').length,
        hasIdentity: vetting.some(v => v.kind === 'identity' && v.state === 'verified'),
        hasPayout: payoutReady(payoutRow),
        hasIntroVideo: !!self.intro_video_url
      });
  const setup = progress(steps);

  /* ---------- executive onboarding: vision, then deposit, then Signature ----------
     The search opens on the deposit, not before (the Book's rule), so before
     the deposit is in the account's job is the case and the $500 — never the
     Signature. Any non-placed client whose deposit is not yet paid or waived
     lands in the guided vision-and-deposit onboarding, whether or not a
     Signature exists yet. This deliberately runs ahead of the Signature gate
     below, which from here on only ever catches talent, and clients who have
     already paid and still owe their Signature. A placed executive never
     enters here. */
  const depositSettled = deposit?.status === 'paid' || deposit?.status === 'waived';
  if (side === 'client' && !stage.placed && !depositSettled) {
    return (
      <Shell profile={profile} active="/app"
        title={myName ? `Welcome, ${myName}` : 'Welcome to Relève'}
        crumb={profile.org_name ?? 'Executive'}>
        <ExecOnboarding deposit={deposit} stripeOn={stripeReady()} />
      </Shell>
    );
  }

  if (!sig) return (
    <Shell profile={profile} active="/app"
      title={myName ? `Welcome, ${myName}` : 'Welcome to Relève'}
      crumb="Getting set up">
      <Checklist steps={steps}
        heading={side === 'client' ? 'Now let’s build your Signature' : 'Before we can begin your search'} />
      <div className="card tight">
        <p className="small muted">
          {side === 'client'
            ? 'Your search is open and your deposit is in. The Signature is the last thing we need from you — every candidate is scored against it before their name reaches you. Your Client Success Manager is already sourcing.'
            : 'Nothing is matched until your Signature exists. Once these are done, we do the work — your Talent Success Manager will come to you when a role fits.'}
        </p>
      </div>
    </Shell>
  );

  /* Both client-only and independent of each other (decisions doesn't
     need ranked, or vice versa) — batched instead of run one after the
     other.
     The dashboard used to read ranked[0] and nothing else, so approving or
     declining your candidate changed nothing here — and a declined person
     came back as "your candidate" every time you opened the app. It now
     follows exactly the same rule as the pipeline page. */
  const [ranked, decisions] = side === 'client'
    ? await Promise.all([rankBench(sig), listDecisions(profile.id)])
    : [[], []] as [Awaited<ReturnType<typeof rankBench>>, Awaited<ReturnType<typeof listDecisions>>];
  const decided = Object.fromEntries(decisions.map(d => [d.talent_id, d]));
  const current = ranked.find(r => decided[r.person.id]?.state !== 'passed') ?? null;
  const answered = current ? decided[current.person.id] ?? null : null;
  const declinedAll = ranked.length > 0 && !current;

  /* The executive's dashboard is a day-to-day working screen, not a page
     about the executive — that content (the archetype, the working-style
     signature, the role brief) moved to /app/profile, with the "who you
     are" part of it at the very bottom there. What is left here is only
     what the relationship needs today: what is waiting on you, what your
     talent is working on, and a fast way to reach them. The talent side is
     unchanged below — this split only applies to the client dashboard. */
  if (side === 'client') {
    /* Waiting on the executive means a candidate is in front of them with no
       answer. With nobody released yet the wait is Relève's, and the card
       used to say "Waiting on you" directly above "your manager is working
       the search now". */
    const waitingOnMe = !(stage.placed && !stage.hiring) && !!current && !answered;

    /* The one card both layouts need — full width when there is no
       placement yet to give it a rail to sit in, narrower inside the rail
       once there is. Built once so the two layouts below can't drift apart. */
    const needsAttention = (
      <div className="card">
        <div className="card-head"><h3>Needs your attention</h3>
          <span className={`pill ${waitingOnMe ? 'warn' : 'good'}`}>
            <span className="dot" />{waitingOnMe ? 'Waiting on you' : 'Clear'}</span></div>

        {stage.placed && !stage.hiring ? (
          <div className="empty"><span className="tick" />
            <p className="small">Nothing waiting on you right now.</p></div>
        ) : !current ? (
          <div className="row between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <p className="small" style={{ margin: 0, maxWidth: 520 }}>
              {declinedAll
                ? 'Thank you for telling us why that one was not right — it is exactly how the next match gets sharper. Your Client Success Manager is choosing the next candidate now.'
                : 'Your Signature is done, and your Client Success Manager is working the search now. We put one person forward by hand rather than sending you a directory — you will hear from us within fourteen days of the search opening.'}
            </p>
            <Link className="btn sm solid" href="/app/messages">Message your manager</Link>
          </div>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 18 }}>
              <Portrait id={current.person.id} name={current.person.name} cls="lg" url={current.person.photo_url} />
              <div>
                <h4 style={{ fontSize: 20 }}>{current.person.name}</h4>
                <div className="small muted">{current.person.role} · {current.person.yrs} years · {current.person.loc}</div>
              </div>
            </div>
            <p className="verdict">{fitSentence(current.match, firstName(current.person.name))}</p>
            <div className="row" style={{ marginTop: 18 }}>
              <Link className="btn sm solid"
                href={answered?.state === 'shortlisted' || answered?.state === 'hired' ? '/app/interviews' : '/app/pipeline'}>
                {answered?.state === 'shortlisted' || answered?.state === 'hired'
                  ? 'See your interviews'
                  : answered?.state === 'interviewing'
                    ? 'See your interviews'
                    : 'Review your candidate'}
              </Link>
            </div>
          </>
        )}
      </div>
    );

    return (
      <Shell profile={profile} active="/app"
        title={myName ? `Good to see you, ${myName}` : 'Your account'}
        crumb={profile.org_name ?? 'Executive'}>

        {offer && <OfferCard offer={offer} side="client" />}
        {!setup.complete && <Checklist steps={steps} heading="Still to do" />}

        {/* Side by side once there is a placement to work from — tasks as
           the main pane, attention and the team as a rail beside it, the
           way a working app is laid out rather than a page you scroll.
           Before a placement exists there is no main pane to give the rail
           a partner, so the same card just runs full width.

           The onboarding progress card rides in the main pane, right under
           its own task board, rather than the rail — an empty task list is
           short, and stacking a fixed two-card rail beside it left a slab
           of bare page under the tasks with nothing to explain it. Task
           board and progress card growing and shrinking together keeps the
           two columns reading as one page instead of two mismatched ones. */}
        {stage.placed ? (
          <div className="dash-grid">
            <div className="stack dash-main">
              {placements.flatMap(p => [
                <TaskBoard key={`tasks-${p.id}`} placementId={p.id} me={profile.id} side="client"
                  counterpart={firstName(p.talent_name)} limit={10} seeAllHref="/app/tasks" />,
                <PlacementProgress key={`progress-${p.id}`} steps={stepsByPlacement[p.id] ?? []} startedOn={p.started_on}
                  planHref={placements.length === 1 ? '/app/care' : `/app/care/${p.id}`} />
              ])}
            </div>
            <div className="stack dash-rail">
              {needsAttention}
              <PlacedSummary placements={placements} hiring={stage.hiring} />
            </div>
          </div>
        ) : (
          /* The deposit is settled by the time an executive reaches here — the
             onboarding branch above intercepts every unpaid, unplaced client —
             so this is the between-deposit-and-placement view: the guarantee
             countdown and whatever needs them. */
          <>
            {brief?.opened_at && <GuaranteeBadge openedAt={brief.opened_at} firstCandidateOn={brief.first_candidate_on ?? null} />}
            {needsAttention}
          </>
        )}
      </Shell>
    );
  }

  const type = archetype(sig.scores, side);
  const selfLines = talentSelfLines(sig.scores);

  return (
    <Shell profile={profile} active="/app"
      title={myName ? `Good to see you, ${myName}` : 'Your account'}
      crumb={self.headline ?? 'Talent'}>

      {offer && <OfferCard offer={offer} side="talent" />}

      {/* who you are, in words */}
      {!setup.complete && <Checklist steps={steps} heading="Still to do" />}
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>Your profile</div>
        <h2 style={{ fontSize: 32, color: 'var(--cream)', marginBottom: 10 }}>{type.n}</h2>
        <p style={{ fontFamily: 'Marcellus,serif', fontSize: 19, color: 'var(--pale)', marginBottom: 16 }}>{type.tag}</p>
        <p className="small" style={{ maxWidth: 640 }}>{type.d}</p>
      </div>

      <div className="card">
        <div className="card-head"><h3>How you work best</h3></div>
        <ul className="plain">{selfLines.map(l => <li key={l}>{l}</li>)}</ul>
        <details className="more">
          <summary>See the full profile</summary>
          <div className="inner">
            <div style={{ marginBottom: 18 }}>
              <Explain>
                Twelve measured axes, across eighteen facets. This is what the matching runs on.
              </Explain>
            </div>
            <div className="grid-2">
              <div><div className="eyebrow" style={{ marginBottom: 12 }}>Working style</div>
                <AxisBars values={sig.scores} axes={L1} /></div>
              <div><div className="eyebrow" style={{ marginBottom: 12 }}>Disposition</div>
                <AxisBars values={sig.scores} axes={L2_SHOWN} /></div>
            </div>
            <div className="row" style={{ marginTop: 20 }}>
              <Link className="btn sm ghost" href="/app/signature">Retake the assessment</Link>
            </div>
          </div>
        </details>
      </div>

      {placements.map(p => (
        <PlacementProgress key={`progress-${p.id}`} steps={stepsByPlacement[p.id] ?? []} startedOn={p.started_on}
          planHref={placements.length === 1 ? '/app/care' : `/app/care/${p.id}`} />
      ))}

      {setup.complete ? (
        <div className="next-step">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Where you are</div>
            <div className="small">
              Your profile is complete and visible to matched executives. We will be
              in touch when a role fits.
            </div>
          </div>
          <Link className="btn solid" href="/app/talent">See your profile</Link>
        </div>
      ) : null
      /* Nothing here while setup is outstanding. The checklist at the top of
         this page already leads with that exact step — same title, same blurb,
         same link — so this bar was the second half of a page saying one thing
         twice. On a screen whose whole job is "what do I do first", saying it
         twice halves the answer. */
      }
    </Shell>
  );
}
