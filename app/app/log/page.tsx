import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listPlacementsFor } from '@/lib/work';
import Shell from '@/components/Shell';
import Empty from '@/components/Empty';
import DailyLogForm from '@/components/DailyLogForm';
import { listLogs, viewerTimezone, todayIn } from '@/lib/experience';
import { firstName, fmtDate } from '@/lib/words';

export const dynamic = 'force-dynamic';

/* The daily log. Two minutes at the end of the day; the honest record of
   the work, and the source of the highlights an executive sees each month. */
export default async function LogPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'talent') redirect('/app');

  const [placements, tz, logs] = await Promise.all([
    listPlacementsFor(profile.id), viewerTimezone(profile.id), listLogs(profile.id, 40)
  ]);
  const today = todayIn(tz);

  return (
    <Shell profile={profile} active="/app/log" title="Daily log"
      crumb="What got done today, in two minutes">
      {!placements.length ? (
        <Empty of={{
          title: 'Your log starts with your placement',
          body: 'Once you are placed, this is where you note what got done each day, your hours and anything in the way. You choose what your executive sees; the rest stays with Relève.',
          cta: { label: 'Back to your dashboard', href: '/app' }
        }} />
      ) : (
        <div className="stack">
          {placements.map(p => (
            <div key={p.id} className="stack" style={{ gap: 12 }}>
              {placements.length > 1 && <div className="eyebrow">{p.org_name ?? p.client_name}</div>}
              <DailyLogForm placementId={p.id} executive={firstName(p.client_name)} today={today}
                logs={logs.filter(l => l.placement_id === p.id)} />
            </div>
          ))}

          {logs.length > 0 && (
            <div className="card">
              <div className="card-head"><h3>Recent days</h3></div>
              <ul className="report-list">
                {logs.slice(0, 14).map(l => (
                  <li key={l.id}>
                    <span>
                      {l.done_text ? l.done_text.split('\n')[0].slice(0, 160) : <span className="muted">Hours only</span>}
                      {l.share_highlight && l.highlight ? <span className="xs muted"> · highlight shared</span> : null}
                    </span>
                    <span className="when">{fmtDate(l.log_date)}{l.hours != null ? ` · ${l.hours}h` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}
