'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/* The app's motion, applied once rather than page by page.
   -------------------------------------------------------
   There are thirty-odd pages. Marking up each one with reveal classes would
   mean thirty-odd files to keep in step, and the first page anybody added
   afterwards would be the one that sat still. So this finds the blocks that
   make up a page and primes them, which means a page written next month
   inherits the behaviour without knowing this file exists.

   Ported from the website's own observer: same threshold, same one-shot
   unobserve, same stagger. The two should feel like one product.

   Nothing here decides whether content is visible — the CSS does, gated on
   html.js, which is set before first paint. If this component never runs, the
   app looks exactly as it did before any of this was added. */

/* Every direct child of the page body is a block, with one exception: a
   handful of classes are pure layout wrappers (a two-up grid, a vertical
   stack) with no visual identity of their own — animating the wrapper as a
   unit would just make its first real child jump. Those get skipped and
   their own children are used instead, one level down.

   This used to be a fixed whitelist (only cards, only the setup checklist,
   a couple of others) built up screen by screen, which is exactly why most
   of the app never animated at all — anything shaped differently sat
   outside the list. This is deliberately generic instead: any block on any
   page qualifies, and only the wrapper classes are named as exceptions.

   Must match the selector list in globals.css exactly. Kept in both places
   because the stylesheet has to hide them before this file exists — but they
   are the same set, and changing one without the other means either blocks
   that never appear or blocks that never animate. */
const WRAPPERS = ['.stack', '.grid-2', '.grid-3', '.grid-4', '.match-grid', '.match-layout'];
const BLOCKS = [
  `.page-body > *${WRAPPERS.map(w => `:not(${w})`).join('')}`,
  ...WRAPPERS.map(w => `.page-body > ${w} > *`),
  '.rv'
].join(',');

export default function Motion() {
  const pathname = usePathname();
  /* False on the very first run of this component, true on every run after —
     which, since this only re-runs when the route changes, means "this is a
     client-side navigation, not the page loading cold." */
  const hasMounted = useRef(false);

  useEffect(() => {
    const cameFromNav = hasMounted.current;
    hasMounted.current = true;

    document.documentElement.classList.add('rv-live');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const bar = document.querySelector('.topbar');
    const onScroll = () => {
      if (bar) bar.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const pageBody = document.querySelector('.page-body');

    /* Reduced motion still needs every block revealed — the stylesheet has
       already hidden them. It simply happens instantly, including for
       anything that shows up after this first pass (see the note on the
       mutation observer below). */
    if (reduced) {
      const revealAll = () => document.querySelectorAll(BLOCKS).forEach(el => el.classList.add('in'));
      revealAll();
      const mo = pageBody ? new MutationObserver(revealAll) : null;
      mo?.observe(pageBody!, { childList: true, subtree: true });
      return () => {
        window.removeEventListener('scroll', onScroll);
        mo?.disconnect();
      };
    }

    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
          entries.forEach(e => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io!.unobserve(e.target);
            }
          });
        }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' })
      : null;

    /* Whether a block still needs handling is read off its own classes, not
       tracked in a side list — because a block that already went through
       settle() can lose those classes without becoming a new element. A
       component that renders a loading placeholder and then its real
       content as two different className values on the *same* underlying
       node (an early "if (!loaded) return <div className=empty>" followed
       later by "return <div className=card>") keeps the same DOM element
       across that swap, and React writes the new className as a plain
       string — which replaces the whole attribute, stagger and .in classes
       included. The element is not new, but it is unprimed again, and a
       WeakSet of "already seen" nodes would call it done forever. Checking
       the classes themselves catches this: anything without a stagger class
       or .in gets (re)primed, whether this is its first appearance or its
       second. */
    const primed = (el: Element) =>
      el.classList.contains('in') || Array.from(el.classList).some(c => /^rv-d[1-6]$/.test(c));
    let seq = 0;

    /* asNav: true if this content should play its rise even though it is
       already on screen — true for a client-side navigation (the whole new
       page lands above the fold at once; skipping the animation there would
       mean switching pages never visibly moves) and true for anything that
       shows up after the page has already settled (a calendar connection
       status, an availability grid — components that render a placeholder
       first and swap in their real block once their own data arrives; by
       the time that happens the cold-load moment is long past, so it reads
       as new content, not as the page loading). False only for the one
       case that should stay instant: blocks already on screen on a true
       cold load, where fading in what the user is looking at before the
       page is even interactive reads as slow, not polished. */
    function settle(els: HTMLElement[], asNav: boolean) {
      const onScreenAtLoad = els.map(el => {
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      });

      els.forEach((el, i) => {
        el.classList.add(`rv-d${Math.min(seq++ % 6 + 1, 6)}`);

        if (onScreenAtLoad[i] || !io) {
          if (asNav && io) {
            /* Force the browser to paint the hidden state before flipping to
               visible — a class added in the same tick it was hidden can get
               coalesced into one frame, which is silent, not fast. */
            requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
          } else {
            el.classList.add('in');
          }
          return;
        }
        io.observe(el);
      });
    }

    settle(Array.from(document.querySelectorAll<HTMLElement>(BLOCKS)).filter(el => !primed(el)), cameFromNav);

    /* Not every block is ready at mount, and not every block that was ready
       stays ready. A component that loads its own data — calendar status,
       an availability grid, anything that renders a placeholder first —
       adds its real markup a tick later, after this effect's one-time query
       has already run; and, per the note above, the swap from placeholder
       to real content can also strip the classes from a block that was
       already primed. Either way it shows up here as "matches BLOCKS, not
       currently primed" on the next mutation, and gets settled like
       anything else that just appeared. */
    const mo = pageBody
      ? new MutationObserver(() => {
          const needsSettling = Array.from(document.querySelectorAll<HTMLElement>(BLOCKS)).filter(el => !primed(el));
          if (needsSettling.length) settle(needsSettling, true);
        })
      : null;
    mo?.observe(pageBody!, { childList: true, subtree: true });

    /* Deliberately does not strip .in on the way out. A stale .in means
       "visible", which is the safe state; stripping it would hide anything
       that survives a client navigation for the frame between this cleanup
       and the next effect. The observers are what need releasing. */
    return () => {
      window.removeEventListener('scroll', onScroll);
      io?.disconnect();
      mo?.disconnect();
    };
  }, [pathname]);

  return null;
}
