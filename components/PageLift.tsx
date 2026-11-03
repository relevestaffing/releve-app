'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/* The Lift: how Relève moves between pages (Nona, 2 November 2026, chosen
   from three options in "Relève Page Transitions").

   Leaving: the blocks on screen rise toward the viewer and dissolve into soft
   focus, a few at a time, while a warm band of light crosses the wall.
   Arriving: the new page's blocks float up out of depth one after another
   (the CSS under html.rv-nav in app/evergreen.css, played by Motion.tsx).

   The wall, sidebar and page title never move. Only an in-app link to a
   different page plays it: not a new tab, a download, a modifier-click, a
   change of query string on the same page, or the back button (which gets
   only the arrival). With reduced motion it does nothing at all. If the
   navigation stalls, the old page is restored after two seconds rather than
   left dissolved.

   The between-pages loading screens (loading.tsx) were retired with this, on
   purpose: they replaced the whole screen, sidebar included, with a grey
   skeleton for as long as the next page took, which broke the motion. Now
   the wall, sidebar and title stay, the old cards stay lifted away, and a
   line of light runs along the top until the new page rises in. A cold
   launch is still covered by the splash. */

const BLOCKS = '.page-body > *:not(.stack):not(.grid-2):not(.grid-3):not(.grid-4):not(.match-grid):not(.match-layout),'
  + '.page-body > :is(.stack,.grid-2,.grid-3,.grid-4,.match-grid,.match-layout) > *';
const OUT = 'cubic-bezier(.55,0,.75,.25)';

export default function PageLift() {
  const router = useRouter();
  const pathname = usePathname();

  /* every arrival plays the deep rise; the class is dropped once it has landed */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('rv-going');
    if (!root.classList.contains('rv-nav')) return;
    const t = window.setTimeout(() => root.classList.remove('rv-nav'), 1800);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let leaving = false;

    const glint = () => {
      const g = document.querySelector<HTMLElement>('.rv-glint');
      g?.animate(
        [{ opacity: 0, backgroundPosition: '130% 0' }, { opacity: 1, offset: .35 }, { opacity: 0, backgroundPosition: '-30% 0' }],
        { duration: 950, easing: 'ease-in-out' });
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.closest('.side-foot-form') || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.dataset.noLift !== undefined) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (url.pathname.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return;

      document.documentElement.classList.add('rv-nav');
      if (calm.matches) return;               // arrival only, instantly, via CSS
      if (leaving) { e.preventDefault(); return; }

      const els = Array.from(document.querySelectorAll<HTMLElement>(BLOCKS)).filter(el => {
        if (el.matches('.quickbar,.mobile-action') || /fixed|sticky/.test(getComputedStyle(el).position)) return false;  // chrome stays put
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
      }).slice(0, 14);
      if (!els.length) return;

      e.preventDefault();
      leaving = true;
      const href = url.pathname + url.search + url.hash;
      router.prefetch(href);
      glint();
      const anims = els.map((el, i) => el.animate(
        [{ transform: 'none', opacity: 1, filter: 'blur(0px)' },
         { transform: 'perspective(1200px) translateZ(140px) translateY(-14px)', opacity: 0, filter: 'blur(6px)' }],
        { duration: 380, delay: i * 22, easing: OUT, fill: 'forwards' }));
      const from = window.location.pathname;
      /* The old page stays, dissolved, until the new one is ready (there is no
         loading.tsx to swap the whole screen for a skeleton), with a fine line
         of light running along the top while it waits. */
      window.setTimeout(() => { leaving = false; document.documentElement.classList.add('rv-going'); router.push(href); }, 380 + Math.min(els.length, 14) * 22 - 120);
      /* never leave a page dissolved if the navigation does not happen */
      window.setTimeout(() => {
        if (window.location.pathname === from) { anims.forEach(x => x.cancel()); document.documentElement.classList.remove('rv-nav', 'rv-going'); }
      }, 12000);
    };

    const onPop = () => document.documentElement.classList.add('rv-nav');
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('popstate', onPop); };
  }, [router]);

  return <><div className="rv-glint" aria-hidden="true" /><div className="rv-going-line" aria-hidden="true" /></>;
}
