/* The sun shared by the whole app (2 November 2026). SunWall lights the
   header wall with it; sunShadow turns the same sun into the direction,
   length and colour of every shadow in the app, so cards, buttons and
   panels cast away from the light on the wall and their shadows lengthen
   and warm toward evening. */

export type V3 = [number, number, number];
export const S = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const mixv = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t) as V3;

export function lightAt(h: number) {
  // sun up 6:30, down 19:30
  const s=(h-6.5)/13, up=s>0&&s<1;
  const e=up?Math.sin(Math.PI*s):0;
  /* 5 Nov 2026: the patch is there from the first minutes after sunrise to the
     last before sunset, golden and long, as in life */
  const rise=S(-.004,.032,s)*S(1.004,.968,s);
  const sunI=rise*(3.6+6.0*Math.pow(e,.6));
  const warm=Math.pow(1-e,1.6);
  const sunCol=mixv([1.0,.66,.42],[1.0,.56,.24],warm);
  const day=S(5.6,7.2,h)*S(20.6,19.2,h);
  const ambCol=mixv([.030,.040,.060],mixv([.13,.135,.13],[.15,.125,.10],warm*.7).map(x=>x*(.65+.45*e)),day);
  const lamp=1-S(6.2,7.6,h)*S(19.6,18.4,h);
  const lampCol=[.40,.24,.11].map(x=>x*lamp);
  const moonI=(1-day)*.42;
  // the patch: short and high in the morning, long and low toward evening
  const m=Math.min(1,Math.max(0,s));
  /* the low sun throws the window long across the wall at both ends of the day */
  const sx=mix(.82,1.38,m*m)+.5*Math.pow(1-e,3)*(1-m), sy=mix(1.06,1.0,m), sh=mix(.10,-.12,m);
  const dx=mix(.13,-.01,Math.sqrt(m)), dy=mix(-.07,.03,e)+mix(0,-.02,m);
  const soft=mix(5,2,e);
  return {sunI,sunCol,ambCol,lampCol,moonI,xf:[sx,sy,sh,0],dxy:[dx,dy],soft};
}

export function hourNow(t: number): number {
  try {
    const q = new URLSearchParams(window.location.search).get('sun');
    const lapse = q && /^lapse(\d+)?$/.exec(q);
    if (lapse) return 5 + ((t / (Number(lapse[1]) || 60)) % 1) * 19;
    if (q === 'rise' || q === 'set') return sunTimes()[q];
    if (q !== null && q !== '' && !isNaN(Number(q))) return ((Number(q) % 24) + 24) % 24;
  } catch {}
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/* Shadow for a card resting one layer above the page.
   x, y: offset in px; b: blur in px; a: opacity; c: shadow colour; g: the
   colour of the light on lit edges; ga its strength; lx: which side is lit (-1 left .. 1 right). */
export function sunShadow(h: number) {
  const s = (h - 6.5) / 13;
  const e = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;
  const day = S(5.6, 7.2, h) * S(20.6, 19.2, h);
  const m = Math.min(1, Math.max(0, s));
  const side = (.5 - m) * 2;                 // morning +1: shadows fall right; evening -1: fall left
  const len = mix(1, 2.1, 1 - e);
  const x = mix(0, side * 13 * len, day);
  const y = mix(20, 9 + 9 * e, day);
  const b = mix(60, 34 + 10 * e, day);
  const a = mix(.24, .30 + .06 * e, day);
  const warm = Math.pow(1 - e, 1.6) * day;
  const c = mixv(mixv([18, 28, 34], [24, 40, 32], day), [40, 34, 26], warm * .5).map(Math.round);
  const g = mixv([210, 225, 240], mixv([255, 250, 236], [255, 214, 160], warm), day).map(Math.round);
  return { x, y, b, a, c, g, ga: mix(.25, .55 + .35 * warm, day), lx: -side * day };
}

/* The photographs take the same light (4 November 2026, Nona: "I want the
   backgrounds to change dependent on the time of day for the mobile app like
   it does for the website"). Every material tile, card and hero band is
   multiplied by this colour: clear daylight at midday, a soft gold low in the
   morning and evening, lavender at dusk, cool moonlight at night. sweep is how
   strongly the travelling band of sunlight shows on them. */
export function photoLight(h: number) {
  const s = (h - 6.5) / 13;
  const e = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;
  const day = S(5.6, 7.2, h) * S(20.6, 19.2, h);
  const warm = Math.pow(1 - e, 1.6) * day;
  const lit = mixv([255, 255, 255], [250, 233, 216], warm);
  /* sunrise and sunset: the photographs warm a touch toward gold (5 Nov 2026) */
  const tw = twilightAt(h);
  const tint = mixv([255, 238, 206], [255, 228, 190], tw.set / Math.max(1e-3, tw.rise + tw.set));
  const c = mixv(mixv([92, 104, 136], lit, day), tint, tw.g * .4).map(Math.round) as V3;
  return { c, day, sweep: mix(.1, .55 + .45 * e, day) };
}

/* ── The real sunrise and sunset (5 November 2026) ──
   Nona: "At sunrise and sunset, I want the background to show that it's
   sunrise and sunset in a subtle way... and with the sun, I want it to change
   on an hour-to-hour basis." The light used to assume the sun rose at 6:30
   and set at 19:30 every day of the year. It now works out the viewer's own
   sunrise and sunset for today, from their time zone (a city for the zones
   Relève works in, otherwise the zone's own longitude), and maps the clock onto
   the sun: sunrise is always the first light on the wall, sunset always the
   last, in Irvine in November as in Manila in June. */
const PLACES: Record<string, [number, number]> = {
  'America/Los_Angeles': [33.7, -117.8], 'America/Phoenix': [33.4, -112.1], 'America/Denver': [39.7, -105.0],
  'America/Chicago': [41.9, -87.6], 'America/New_York': [40.7, -74.0], 'America/Toronto': [43.7, -79.4],
  'America/Vancouver': [49.3, -123.1], 'America/Mexico_City': [19.4, -99.1], 'America/Monterrey': [25.7, -100.3],
  'America/Guatemala': [14.6, -90.5], 'America/Costa_Rica': [9.9, -84.1], 'America/Panama': [9.0, -79.5],
  'America/Bogota': [4.7, -74.1], 'America/Lima': [-12.0, -77.0], 'America/Caracas': [10.5, -66.9],
  'America/Santiago': [-33.4, -70.6], 'America/Argentina/Buenos_Aires': [-34.6, -58.4], 'America/Buenos_Aires': [-34.6, -58.4],
  'America/Sao_Paulo': [-23.5, -46.6], 'America/Montevideo': [-34.9, -56.2], 'America/Guayaquil': [-2.2, -79.9],
  'America/La_Paz': [-16.5, -68.1], 'America/Asuncion': [-25.3, -57.6], 'America/Santo_Domingo': [18.5, -69.9],
  'America/Puerto_Rico': [18.5, -66.1], 'America/El_Salvador': [13.7, -89.2], 'America/Tegucigalpa': [14.1, -87.2],
  'America/Managua': [12.1, -86.3], 'Asia/Manila': [14.6, 121.0], 'Europe/Rome': [41.9, 12.5],
  'Europe/London': [51.5, -0.1], 'Europe/Madrid': [40.4, -3.7], 'Europe/Paris': [48.9, 2.35], 'Pacific/Honolulu': [21.3, -157.9]
};

function place(d: Date): [number, number] {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && PLACES[tz]) return PLACES[tz];
  } catch {}
  /* unknown zone: its standard meridian, at a middling latitude */
  const y = d.getFullYear();
  const std = Math.max(-new Date(y, 0, 1).getTimezoneOffset(), -new Date(y, 6, 1).getTimezoneOffset()) / 60;
  return [35, std * 15];
}

