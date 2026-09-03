import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listPlacementsFor } from '@/lib/work';
import { feedbackFor, pulseFor, stepsFor, timeOffFor, FEEDBACK_SCORES } from '@/lib/care';
import Shell from '@/components/Shell';
import PulseForm from '@/components/PulseForm';
import TimeOffForm from '@/components/TimeOffForm';
import FirstFortnight from '@/components/FirstFortnight';
import SeenFeedback from '@/components/SeenFeedback';

export const dynamic = 'force-dynamic';

/* Everything about the placement itself, on one page, for whichever side is
   looking. The executive gets the monthly pulse; the talent gets time off and
   the feedback written about them. Both get the first-fortnight plan. */
export default async function Care() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console/care');

  const side = profile.role === 'client' ? 'client' : 'talent';
  const placements = await listPlacementsFor(profile.id);
  const p = placements[0] ?? null;

  if (!p) return (
    <Shell profile={profile} active="/app/care" title="Your placement"
      crumb="Once you are placed, this is where it lives">
      <div className="card tight">
        <p className="small muted">
          {side === 'client'
            ? 'Nothing here yet. Once your talent starts, this is where you tell Relève how it is going each month, and where the first two weeks are planned out.'
            : 'Nothing here yet. Once you are placed, this is where you ask for time off, follow the first two weeks, and read the feedback written about your work.'}
        </p>
      </div>
    </Shell>
  );

  const [steps, pulse, off, feedback] = await Promise.all([
    stepsFor(p.id),
    side === 'client' ? pulseFor(p.id) : Promise.resolve(null),
    side === 'talent' ? timeOffFor(p.id) : Promise.resolve([]),
    side === 'talent' ? feedbackFor(profile.id) : Promise.resolve([])
  ]);

  const shared = feedback.filter(f => f.shared);
  const unseen = shared.find(f => !f.seen_at);

  return (
    <Shell profile={profile} active="/app/care"
      title={side === 'client' ? `Working with ${p.talent_name.split(' ')[0]}` : 'Your placement'}
      crumb={side === 'client' ? p.talent_name : (p.org_name ?? p.client_name)}>

      <div className="stack">
        {side === 'client' && (
          <PulseForm placementId={p.id} talentName={p.talent_name} existing={pulse} />
        )}

        {side === 'talent' && (
          <>
            {unseen && <SeenFeedback id={unseen.id} />}
            <div className="card">
              <div className="card-head"><h3>How you are doing</h3></div>
              {!shared.length ? (
                <p className="small muted">
                  Nothing yet. Your Talent Success Manager writes this after your first
                  full month, and you will see it here the moment it is ready.
                </p>
              ) : shared.map(f => (
                <div key={f.id} style={{ paddingBottom: 20, marginBottom: 20, borderBottom: '1px solid var(--mist)' }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>{f.period}</div>
                  <div className="fb-scores">
                    {FEEDBACK_SCORES.map(s => (
                      <div key={s.key} className="fb-score">
                        <div className="n">{f[s.key] ?? '—'}<small> / 5</small></div>
                        <div className="k">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="small" style={{ marginBottom: 12 }}><b>What is going well.</b> {f.strengths}</p>
                  {f.growing && <p className="small"><b>What to build on.</b> {f.growing}</p>}
                </div>
              ))}
            </div>

            <TimeOffForm placementId={p.id} existing={off} />
          </>
        )}

        <FirstFortnight steps={steps} startedOn={p.started_on} side={side} />
      </div>
    </Shell>
  );
}
