'use client';
import { useState } from 'react';

/* A "why" note that stays out of the way until somebody actually wants it.
   Renders a small circular question mark; clicking it reveals the note in
   place and clicking again hides it. Used wherever a page was explaining
   itself in a full sentence nobody asked for — the number or the control
   still speaks for itself, the reasoning is one tap away. */
export default function Explain({ children, className = 'xs muted' }: {
  children: React.ReactNode;
  /* Passed through to the revealed note so it keeps whatever text style
     the paragraph it replaced used ("xs muted" or "small muted"). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="explain">
      <button type="button" className="explain-q" aria-expanded={open}
        aria-label={open ? 'Hide explanation' : 'Why?'}
        onClick={() => setOpen(o => !o)}>?</button>
      {open && <span className={`explain-note ${className}`}>{children}</span>}
    </span>
  );
}
