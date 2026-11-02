'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/* Depth for the whole app (Nona, 2 November 2026: "add more depth and 3D
   aspects to the overall app"). Three things, decoration only:

   1. Parallax. As the page scrolls the header wall falls behind more slowly
      than the page and the greeting drifts and fades, so the band reads as a
      room behind the page. On desktop the wall and the greeting also shift a
      few pixels against each other as the cursor moves. Writes --scroll,
      --px and --py on <html>; evergreen.css does the moving.
   2. Spatial transitions. Following a link inside the app pushes the page
      back (it sinks and softens while the next one loads); the new page then
      comes forward into focus.
   3. Focus pull is pure CSS: when Ask Relève or a dialog opens, the page
      behind it sinks and blurs (evergreen.css).

   With reduced motion none of it runs. If this never runs, nothing moves. */

export default function Depth() {
  const pathname = usePathname();

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

  /* leaving: a click on an in-app link pushes the current page back */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    let timer = 0;
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!/^\/(app|console)(\/|$)/.test(url.pathname)) return;
      root.classList.add('page-leaving');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => root.classList.remove('page-leaving'), 4000);
    };
    document.addEventListener('click', click);
    return () => { document.removeEventListener('click', click); window.clearTimeout(timer); };
  }, []);

  /* arriving: the new page comes forward into focus */
  useEffect(() => {
    const root = document.documentElement;
    const was = root.classList.contains('page-leaving');
    root.classList.remove('page-leaving');
    if (!was || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const body = document.querySelector('main.main .page-body');
    if (!body) return;
    const wide = window.matchMedia('(min-width:901px)').matches;
    Array.from(body.children).forEach((el, i) => {
      if (getComputedStyle(el).position === 'fixed') return;
      (el as HTMLElement).animate(
        wide
          ? [{ opacity: 0, transform: 'perspective(1400px) translate3d(0,26px,-110px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }]
          : [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
        { duration: 820, delay: Math.min(i, 5) * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }
      );
    });
    const wall = document.querySelector('.topbar .band-light') as HTMLElement | null;
    wall?.animate([{ filter: 'blur(8px) brightness(.75)' }, { filter: 'blur(0) brightness(1)' }], { duration: 1200, easing: 'cubic-bezier(.16,1,.3,1)' });
  }, [pathname]);

  return null;
}
