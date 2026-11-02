'use client';
import { useEffect } from 'react';

/* Depth for the whole app (Nona, 2 November 2026: "add more depth and 3D
   aspects to the overall app"). Decoration only:

   Parallax of the wall only. As the page scrolls the header wall falls
   behind more slowly than the page, and on desktop it shifts a few pixels
   against the cursor, so the band reads as a room behind the page. Text
   never moves (Nona did not like the greeting drifting; the page-change
   transitions were removed the same day). Writes --scroll, --px and --py on
   <html>; evergreen.css does the moving. Focus pull is pure CSS.

   With reduced motion none of it runs. If this never runs, nothing moves. */

export default function Depth() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    const fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    let tx = 0, ty = 0, x = 0, y = 0, sy = -1, raf = 0;
    const tick = () => {
      raf = 0;
      const s = Math.min(window.scrollY, 900);
      if (s !== sy) { sy = s; root.style.setProperty('--scroll', s.toFixed(0)); }
      x += (tx - x) * .08; y += (ty - y) * .08;
      root.style.setProperty('--px', x.toFixed(4)); root.style.setProperty('--py', y.toFixed(4));
      if (Math.abs(tx - x) > .001 || Math.abs(ty - y) > .001) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      kick();
    };
    window.addEventListener('scroll', kick, { passive: true });
    if (fine) window.addEventListener('pointermove', move, { passive: true });
    kick();
    return () => {
      window.removeEventListener('scroll', kick);
      window.removeEventListener('pointermove', move);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
