'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { haptic } from '@/lib/haptic';

/* Pull down at the top of any screen to refresh it, the way every real app
   does. Touch screens only. The page's own overscroll bounce is switched off
   on phones, so this is the one thing that happens when you pull. It never
   starts inside the menu, the Ask panel, a field, or anything scrolling on
   its own, and it refreshes the screen's data in place (no full reload). */
const TRIGGER = 74;
const C = 2 * Math.PI * 11;

export default function PullRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const t0 = useRef(0);
  const st = useRef({ y: 0, on: false, armed: false });

  useEffect(() => {
    if (!window.matchMedia('(pointer:coarse)').matches) return;
    const blocked = (t: EventTarget | null) =>
      !!(t as Element | null)?.closest?.('.nav-drawer, .ask-panel, textarea, input, select, [data-no-pull], [role=dialog], .tb-panel');
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || document.body.style.overflow === 'hidden' || blocked(e.target)) { st.current.on = false; return; }
      st.current = { y: e.touches[0].clientY, on: true, armed: false };
    };
    const onMove = (e: TouchEvent) => {
      if (!st.current.on) return;
      const dy = e.touches[0].clientY - st.current.y;
      if (dy <= 0 || window.scrollY > 0) { st.current.on = dy > 0 ? false : st.current.on; setPull(0); return; }
      const p = Math.min(1, (dy * 0.5) / TRIGGER);
      setPull(p);
      const armed = p >= 1;
      if (armed && !st.current.armed) haptic(10);
      st.current.armed = armed;
    };
    const onEnd = () => {
      if (!st.current.on) return;
      st.current.on = false;
      if (st.current.armed) { t0.current = Date.now(); setBusy(true); start(() => { router.refresh(); }); }
      setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [router]);

  /* keep the ring up for at least a beat so it never flickers, and never forever */
  useEffect(() => {
    if (!busy || pending) return;
    const t = window.setTimeout(() => setBusy(false), Math.max(0, 900 - (Date.now() - t0.current)));
    return () => window.clearTimeout(t);
  }, [busy, pending]);
  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setBusy(false), 7000);
    return () => window.clearTimeout(t);
  }, [busy]);

  if (!busy && pull <= 0) return null;
  const shown = busy ? 1 : Math.min(1, pull * 1.5);
  return (
    <div className={`ptr${busy ? ' busy' : ''}`} aria-hidden="true"
      style={{ opacity: shown, transform: `translateY(${busy ? 14 : Math.round(pull * 46)}px) scale(${busy ? 1 : 0.7 + pull * 0.3})`,
               transition: busy ? 'transform .25s ease, opacity .2s' : 'none' }}>
      <svg viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="11" strokeDasharray={busy ? `${C * 0.62} ${C}` : `${C}`} strokeDashoffset={busy ? 0 : C * (1 - pull)} />
      </svg>
    </div>
  );
}
