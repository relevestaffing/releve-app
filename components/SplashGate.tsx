'use client';
import { useEffect } from 'react';

/* Lifts the instant-render splash (in app/layout.tsx) the moment the app is
   interactive. The splash is server-rendered so it covers the cold JS download
   and hydration; this runs only once that work is done. A minimum show time
   keeps it from flashing on a warm load, and the inline head script has an
   8s hard fallback so a failed bundle never traps anyone behind it. */
export default function SplashGate() {
  useEffect(() => {
    const el = document.getElementById('rv-splash');
    if (!el) return;
    const start = (window as any).__rvSplashStart || Date.now();
    const wait = Math.max(0, 500 - (Date.now() - start));
    const t = setTimeout(() => {
      el.classList.add('rv-splash-done');
      setTimeout(() => el.remove(), 600);
    }, wait);
    return () => clearTimeout(t);
  }, []);
  return null;
}
