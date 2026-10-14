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
      {/* The trigger used to be the bare "?" disc and nothing else. Most of
          the places it is used put it on a line of its own, where a lone
          circle with no label reads as a stray control somebody forgot to
          finish — three separate reviewers called it exactly that. The word
          costs one line of markup and turns a mystery button into an offer. */}
      <button type="button" className="explain-q" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <span className="explain-mark" aria-hidden="true">?</span>
        <span className="explain-word">{open ? 'Hide' : 'Why'}</span>
      </button>
      {open && <span className={`explain-note ${className}`}>{children}</span>}
    </span>
  );
}
