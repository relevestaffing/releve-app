'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PostingEditor from './PostingEditor';
import { saving } from './Toast';
import { POST_STATE, postedAgo, type JobPost } from '@/lib/jobs-public';

export default function PostingRow({ post, applicants }: { post: JobPost; applicants: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const s = POST_STATE.find(x => x.key === post.state)!;

  async function remove() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/postings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: post.id })
    }), 'Posting deleted');
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="card">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="row" style={{ gap: 10, marginBottom: 4 }}>
            <Link href={`/console/postings/${post.id}`} style={{ textDecoration: 'none' }}>
              <h3 style={{ margin: 0 }}>{post.title}</h3>
            </Link>
            <span className={`pill ${s.tone}`}>{s.tone && <span className="dot" />}{s.label}</span>
          </div>
          <p className="small muted" style={{ margin: '0 0 6px' }}>{post.summary}</p>
          <div className="xs muted">
            {[post.location, post.hours].filter(Boolean).join(' · ')}
            {post.opened_at && ` · ${postedAgo(post.opened_at)}`}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href={`/console/postings/${post.id}`} className="pill" style={{ textDecoration: 'none' }}>
            {applicants} {applicants === 1 ? 'applicant' : 'applicants'}
          </Link>
          <button className="btn sm ghost" onClick={() => setOpen(o => !o)}>
            {open ? 'Close' : 'Edit'}
          </button>
          {post.state === 'draft' && (confirmDelete
            ? <>
                <span className="xs muted">Delete this draft?</span>
                <button className="btn sm solid" disabled={busy} onClick={remove}>Yes</button>
                <button className="btn sm ghost" onClick={() => setConfirmDelete(false)}>No</button>
              </>
            : <button className="btn sm ghost" disabled={busy}
                onClick={() => setConfirmDelete(true)}>Delete</button>
          )}
        </div>
      </div>
      {open && <div style={{ marginTop: 22 }}>
        <PostingEditor post={post} onDone={() => setOpen(false)} />
      </div>}
    </div>
  );
}
