'use client';
import { useEffect } from 'react';

/* Watches scroll position on phones and toggles a `.scrolled` class on the
   nearest `.shell` ancestor when the user scrolls past the hero greeting
   (roughly 80 px — just past where the topbar sits). This drives the
   transparent-to-cream header transition in palette.css. */

const THRESHOLD = 80;

export default function HeaderScroll() {
  useEffect(() => {
    if (window.matchMedia('(min-width:901px)').matches) return;

    const shell = document.querySelector('.shell');
    if (!shell) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        shell.classList.toggle('scrolled', window.scrollY > THRESHOLD);
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();                    // set initial state

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return null;
}
