'use client';
import { useEffect, useState } from 'react';

/* The wall on phones (approved on the design canvas, 10 November 2026). Her photograph
   taken apart and set for a portrait screen: calm deep-green plaster, one clear window of
   light in the upper right, and the sprig's shadow as its own layer so it can sway. The
   light follows the viewer's clock the way the website's walls do: its angle, strength and
   warmth change through dawn, morning, midday, afternoon, golden hour, dusk and night; the
   plaster stays green at every hour. ?sun=18.5 previews an hour. Styles and the three
   photographs are in console.css (loaded on phones only, so desktop never downloads them);
   desktop keeps components/SunWall.tsx. Nothing here follows the finger or the cursor. */
const skyAt = (h: number) =>
  h < 5 ? 'night' : h < 7 ? 'dawn' : h < 11 ? 'morning' : h < 15 ? 'midday' : h < 17.5 ? 'afternoon' : h < 19.5 ? 'golden' : h < 21 ? 'dusk' : 'night';

export default function PhoneWall() {
  const [sky, setSky] = useState('midday');
  useEffect(() => {
    const read = () => {
      let h = new Date().getHours() + new Date().getMinutes() / 60;
      try {
        const q = new URLSearchParams(window.location.search).get('sun') ?? sessionStorage.getItem('rv-sun');
        if (q !== null && q !== '' && !Number.isNaN(Number(q))) { h = Number(q); sessionStorage.setItem('rv-sun', q); }
      } catch { /* the real clock */ }
      setSky(skyAt(((h % 24) + 24) % 24));
    };
    read();
    const t = window.setInterval(read, 60000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="cx-wall" data-sky={sky} aria-hidden="true">
      <i className="cx-wall-base" />
      <div className="cx-wall-pos">
        <div className="cx-wall-sun">
          <i className="cx-wall-light" />
          <div className="cx-wall-sway"><i className="cx-wall-leaves" /></div>
        </div>
      </div>
    </div>
  );
}
