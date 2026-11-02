'use client';
import { useEffect, useRef } from 'react';

/* The header as the light and shadow of moving water (Nona, 2 November
   2026: the references she loves show not the water but the light it
   throws, rippling across a wall, "especially the orange pictures").

   Footage rendered once, offline (scripts/water/caus.py): a wind-driven
   water surface (long swells plus fine ripples) refracts sunlight, and
   every ray is traced to the wall it lands on and gathered there (photon
   mapping), so the light focuses into bright lines that split and travel
   as real water light does. The sun's size softens the lines; the wall is
   fern plaster seen in steep perspective, so the pattern recedes into
   depth and leans to the left; the light falls from the upper right and
   fades toward the title. Graded deep green in the shadows to warm cream
   in the light, with a soft bloom. Slow, and the wave frequencies are
   locked to the loop, so it repeats without a seam.

   Muted, inline and looped, so it autoplays on phones. Paused when the
   band is off screen or the tab is hidden. With reduced motion the still
   poster frame shows instead. */
export default function WaterBand() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); return; }
    const play = () => { const p = v.play(); if (p) p.catch(() => {}); };
    const io = new IntersectionObserver(es => { if (es[0]?.isIntersecting && !document.hidden) play(); else v.pause(); }, { threshold: 0 });
    io.observe(v);
    const vis = () => { if (document.hidden) v.pause(); else play(); };
    document.addEventListener('visibilitychange', vis);
    const on = () => v.classList.add('on');
    v.addEventListener('playing', on);
    if (!v.paused) on();
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis); v.removeEventListener('playing', on); };
  }, []);

  return (
    <video ref={ref} className="water-band" aria-hidden="true" tabIndex={-1}
      autoPlay muted loop playsInline preload="auto" disablePictureInPicture poster="/atmos/light-poster.webp">
      <source src="/atmos/light.mp4" type="video/mp4" />
    </video>
  );
}
