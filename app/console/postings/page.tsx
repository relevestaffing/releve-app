import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import PostingRow from '@/components/PostingRow';
import NewPosting from '@/components/NewPosting';
import { listPostings, listApplications } from '@/lib/jobs';

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
  const drafts = posts.filter(p => p.state === 'draft');
  const closed = posts.filter(p => p.state === 'closed');

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/postings"
      title="Postings" crumb="Roles you are openly recruiting for"
      action={<NewPosting />}>

      <div className="card tight">
        <p className="small" style={{ margin: 0 }}>
          A role you publish here appears on the careers page at relevestaffing.com
          within a minute, with no file to edit and nothing to redeploy. Close it and it
          comes off the site, while the applications it already brought in stay where
          they are.
        </p>
      </div>

      {posts.length === 0 && (
        <div className="card empty-card">
          <div className="empty-mark" aria-hidden="true" />
          <h3>No roles posted yet</h3>
          <p className="small">
            Write one and it goes on the careers page the moment you publish it. Until
            then, the page shows the general application form as it does today,
            so there is no broken state while you think about the wording.
          </p>
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
