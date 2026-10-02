import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getAttemptForTalent } from '@/lib/watch';
import { DISCIPLINE } from '@/lib/disciplines';
import Shell from '@/components/Shell';
import WatchAttemptForm from '@/components/WatchAttemptForm';

export const dynamic = 'force-dynamic';

export default async function WatchAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'talent') redirect('/app');

  const attempt = await getAttemptForTalent(attemptId, profile.id);
  if (!attempt) redirect('/app/watch');

  const name = DISCIPLINE[attempt.discipline]?.name ?? attempt.discipline;
  const readOnly = attempt.status !== 'in_progress';

  return (
    <Shell profile={profile} active="/app/watch" title="Taking The Watch" crumb={name}>
      {readOnly && (
        <div className="card tight" style={{ marginBottom: 4 }}>
          <p className="small muted">
            {attempt.status === 'submitted'
              ? 'Submitted. This is a read-only copy of what you sent. Your Talent Success Manager will follow up once it is reviewed.'
              : 'This attempt has been reviewed. See the result on the Taking The Watch page.'}
          </p>
        </div>
      )}
      <WatchAttemptForm
        attemptId={attempt.id}
        disciplineName={name}
        startedAt={attempt.startedAt}
        timeLimitMinutes={attempt.timeLimitMinutes}
        tasks={attempt.tasks}
        readOnly={readOnly}
      />
    </Shell>
  );
}
