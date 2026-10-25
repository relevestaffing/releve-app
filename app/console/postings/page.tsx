import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import PostingRow from '@/components/PostingRow';
import NewPosting from '@/components/NewPosting';
import ConsoleTabs from '@/components/ConsoleTabs';
import { listPostings, listApplications } from '@/lib/jobs';
import { applicationStages } from '@/lib/jobs-public';

export const dynamic = 'force-dynamic';

export default async function Postings() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const posts = await listPostings();
  const apps = await listApplications();
  const count: Record<string, number> = {};
  for (const a of apps) if (a.post_id) count[a.post_id] = (count[a.post_id] ?? 0) + 1;

  const open = posts.filter(p => p.state === 'open');
  const waiting = (() => { const s = applicationStages(apps); return s.unread.length + s.toBook.length + s.toRecord.length + s.decide.length; })();
  const drafts = posts.filter(p => p.state === 'draft');
  const closed = posts.filter(p => p.state === 'closed');

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/recruiting"
      title="Recruiting" crumb="Roles you are openly recruiting for"
      action={<NewPosting />}>
      <ConsoleTabs active="/console/postings" items={[
        { href: '/console/applications', label: 'Applications', count: waiting },
        { href: '/console/interviews', label: 'Interviews' },
        { href: '/console/postings', label: 'Postings', count: open.length }
      ]} />

      {posts.length === 0 && (
        <div className="card empty-card">
          <div className="empty-mark" aria-hidden="true" />
          <h3>No roles posted yet</h3>
          <p className="small">Publish one and it is on the careers page within a minute.</p>
        </div>
      )}

      {open.length > 0 && <>
        <h3 className="section-h">Live on the site</h3>
        {open.map(p => <PostingRow key={p.id} post={p} applicants={count[p.id] ?? 0} />)}
      </>}

      {drafts.length > 0 && <>
        <h3 className="section-h">Drafts: only you can see these</h3>
        {drafts.map(p => <PostingRow key={p.id} post={p} applicants={count[p.id] ?? 0} />)}
      </>}

      {closed.length > 0 && <>
        <h3 className="section-h">Closed</h3>
        {closed.map(p => <PostingRow key={p.id} post={p} applicants={count[p.id] ?? 0} />)}
      </>}
    </Shell>
  );
}
