'use client';
import { useEffect, useRef } from 'react';

/* The header as moving water (Nona, 2 November 2026: "it needs to be hyper
   realistic, it needs to imitate water moving", with her reference of long
   lines of sunlight thrown off water onto a wall).

   This is footage, not an effect drawn live. The light was simulated
   physically, once, offline: an ocean-spectrum water surface refracts
   parallel sunlight and every ray is traced to where it lands on the wall
   (scripts/water/), which is what makes the bright lines focus, split and
   travel the way real water light does. The wall is seen at a raking angle,
   so the light recedes into depth: lines converge and soften with
   distance, catch the relief of a real plaster surface, and split very
   slightly into warm and cool edges as real refracted light does. Played
   at a slow, calm pace; the wave frequencies are locked to the loop, so
   the 20-second clip loops without a seam. Graded in Relève's greens:
   /atmos/water.mp4, about 2 MB (scripts/water/sim.py, comp2.py).

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
      autoPlay muted loop playsInline preload="auto" disablePictureInPicture poster="/atmos/water-poster.webp">
      <source src="/atmos/water.mp4" type="video/mp4" />
    </video>
  );
}
