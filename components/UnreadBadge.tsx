'use client';
import { useEffect, useRef, useState } from 'react';

/* The unread count, as a real element rather than CSS keyed on hrefs.
   UnreadSync is the one place that fetches; it publishes each new count on
   window (for anything that mounts later) and as a 'releve:unread' event
   (for anything already on screen). Every badge just listens. */
declare global {
  interface Window { __releveUnread?: number }
}

export function publishUnread(n: number) {
  if (typeof window === 'undefined') return;
  window.__releveUnread = n;
  window.dispatchEvent(new CustomEvent('releve:unread', { detail: n }));
}

export function useUnread(initial: number): number {
  const [n, setN] = useState(initial);
  useEffect(() => {
    if (typeof window.__releveUnread === 'number') setN(window.__releveUnread);
    const on = (e: Event) => {
      const d = (e as CustomEvent<number>).detail;
      if (typeof d === 'number') setN(d);
    };
    window.addEventListener('releve:unread', on);
    return () => window.removeEventListener('releve:unread', on);
  }, []);
  /* A fresh server count (a navigation) wins, but not on first mount, where
     the live number already published may be newer than this page's read. */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setN(initial);
  }, [initial]);
  return n;
}

/* variant: 'side' sits at the end of a sidebar or drawer row; 'quick' sits on
   the quick bar icon; 'dot' is the quiet marker on the closed menu button. */
export default function UnreadBadge({ initial, variant = 'side' }: {
  initial: number; variant?: 'side' | 'quick' | 'dot';
}) {
  const n = useUnread(initial);
  if (n <= 0) return null;
  const label = n > 99 ? '99+' : String(n);
  const words = `${n} unread`;
  if (variant === 'dot') return <span className="unread-dot" aria-hidden="true" />;
  return (
    <span className={`unread-badge ${variant}`}>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only"> ({words})</span>
    </span>
  );
}
