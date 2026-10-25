'use client';
import { useState } from 'react';
import PostingEditor from './PostingEditor';
import Overlay from './Overlay';

/* The editor opens over the page. It used to unfold inside the hero's action
   slot, which Shell renders twice (desktop and phone), so the form appeared
   twice as well. */
export default function NewPosting() {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn sm solid" onClick={() => setOpen(true)}>Write a role</button>;
  return (
    <Overlay onClose={() => setOpen(false)} label="A new role">
      <div className="card-head"><h3>A new role</h3>
        <button type="button" className="x-btn" aria-label="Close" onClick={() => setOpen(false)}>×</button></div>
      <PostingEditor onDone={() => setOpen(false)} />
    </Overlay>
  );
}
