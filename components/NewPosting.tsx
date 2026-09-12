'use client';
import { useState } from 'react';
import PostingEditor from './PostingEditor';

export default function NewPosting() {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn sm solid" onClick={() => setOpen(true)}>Write a role</button>;
  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="card-head"><h3>A new role</h3></div>
      <PostingEditor onDone={() => setOpen(false)} />
    </div>
  );
}
