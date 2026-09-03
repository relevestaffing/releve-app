'use client';
import { useEffect } from 'react';

/* Marks a review as read once it has actually been on screen. Silent on
   purpose — the talent should not have to acknowledge anything, and Relève
   just needs to know it landed. */
export default function SeenFeedback({ id }: { id: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/care', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'feedback_seen', id })
      }).catch(() => { /* not worth telling anyone about */ });
    }, 2500);
    return () => clearTimeout(t);
  }, [id]);
  return (
    <div className="card tight" style={{ background: 'var(--cream)' }}>
      <p className="small" style={{ margin: 0 }}>
        <b>New feedback from Relève.</b> Have a read below.
      </p>
    </div>
  );
}
