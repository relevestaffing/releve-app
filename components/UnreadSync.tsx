'use client';
import { useEffect, useState } from 'react';
import { publishUnread } from './UnreadBadge';

const POLL_MS = 60_000;

/* The unread count behind the badge on Messages, wherever Messages appears:
   the desktop sidebar, the phone's drawer and the phone's quick bar, plus a
   quiet dot on the menu button. This component only keeps the number; each
   place draws its own <UnreadBadge>, which listens for it.

   Starts from the count the server read for this page, then keeps itself
   current: on focus, every minute while visible, and the moment a thread
   reports it has been read (the 'releve:read' event from MessageThread). */
export default function UnreadSync({ initial }: { initial: number; href?: string }) {
  const [n, setN] = useState(initial);

  useEffect(() => { setN(initial); }, [initial]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/messages?unread=1', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && typeof d.total === 'number') setN(d.total);
      } catch { /* the badge waits for the next try */ }
    };
    const onRead = () => { window.setTimeout(refresh, 400); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('releve:read', onRead);
    const t = window.setInterval(refresh, POLL_MS);
    return () => {
      alive = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('releve:read', onRead);
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => { publishUnread(n); }, [n]);

  return null;
}
