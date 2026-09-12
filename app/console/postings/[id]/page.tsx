import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile, configured } from '@/lib/supabase/server';
import { getPosting, listApplicationsForPost } from '@/lib/jobs';
import { applicationStages, APPLICATION_SECTIONS, POST_STATE, postedAgo } from '@/lib/jobs-public';
import Shell from '@/components/Shell';
import ApplicationCard from '@/components/ApplicationCard';
import TableSearch from '@/components/TableSearch';

export const dynamic = 'force-dynamic';

/* One posting's own file: the funnel it is actually producing, where those
   people said they heard about it, and every candidate it has brought in —
   grouped the same way the team-wide Applications queue groups them, so
   nothing here needs to be read differently just because it is scoped to
   one role. */
export default async function PostingFile({ params }: { params: Promise<{ id: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');
  const { id } = await params;

  const post = await getPosting(id);
  if (!post) redirect('/console/postings');

  const apps = await listApplicationsForPost(id);
  const stage = applicationStages(apps);
  const s = POST_STATE.find(x => x.key === post.state)!;

  /* "Not said" catches a blank answer rather than hiding it — a hole in
     this list is still worth seeing, not silently dropped from the count. */
  const bySource = new Map<string, number>();
  for (const a of apps) {
    const key = a.heard_via?.trim() || 'Not said';
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }
  const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/postings"
      title={post.title}
      crumb={apps.length ? `${apps.length} ${apps.length === 1 ? 'candidate' : 'candidates'} so far` : 'No candidates yet'}
      action={<Link className="btn sm ghost" href="/console/postings">← All postings</Link>}>

      <div className="card tight">
        <div className="row" style={{ gap: 10, marginBottom: post.summary ? 8 : 0, flexWrap: 'wrap' }}>
          <span className={`pill ${s.tone}`}>{s.tone && <span className="dot" />}{s.label}</span>
          {[post.location, post.hours].filter(Boolean).join(' · ') &&
            <span className="xs muted">{[post.location, post.hours].filter(Boolean).join(' · ')}</span>}
          {post.opened_at && <span className="xs muted">{postedAgo(post.opened_at)}</span>}
        </div>
        {post.summary && <p className="small muted" style={{ margin: 0 }}>{post.summary}</p>}
      </div>

      <div className="grid-4">
        <div className="card stat"><div className="eyebrow">Ready for a call</div>
          <div className="score">{stage.toBook.length}</div></div>
        <div className="card stat"><div className="eyebrow">Booked</div>
          <div className="score">{stage.booked.length}</div></div>
        <div className="card stat"><div className="eyebrow">Your decision</div>
          <div className="score">{stage.decide.length}</div></div>
        <div className="card stat"><div className="eyebrow">In the platform</div>
          <div className="score">{stage.inside.length}</div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Where they came from</h3></div>
        {sources.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">Nobody has applied yet, so there is nothing to break down.</p></div>
        ) : (
          <ul className="past-list">
            {sources.map(([label, n]) => (
              <li key={label}>
                <span className="past-date">{label}</span>
                <span className="small">{n} {n === 1 ? 'candidate' : 'candidates'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h3 className="section-h" style={{ marginTop: 4 }}>Candidates</h3>

      {apps.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-mark" aria-hidden="true" />
          <h3>No one has applied yet</h3>
          <p className="small">
            Once someone applies to this role, they land here — grouped by where they
            stand, the same way your Applications page groups the whole queue.
          </p>
        </div>
      ) : (
        <>
          {apps.length > 8 &&
            <TableSearch scope="candidates" rows=".card" groups="[data-group]"
              placeholder="Search candidates by name, email or answer…" />}
          <div id="candidates">
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
                  {list.map(a => <ApplicationCard key={a.id} app={a} />)}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
