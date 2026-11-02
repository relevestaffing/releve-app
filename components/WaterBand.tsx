'use client';
import { useEffect, useState } from 'react';

/* The header as a wall in a sunlit room (Nona, 2 November 2026: the fluted
   plaster wall, "but it changes based off the time of day").

   A reeded limewash wall in Relève green, rendered physically, once,
   offline (scripts/wall/flute.py, moments in keys.json): a heightfield of
   half-round reeds with real plaster grain from a photograph, sunlight
   coming through a two-light window with ray-marched soft shadows between
   the reeds, ambient occlusion, sky and floor bounce, then seen in
   perspective through a lens. Eight moments of the day, each also
   rendered with a cloud over the sun:

     00:00 night        floor washers graze warm light up the reeds
     05:30 dawn         first soft light
     07:30 morning      low sun from the left, long shadows
     10:00 late morning
     13:00 midday       high sun, short shadows
     16:00 afternoon    sun from the right
     18:30 golden hour  low amber sun
     20:00 dusk         the sun gone, the lamps coming up

   The page shows the viewer's own clock: the two moments either side of
   now are layered and blended by how far between them it is, re-checked
   every half minute, so over a working session the light visibly crosses
   the wall. Now and then a cloud passes over the sun. With reduced
   motion the cloud and the slow drift are off; the time of day still
   applies. ?wall=18.5 (any hour) previews another time. */

type Key = { at: number; name: string; cloud: boolean };
const KEYS: Key[] = [
  { at: 0, name: '0000-night', cloud: false },
  { at: 330, name: '0530-dawn', cloud: true },
  { at: 450, name: '0730-morning', cloud: true },
  { at: 600, name: '1000-late', cloud: true },
  { at: 780, name: '1300-midday', cloud: true },
  { at: 960, name: '1600-afternoon', cloud: true },
  { at: 1110, name: '1830-golden', cloud: true },
  { at: 1200, name: '2000-dusk', cloud: false },
  { at: 1320, name: '0000-night', cloud: false },
  { at: 1440, name: '0000-night', cloud: false }
];
const src = (n: string) => `/atmos/wall/${n}.webp`;

function moment(minutes: number) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].at <= minutes) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = Math.min(1, Math.max(0, (minutes - a.at) / (b.at - a.at)));
  /* ease the blend so each moment holds a little before giving way */
  const e = f * f * (3 - 2 * f);
  return { a, b, f: e };
}

function nowMinutes(): number {
  try {
    const q = new URLSearchParams(window.location.search).get('wall');
    if (q !== null && !isNaN(Number(q))) return ((Number(q) % 24) + 24) % 24 * 60;
  } catch {}
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export default function WaterBand() {
  /* Midday until the browser knows its own clock, so the server render
     and the first paint agree. */
  const [m, setM] = useState<number>(780);
  useEffect(() => {
    setM(nowMinutes());
    const id = window.setInterval(() => setM(nowMinutes()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const { a, b, f } = moment(m);
  const lead = f < 0.5 ? a : b;
  return (
    <div className="time-wall" aria-hidden="true">
      <img className="tw-a" src={src(a.name)} alt="" decoding="async" />
      {a.name !== b.name && <img className="tw-b" src={src(b.name)} alt="" decoding="async" style={{ opacity: f }} />}
      {lead.cloud && <img className="tw-cloud" src={src(lead.name + '-cloud')} alt="" decoding="async" loading="lazy" />}
    </div>
  );
}