/* Sunrise and sunset today, in hours on the viewer's own clock (NOAA's
   simplified solar equations; within a few minutes, which is all a wall needs). */
export function sunTimes(d = new Date()): { rise: number; set: number } {
  const [lat, lon] = place(d);
  const start = new Date(d.getFullYear(), 0, 0);
  const n = Math.floor((d.getTime() - start.getTime()) / 864e5);
  const g = 2 * Math.PI / 365 * (n - 1);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const dec = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const r = Math.PI / 180, la = lat * r;
  const cosH = Math.cos(90.833 * r) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec);
  const ha = Math.acos(Math.min(1, Math.max(-1, cosH))) / r;
  const off = -d.getTimezoneOffset();
  const rise = (720 - 4 * (lon + ha) - eq + off) / 60, set = (720 - 4 * (lon - ha) - eq + off) / 60;
  const w = (x: number) => ((x % 24) + 24) % 24;
  return { rise: w(rise), set: w(set) };
}

/* The clock on the sun's day: the light was drawn for a sun that rises at
   6:30 and sets at 19:30, so today's real sunrise is mapped to 6:30, today's
   sunset to 19:30, and the hours between (and the night) stretch to fit. */
export function solarHour(h: number, t = sunTimes()): number {
  const { rise, set } = t;
  const dayLen = ((set - rise) + 24) % 24 || 12;
  const since = ((h - rise) + 24) % 24;
  if (since <= dayLen) return 6.5 + 13 * since / dayLen;
  return (19.5 + 11 * (since - dayLen) / (24 - dayLen)) % 24;
}

/* Sunrise and sunset themselves: for about an hour either side of the real
   moment, faint golden streams of sunlight fall across the wall and the
   photographs warm a touch (Nona, 5 Nov 2026: "very subtle golden streams of
   sunlight like the sunrise cascading over the wall"; the first rose haze was
   rejected). Quiet by design: the light of the hour, never a filter. h is the
   solar hour (solarHour). */
export function twilightAt(h: number) {
  /* golden hour: strongest about half an hour after sunrise and before sunset */
  const rise = Math.exp(-Math.pow((h - 6.95) / .7, 2));
  const set = Math.exp(-Math.pow((h - 19.05) / .75, 2));
  const g = Math.max(rise, set);
  const c = mixv([255, 226, 172], [255, 206, 140], set / Math.max(1e-3, rise + set)).map(Math.round) as V3;
  return { rise, set, g, c };
}

/* Where the sun stands for the photographs: x from the left of the frame in the
   morning (shadows fall right) to the right in the evening, high at midday and
   low at either end; the band of light slants with it and takes its colour:
   soft gold at sunrise, crisp cream at midday, warm late in the day, deeper
   gold at sunset, a cool trace of moonlight at night. */
export function sunPlace(h: number) {
  const s = (h - 6.5) / 13;
  const e = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;
  const m = Math.min(1, Math.max(0, s));
  const day = S(5.6, 7.2, h) * S(20.6, 19.2, h);
  const side = (.5 - m) * 2;
  const tw = twilightAt(h);
  const warm = Math.pow(1 - e, 1.6) * day;
  let c = mixv([255, 250, 235], [255, 228, 200], warm);
  c = mixv(c, tw.c, tw.g * .75);
  c = mixv([196, 210, 236], c, day).map(Math.round) as V3;
  return {
    x: mix(-26, 26, m),                       // band offset, % of its width
    px: mix(14, 86, m),                       // the glow across a header, %
    py: mix(34, 6, e),                        // and its height: low at either end
    a: mix(105, side > 0 ? 128 : 82, 1 - e),  // slant of the band, degrees
    c
  };
}
