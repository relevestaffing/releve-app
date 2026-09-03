import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listPlacementsFor } from '@/lib/work';
import Shell from '@/components/Shell';
import TaskBoard from '@/components/TaskBoard';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  const side = profile.role === 'client' ? 'client' : 'talent';
  const placements = await listPlacementsFor(profile.id);

  return (
    <Shell profile={profile} active="/app/tasks" title="Tasks"
      crumb={side === 'client' ? 'What you have delegated' : 'What is on your plate'}>
      {placements.length === 0 ? (
        <div className="card">
          <div className="empty"><span className="tick" />
            <p className="small">
              {side === 'client'
                ? 'Once someone is placed with you, this becomes the list you hand work to.'
                : 'Once you are placed, the work your executive hands over appears here.'}
            </p>
          </div>
        </div>
      ) : placements.map(p => (
        <div key={p.id}>
          {placements.length > 1 && (
            <div className="eyebrow" style={{ margin: '26px 0 12px' }}>
              {side === 'client' ? p.talent_name : `${p.client_name}${p.org_name ? ` · ${p.org_name}` : ''}`}
            </div>
          )}
          <TaskBoard
            placementId={p.id} me={profile.id} side={side}
            counterpart={side === 'client' ? p.talent_name.split(' ')[0] : p.client_name.split(' ')[0]}
          />
        </div>
      ))}
    </Shell>
  );
}
