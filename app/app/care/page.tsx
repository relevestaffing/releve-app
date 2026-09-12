import { redirect } from 'next/navigation';
import Link from 'next/link';
import { dayLabel } from '@/lib/money-public';
import { currentProfile } from '@/lib/supabase/server';
import { listPlacementsFor } from '@/lib/work';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import PlacementView from '@/components/PlacementView';
import { Portrait } from '@/components/Viz';
import Empty from '@/components/Empty';
import { firstName, EMPTY } from '@/lib/words';

export const dynamic = 'force-dynamic';

/* Everything about the placement itself, for whichever side is looking.
   ---------------------------------------------------------------------
   This used to read listPlacementsFor(...)[0] and throw the rest away, which
   was invisible right up until an executive hired a second assistant — at
   which point that person existed in the database, was being invoiced for,
   and could not be reached through the interface at all.

   One placement still renders in place, because making somebody click through
   a list of one is a worse product. Several get a list. */
export default async function Care() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console/care');

  const side = profile.role === 'client' ? 'client' : 'talent';
  const placements = await listPlacementsFor(profile.id);

  if (!placements.length) return (
    <Shell profile={profile} active="/app/care" title="Your placement"
      crumb="Once you are placed, this is where it lives">
      <Empty of={side === 'client' ? EMPTY.careClient : EMPTY.careTalent} />
    </Shell>
  );

  if (placements.length === 1) {
    const p = placements[0];
    return (
      <Shell profile={profile} active="/app/care"
        title={side === 'client' ? `Working with ${firstName(p.talent_name)}` : 'Your placement'}
        crumb={side === 'client' ? p.talent_name : (p.org_name ?? p.client_name)}>
        <PlacementView placement={p} side={side} userId={profile.id} />
      </Shell>
    );
  }

  /* Several placements. For the executive that is their team; for a talent
     it is the executives they work with — the list used to show a talent
     their own name and photo on every row. */
  return (
    <Shell profile={profile} active="/app/care"
      title={side === 'client' ? 'Your team' : 'Your placements'}
      crumb={side === 'client'
        ? `${placements.length} people placed with you`
        : `${placements.length} executives you work with`}>
      <div style={{ marginBottom: 22 }}>
        <Explain>
          {side === 'client'
            ? 'Each person has their own page: what they are working on, how the month has gone, and their ninety-day onboarding plan. Tasks and billing cover everyone together.'
            : 'Each placement has its own page: the ninety-day plan, time off and feedback for that role. Your tasks and check-ins cover every placement together.'}
        </Explain>
      </div>
      <div className="stack">
        {placements.map(p => {
          const otherId = side === 'client' ? p.talent_id : p.client_id;
          const otherName = side === 'client' ? p.talent_name : (p.org_name ?? p.client_name);
          return (
            <Link key={p.id} href={`/app/care/${p.id}`} className="card link-card">
              <div className="row between" style={{ alignItems: 'center', gap: 16 }}>
                <div className="row">
                  <Portrait id={otherId} name={otherName} cls="lg" />
                  <div>
                    <h3 style={{ marginBottom: 2 }}>{otherName}</h3>
                    <div className="small muted">Started {dayLabel(p.started_on)}</div>
                  </div>
                </div>
                <span className="choose-go">Open →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
