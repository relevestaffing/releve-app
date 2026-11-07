import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSkills, skillsComplete } from '@/lib/roles';
import { myWatchStatus } from '@/lib/watch';
import { DISCIPLINE } from '@/lib/disciplines';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import WatchBoard from '@/components/WatchBoard';

export const metadata = { title: 'Taking The Watch' };

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
    <Shell profile={profile} active="/app/watch" title="Taking The Watch™">
      {!skillsComplete(skills) ? (
        <div className="card">
          <div className="card-head"><h3>Add your skills first</h3></div>
          <p className="small muted" style={{ maxWidth: 560, marginBottom: 18 }}>
            The Watch is based on the skills you list, so please add them first.
          </p>
          <Link className="btn sm ghost" href="/app/skills">Go to your skills</Link>
        </div>
      ) : (
        <>
          <div className="card tight">
            <Explain>
              Taking The Watch™ is a timed work sample: a typical working day in each discipline you
              list. You have one attempt of three hours, and you choose when to start. It is paid at
              $6 an hour. This is the one step where we see your work directly, and you need to clear
              it before you join the roster.
            </Explain>
          </div>
          <WatchBoard items={items} />
        </>
      )}
    </Shell>
  );
}
