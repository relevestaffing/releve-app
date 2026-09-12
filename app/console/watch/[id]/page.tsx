import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getAttemptForReview } from '@/lib/watch';
import { DISCIPLINE } from '@/lib/disciplines';
import Shell from '@/components/Shell';
import WatchScoreForm from '@/components/WatchScoreForm';
import { fmtDate } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function ConsoleWatchAttempt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const attempt = await getAttemptForReview(id);
  if (!attempt) redirect('/console/watch');
  const name = DISCIPLINE[attempt.discipline]?.name ?? attempt.discipline;

  return (
    <Shell profile={profile} active="/console/watch" title="Taking The Watch"
      crumb={`${attempt.talentName} · ${name}`}>
      <div className="card tight">
        <div className="row between small muted" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span>Started {fmtDate(attempt.startedAt)}</span>
          <span>{attempt.submittedAt ? `Submitted ${fmtDate(attempt.submittedAt)}` : 'Not yet submitted'}</span>
          <span>{Math.round(attempt.timeLimitMinutes / 60 * 10) / 10}h window</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 16, marginBottom: 20 }}>
        {attempt.tasks.map((t, i) => (
          <div key={t.id} className="card">
            <div className="card-head"><h3>{i + 1}. {t.title}</h3></div>
            <p className="small muted" style={{ whiteSpace: 'pre-wrap', marginBottom: 14 }}>{t.prompt}</p>
            <div className="card" style={{ background: 'var(--paper)', boxShadow: 'none' }}>
              <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{t.response || '— left blank —'}</p>
            </div>
          </div>
        ))}
      </div>

      <WatchScoreForm attemptId={attempt.id} existing={attempt.existingScore} />
    </Shell>
  );
}
