import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import ApplicationCard from '@/components/ApplicationCard';
import TableSearch from '@/components/TableSearch';
import { listApplications, listPostings } from '@/lib/jobs';
import { applicationStages, APPLICATION_SECTIONS } from '@/lib/jobs-public';
import Link from 'next/link';
import ConsoleTabs from '@/components/ConsoleTabs';

export const dynamic = 'force-dynamic';

export default async function Applications() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const apps = await listApplications();
  const posts = await listPostings();
  const title = new Map(posts.map(p => [p.id, p.title]));

  /* Grouped by where each person is in the process rather than by posting.
     Applications are worked as a queue — read, call, decide — and the queue is
     what the page should show. Which role they answered is on every card.
     The grouping itself lives in lib/jobs-public so a single posting's own
     file (below) reads the pipeline the same way this page does. */
  const stage = applicationStages(apps);
  const yours = stage.unread.length + stage.toBook.length + stage.toRecord.length + stage.decide.length;

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/recruiting"
      title="Recruiting" crumb={yours ? `${yours} waiting on you` : 'Everyone who applied'}>
      <ConsoleTabs active="/console/applications" items={[
        { href: '/console/applications', label: 'Applications', count: yours },
        { href: '/console/interviews', label: 'Introductions' },
        { href: '/console/postings', label: 'Postings', count: posts.filter(p => p.state === 'open').length }
      ]} />

      {apps.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-mark" aria-hidden="true" />
          <h3>Nobody has applied yet</h3>
          <p className="small">Applications land here from live postings, with answers and resume.</p>
          <Link className="btn sm ghost" href="/console/postings" style={{ marginTop: 18 }}>
            Write a role
          </Link>
        </div>
      ) : (
        <>
          {apps.length > 8 &&
            <TableSearch scope="apps" rows=".card" groups="[data-group]"
              placeholder="Search applicants by name, email or answer…" />}

          <div id="apps">
            {APPLICATION_SECTIONS.map(sec => {
              const list = stage[sec.key];
              if (!list.length) return null;
              return (
                <div key={sec.key} data-group style={{ marginBottom: 34 }}>
                  <h3 className="section-h">
                    {sec.head}
                    <span className="pill" style={{ marginLeft: 10 }}>{list.length}</span>
                  </h3>
                  {sec.note && <p className="small muted" style={{ margin: '0 0 14px' }}>{sec.note}</p>}
                  {list.map(a => (
                    <ApplicationCard key={a.id} app={a}
                      role={a.post_id ? (title.get(a.post_id) ?? 'A role since deleted') : 'General application'} />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
