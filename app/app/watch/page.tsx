import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSkills, skillsComplete } from '@/lib/roles';
import { myWatchStatus } from '@/lib/watch';
import { DISCIPLINE } from '@/lib/disciplines';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import WatchBoard from '@/components/WatchBoard';

export const dynamic = 'force-dynamic';

export default async function WatchPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'talent') redirect('/app');

  const skills = await getSkills(profile.id);
  const disciplines: string[] = skills?.disciplines ?? [];
  const status = skillsComplete(skills) ? await myWatchStatus(profile.id, disciplines) : [];
  const items = status.map(s => ({ ...s, name: DISCIPLINE[s.discipline]?.name ?? s.discipline }));

  return (
    <Shell profile={profile} active="/app/watch" title="Taking The Watch"
      crumb="A real day of work, once, before you're matched to anyone">
      {!skillsComplete(skills) ? (
        <div className="card">
          <div className="card-head"><h3>Finish your Skills breakdown first</h3></div>
          <p className="small muted" style={{ maxWidth: 560 }}>
            Taking The Watch is built from the disciplines you claim on your Skills page — there is
            nothing generic to test until that is done. Once it is, come back here.
          </p>
        </div>
      ) : (
        <>
          <div className="card tight">
            <Explain>
              A live, timed simulation of a real day in each discipline you claim — one attempt, paid,
              completed on your own time once you start it. It is the one part of intake that is
              observed rather than reported, and it has to be cleared before you enter the Talent Roster.
            </Explain>
          </div>
          <WatchBoard items={items} />
        </>
      )}
    </Shell>
  );
}
