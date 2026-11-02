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
  const rise=S(0,.06,s)*S(1,.93,s);
  const sunI=rise*(3.6+6.0*Math.pow(e,.6));
  const warm=Math.pow(1-e,1.6);
  const sunCol=mixv([1.0,.60,.42],[1.0,.40,.22],warm);
  const day=S(5.6,7.2,h)*S(20.6,19.2,h);
  const ambCol=mixv([.030,.040,.060],mixv([.13,.135,.13],[.15,.125,.10],warm*.7).map(x=>x*(.65+.45*e)),day);
  const lamp=1-S(6.2,7.6,h)*S(19.6,18.4,h);
  const lampCol=[.40,.24,.11].map(x=>x*lamp);
  const moonI=(1-day)*.42;
  // the patch: short and high in the morning, long and low toward evening
  const m=Math.min(1,Math.max(0,s));
  const sx=mix(.82,1.38,m*m), sy=mix(1.06,1.0,m), sh=mix(.10,-.12,m);
  const dx=mix(.13,-.01,Math.sqrt(m)), dy=mix(-.07,.03,e)+mix(0,-.02,m);
  const soft=mix(5,2,e);
  return {sunI,sunCol,ambCol,lampCol,moonI,xf:[sx,sy,sh,0],dxy:[dx,dy],soft};
}

export function hourNow(t: number): number {
  try {
    const q = new URLSearchParams(window.location.search).get('sun');
    const lapse = q && /^lapse(\d+)?$/.exec(q);
    if (lapse) return 5 + ((t / (Number(lapse[1]) || 60)) % 1) * 19;
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
