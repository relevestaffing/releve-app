import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import AskReleve from '@/components/AskReleve';
import { isOwner } from '@/lib/money';
import { recentActions } from '@/lib/ai/actions';
import { fmtWhen } from '@/lib/words';

export const metadata = { title: 'Ask Relève' };
export const dynamic = 'force-dynamic';

/* The founder's assistant: the whole console in one conversation, and a
   confirm-then-execute path for changes. Every proposal and its outcome is
   listed underneath, newest first, so the log is never out of sight. */
export default async function ConsoleAsk() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app/ask');
  const founder = await isOwner();
  const log = founder ? await recentActions(30).catch(() => []) : [];

  const starters = founder
    ? ['What is waiting on me today?', 'Show me this week’s posts', 'Hold next Tuesday’s Letter', 'Which invoices are open?']
    : ['What is waiting on the team today?', 'Which interviews are coming up?', 'What does the Book say about releases?'];

  return (
    <Shell profile={profile} active="/console/ask" title="Ask Relève" crumb={founder ? 'Ask, look up, and fix. Changes wait for your confirmation.' : 'Ask and look up'}>
      <AskReleve who="admin" founder={founder} starters={starters} managerHref="/console/messages" />

      {founder && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h3>What the assistant has done</h3><span className="xs muted">{log.length ? `Last ${log.length}` : ''}</span></div>
          {!log.length ? (
            <p className="small muted" style={{ margin: 0 }}>Nothing yet. Proposals you confirm or dismiss appear here, with the outcome.</p>
          ) : (
            <table className="data">
              <thead><tr><th>When</th><th>What</th><th>Kind</th><th>Outcome</th></tr></thead>
              <tbody>
                {log.map(a => (
                  <tr key={a.id}>
                    <td className="xs muted" style={{ whiteSpace: 'nowrap' }}>{fmtWhen(a.confirmed_at ?? a.created_at)}</td>
                    <td className="small">{a.summary}</td>
                    <td className="xs muted">{a.kind}</td>
                    <td><span className={`pill ${a.status === 'done' ? 'good' : a.status === 'failed' ? 'crit' : ''}`}>{a.status === 'proposed' ? 'Waiting' : a.status === 'done' ? 'Done' : a.status === 'failed' ? 'Did not work' : 'Dismissed'}</span>
                      {a.status === 'failed' && a.result?.error && <div className="xs muted" style={{ marginTop: 4 }}>{String(a.result.error)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Shell>
  );
}
