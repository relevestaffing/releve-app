import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { watchReviewQueue } from '@/lib/watch';
import { DISCIPLINE } from '@/lib/disciplines';
import Shell from '@/components/Shell';
import Link from 'next/link';
import { fmtDate } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function ConsoleWatch() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const queue = await watchReviewQueue();

  return (
    <Shell profile={profile} active="/console/watch" title="Taking The Watch"
      crumb="Submitted, waiting on a decision">
      {queue.length === 0 ? (
        <div className="card"><div className="empty"><span className="tick" />
          <p className="small">Nothing waiting on review.</p></div></div>
      ) : (
        <div className="card">
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Talent</th><th>Discipline</th><th>Submitted</th><th style={{ textAlign: 'right' }}></th></tr></thead>
            <tbody>
              {queue.map(q => (
                <tr key={q.attemptId}>
                  <td><b>{q.talentName}</b></td>
                  <td>{DISCIPLINE[q.discipline]?.name ?? q.discipline}</td>
                  <td className="small muted">{fmtDate(q.submittedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="btn sm solid" href={`/console/watch/${q.attemptId}`}>Review</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
