import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listProspects } from '@/lib/prospects';
import { calendarConfigured } from '@/lib/calendar';
import Shell from '@/components/Shell';
import DirectoryTabs from '@/components/DirectoryTabs';
import { AddProspect, ProspectRow } from '@/components/ProspectDesk';

export const metadata = { title: 'Prospects' };

export const dynamic = 'force-dynamic';

export default async function Prospects() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const all = await listProspects();
  const now = Date.now();
  const upcoming = all.filter(p => p.stage === 'booked' && p.call_at && new Date(p.call_at).getTime() >= now);
  const open = all.filter(p => !['won', 'lost'].includes(p.stage) && !upcoming.includes(p));
  const decidedAll = all.filter(p => ['won', 'lost'].includes(p.stage));
  const recent = decidedAll.filter(p => now - new Date(p.updated_at).getTime() < 60 * 86400000);
  const older = decidedAll.filter(p => !recent.includes(p));
  const won = all.filter(p => p.stage === 'won').length;
  const decided = won + all.filter(p => p.stage === 'lost').length;

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/directory" title="Directory"
      crumb="Prospects">
      <DirectoryTabs active="prospects" />
      <AddProspect calendarOn={calendarConfigured()} />

      {all.length === 0 && (
        <div className="card empty-card">
          <div className="empty-mark" aria-hidden="true" />
          <h3>No prospects yet</h3>
          <p className="small">Add one after a call is booked, or pull them from the calendar.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Calls coming up</h3><span className="pill">{upcoming.length}</span></div>
          {upcoming.map(p => <ProspectRow key={p.id} p={p} />)}
        </div>
      )}
      {open.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>In conversation</h3><span className="pill warn"><span className="dot" />{open.length}</span></div>
          {open.map(p => <ProspectRow key={p.id} p={p} />)}
        </div>
      )}
      {recent.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Decided, last 60 days</h3><span className="pill">{recent.length}</span></div>
          {recent.map(p => <ProspectRow key={p.id} p={p} />)}
        </div>
      )}
      {older.length > 0 && (
        <details className="card more">
          <summary>Earlier · {older.length}</summary>
          <div className="inner">{older.map(p => <ProspectRow key={p.id} p={p} />)}</div>
        </details>
      )}
    </Shell>
  );
}
