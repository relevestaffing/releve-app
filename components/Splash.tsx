'use client';
import { useEffect, useState } from 'react';

/* The branded loading splash (Sheen). Rendered by React on the server so it is
   in the very first HTML and shows instantly over the cold JS download, then
   fades and unmounts itself the React way once the app has hydrated.

   Why a component and not a raw div: the first version removed the div by
   hand (el.remove()) while React still owned it, so the next client-side
   navigation made React reconcile against a node that was gone and every
   page switch fell into the error boundary. React must own the exit. The
   inline head script keeps an 8s hard fallback that only hides it (display
   none, never removal) for the case where the bundle never loads at all. */
export default function Splash() {
  const [phase, setPhase] = useState<'show' | 'hide' | 'gone'>('show');
  useEffect(() => {
    const start = (window as any).__rvSplashStart || Date.now();
    const wait = Math.max(0, 1100 - (Date.now() - start)); /* held at least 1.1 s so it is always seen (Nona, 3 Nov 2026) */
    const t1 = setTimeout(() => setPhase('hide'), wait);
    const t2 = setTimeout(() => setPhase('gone'), wait + 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (phase === 'gone') return null;
  return (
    <div id="rv-splash" aria-hidden="true" className={phase === 'hide' ? 'rv-splash-done' : undefined}>
      <img className="rv-logo" src="/logo-fern.png" alt="" width="1200" height="360" decoding="sync" fetchPriority="high" />
      <div className="rv-bar"><i></i></div>
    </div>
  );
}
