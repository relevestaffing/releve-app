'use client';
import { useEffect, useRef } from 'react';
import './palette.css';
import { S, mix, lightAt, hourNow, sunShadow, photoLight, sunTimes, solarHour, twilightAt, sunPlace } from '@/lib/sun';

/* Phones follow the viewer's clock like the website (Nona, 4 Nov 2026: "I want the
   backgrounds to change dependent on the time of day for the mobile app like it
   does for the website"). This replaces the 3 Nov pin of phones at 22:00. */
/* 5 Nov 2026: mapped onto today's real sunrise and sunset (lib/sun.ts solarHour),
   worked out at most once a minute. */
let times = { at: -1e9, v: { rise: 6.5, set: 19.5 } };
const wallHour = (t: number) => {
  const now = Date.now();
  if (now - times.at > 60000) times = { at: now, v: sunTimes() };
  return solarHour(hourNow(t), times.v);
};

/* The window wall, lit by the sun of the viewer's own clock (Nona, 2 November
   2026: "I want it to have movement and the sun to move depending on the time
   of day"). It is her chosen photograph (option C, deep green plaster, late sun
   through a paned window, a sprig of leaf shadow) taken apart and relit live:

     /atmos/wall-plaster.webp   the plaster itself, troweled lime with grain,
                                photographed in Canva ("Relève app imagery", p11)
     /atmos/wall-sunlight.webp  the light from the photograph, traced into three
                                channels: R the window's light (its panes, bars
                                and the brightening toward the top right), G the
                                sprig's shadow, B the glow the light throws around
                                (scripts/sun/*.py)

   Each frame the window's light is laid on the plaster where the sun puts it:
   short and high in the morning, crisp and white at midday, long, low and amber
   toward evening, gone at dusk; after dark a faint cool moonlight through the
   same window and a warm lamp washing up from below. The plaster's grain rises
   where the sun grazes it, the sprig sways in a breeze, and now and then a cloud
   passes over. About 30 frames a second, paused when out of view; with reduced
   motion it holds still and only follows the clock. ?sun=17.5 shows any hour,
   ?sun=lapse runs a day in a minute (?sun=lapse30 in thirty seconds). Without WebGL the photograph stays. */

const VS = `attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const FS = `precision highp float;
varying vec2 v;
uniform sampler2D plaster,sun;
uniform vec2 res;          // canvas px
uniform vec2 focus;        // cover focus (like background-position)
uniform float zoom, t, veil, drift;
uniform vec4 xf;           // sx, sy, shear, unused
uniform vec2 dxy;          // translation of the patch (uv)
uniform vec3 sunCol, ambCol, lampCol;
uniform float sunI, moonI, soft, sway, cloud;
uniform vec3 dawn;         // x: how near the sun is to rising or setting (0..1)
const vec2 P=vec2(.997,.0); // pivot: top right corner of the window patch
vec2 warp(vec2 uv){vec2 q=uv-P-dxy; q.x/=xf.x; q.y=(q.y-xf.z*q.x)/xf.y; return P+q;}
float h1(float n){return fract(sin(n)*43758.5453);}
vec3 toLin(vec3 c){return pow(c,vec3(2.2));}
void main(){
  // cover-fit the 2:1 wall into the canvas, then a slow camera drift
  vec2 px=vec2(v.x,1.-v.y);
  float ca=res.x/res.y, ia=2.;
  vec2 sc= ca>ia? vec2(1.,ia/ca): vec2(ca/ia,1.);
  sc/=zoom;
  vec2 uv=focus*(1.-sc)+px*sc;
  uv+=vec2(sin(t*.021*drift),cos(t*.017*drift))*.009*drift;
  // plaster grain and mottle
  float g=(texture2D(plaster,uv).r-.5)/.9;
  // light through the window, moved by the sun
  vec2 w=warp(uv);
  vec2 o=vec2(soft/1600.,soft/800.);
  vec3 L=texture2D(sun,w).rgb*.4+ (texture2D(sun,w+vec2(o.x,0.)).rgb+texture2D(sun,w-vec2(o.x,0.)).rgb+texture2D(sun,w+vec2(0.,o.y)).rgb+texture2D(sun,w-vec2(0.,o.y)).rgb)*.15;
  float inb=step(0.,w.x)*step(w.x,1.)*step(0.,w.y)*step(w.y,1.);
  // the sprig sways about where its stem leaves the frame
  vec2 an=vec2(.95,.41); vec2 d=w-an;
  float a=sway*(sin(t*.83)*.6+sin(t*1.91+1.3)*.3+sin(t*3.7)*.1);
  vec2 wl=an+mat2(cos(a),sin(a),-sin(a),cos(a))*d + vec2(sin(t*2.3+w.y*40.),cos(t*1.7+w.x*35.))*.0007*sway*30.;
  float leaf=texture2D(sun,wl).g;
  float direct=L.r*2.2*(1.-leaf*.92)*inb;
  float bounce=L.b*inb;
  // ambient: darker toward the left and floor, a little lift near the light
  float amb=mix(.55,1.,smoothstep(-.1,.9,uv.x))*mix(1.,.75,smoothstep(.4,1.1,uv.y));
  // golden hour (5 Nov 2026, Nona: "Wall still needs to look green... what would
  // the green wall look like if the sunrise was shining thru"): the plaster
  // stays the same green; only the light changes. Low sun is golden and
  // strong, so where it lands the green reads as a warm glowing olive gold;
  // the shadows keep the cool green of the skylight, with only a little warm
  // bounce from the lit patch
  float gh=dawn.r;
  float lightNow=sunI*cloud*(1.+.6*gh);
  vec3 scol=mix(sunCol,vec3(1.,.60,.24),gh*.7);  // golden as the sun nears the horizon
  vec3 E=ambCol*amb + scol*lightNow*(direct + direct*direct*.15 + bounce*(.015+.02*gh) + .008*gh*amb) + vec3(.5,.6,.8)*moonI*direct;
  // lamp washing up from the lower right at night
  float lamp=exp(-pow(length((uv-vec2(.86,1.12))*vec2(1.,1.6))/.42,2.));
  E+=lampCol*lamp;
  // grain reads more where the sun grazes it
  float lit=clamp(direct,0.,1.);
  vec2 cell=floor(uv*vec2(2048.,1024.));
  float sp=h1(dot(cell,vec2(12.9898,78.233)))-.5;
  // golden light is soft on the plaster: less glitter in the grain
  float relief=g*(1.+1.8*lit*(1.-.35*dawn.r))+sp*.12*lit*(1.-.7*dawn.r);
  vec3 alb=vec3(.055,.10,.05)*exp(relief);
  vec3 c=alb*E;
  // Sunrise and sunset, as a camera sees them (Nona, 5 Nov 2026: "I want it
  // hyper realistic"). No drawn-on effect: the low sun's own light through the
  // window, a little more of what is physically there when the sun is low.
  //  - the beam in the air: the window's light seen in dust between the window
  //    and the wall, found by marching from each point toward the window
  //    through the same traced light (screen-space shafts, so they line up
  //    exactly with the panes and the sprig on the wall)
  //  - halation: the warm bloom a lens gives around a bright patch
  //  - a warm bounce off the lit plaster into the whole room
  vec2 toP=(P+dxy)-uv;
  float jit=h1(dot(gl_FragCoord.xy,vec2(7.13,3.71))+fract(t*.37));
  float vol=0.;
  for(int i=0;i<8;i++){
    float f=(float(i)+jit)/8.;
    vec2 ws=warp(uv+toP*f*.62);
    float ib=step(0.,ws.x)*step(ws.x,1.)*step(0.,ws.y)*step(ws.y,1.);
    vol+=texture2D(sun,ws).r*ib*(1.-f*.65);
  }
  vol/=8.;
  float dust=.86+.14*sin(uv.x*53.+t*.11)*sin(uv.y*41.-t*.08+1.3);
  c+=scol*lightNow*(vol*dust*(.0025+.010*gh) + bounce*(.0015+.009*gh) + .0016*gh);
  c=1.-exp(-c);                // soft film shoulder
  c=pow(c,vec3(1./2.2));
  // golden light is saturated: give the colour back that the film shoulder takes
  float lum=dot(c,vec3(.299,.587,.114));
  c=max(vec3(0.),mix(vec3(lum),c,1.+.25*gh));
  // veil so the greeting reads (screen space)
  float vl = veil<.5 ? mix(.6,0.,smoothstep(0.,.86,v.x))          // header, desktop: the greeting sits left
           : veil<1.5 ? mix(.30,.62,1.-v.y)                         // header, phone: the greeting sits low
           : veil<2.5 ? mix(.62,.28,smoothstep(0.,.9,v.x))          // sign-in and welcome: the card sits centre
           : veil<3.5 ? mix(.55,.12,smoothstep(0.,.8,v.x))          // the whole page, desktop: greeting left, cards over the wall
           : .27;                                                    // the whole page, phone (lifted 4 Nov so the hour shows)
  c*=1.-vl*.82;
  c+=(h1(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+t)-.5)*.018; // film grain
  gl_FragColor=vec4(c,1.);
}`;




const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src;
});

let snapAt = -1e9;

export default function SunWall({ room = false, page = false }: { room?: boolean; page?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  /* every shadow in the app follows this sun (see lib/sun.ts) */
  useEffect(() => {
    const root = document.documentElement;
    const t0 = performance.now();
    let lastKey = '';
    const apply = () => {
      const hr = wallHour((performance.now() - t0) / 1000), k = sunShadow(hr), ph = photoLight(hr), sp = sunPlace(hr);
      /* Writing to <html> restyles the whole page, so only when the shadow
         has actually moved enough to see (scroll performance, 2 Nov 2026). */
      const key = [Math.round(k.x), Math.round(k.y), Math.round(k.b / 2), k.a.toFixed(2), k.c.join(','), k.lx.toFixed(1), ph.c.join(','), ph.sweep.toFixed(2), Math.round(sp.x), Math.round(sp.px), Math.round(sp.py), Math.round(sp.a), sp.c.join(',')].join('|');
      if (key === lastKey) return;
      lastKey = key;
      const st = root.style;
      st.setProperty('--shx', k.x.toFixed(1) + 'px'); st.setProperty('--shy', k.y.toFixed(1) + 'px');
      st.setProperty('--shb', k.b.toFixed(1) + 'px'); st.setProperty('--sha', k.a.toFixed(3));
      st.setProperty('--shc', k.c.join(',')); st.setProperty('--glow', k.g.join(','));
      st.setProperty('--gla', k.ga.toFixed(3)); st.setProperty('--lx', k.lx.toFixed(3));
      st.setProperty('--tod', ph.c.join(',')); st.setProperty('--sweep', ph.sweep.toFixed(3)); st.setProperty('--day', ph.day.toFixed(3));
      /* where the sun stands on the photographs and headers (5 Nov 2026) */
      st.setProperty('--sunx', sp.x.toFixed(1)); st.setProperty('--sunpx', sp.px.toFixed(1) + '%');
      st.setProperty('--sunpy', sp.py.toFixed(1) + '%'); st.setProperty('--suna', sp.a.toFixed(1)); st.setProperty('--sunc', sp.c.join(','));
    };
    apply();
    let fast = false;
    try { fast = /^lapse/.test(new URLSearchParams(window.location.search).get('sun') || ''); } catch {}
    const id = window.setInterval(apply, fast ? 400 : 5 * 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stop = () => {};
    let dead = false;
    (async () => {
      let imgs: HTMLImageElement[];
      try { imgs = await Promise.all([load('/atmos/wall-plaster.webp'), load('/atmos/wall-sunlight.webp')]); } catch { return; }
      if (dead) return;
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
      if (!gl) return;
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
        return s;
      };
      let pr: WebGLProgram;
      try {
        pr = gl.createProgram()!;
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
      } catch { return; }
      gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U: Record<string, WebGLUniformLocation | null> = {};
      ['plaster', 'sun', 'res', 'focus', 'zoom', 't', 'veil', 'drift', 'xf', 'dxy', 'sunCol', 'ambCol', 'lampCol', 'sunI', 'moonI', 'soft', 'sway', 'cloud', 'dawn']
        .forEach(n => { U[n] = gl.getUniformLocation(pr, n); });
      imgs.forEach((img, unit) => {
        const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      });
      gl.uniform1i(U.plaster, 0); gl.uniform1i(U.sun, 1);
      const phone = window.matchMedia('(max-width:900px)');
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
      /* passing clouds on a slow random schedule: most minutes clear */
      const cloudAt = (t: number) => {
        const k = Math.floor(t / 70), f = t / 70 - k, r = Math.abs(Math.sin(k * 91.7) * 43758.5) % 1;
        if (r < .5) return 1;
        return 1 - S(.15, .4, f) * S(.95, .65, f) * mix(.3, .65, r);
      };
      let raf = 0, last = -1e9, visible = true, shown = false, busyUntil = 0;
      const t0 = performance.now();
      /* Smoothness (2 Nov 2026, Nona: "it keeps glitching when I try to
         scroll"). The wall is fixed, so it never needs a new frame while the
         page scrolls: drawing pauses during any scroll, wheel or touch and
         for a moment after, and the browser keeps all of its time for the
         scroll. Between scrolls it draws about 24 times a second, and at a
         pixel budget (about 0.6 megapixels) the soft plaster and light do
         not need more of: the canvas is scaled up by the browser for free. */
      const busy = () => { busyUntil = performance.now() + 260; };
      window.addEventListener('scroll', busy, { passive: true, capture: true });
      window.addEventListener('wheel', busy, { passive: true });
      window.addEventListener('touchmove', busy, { passive: true });
      const BUDGET = page ? 600000 : 420000;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const still = calm.matches;
        if (!visible || now < busyUntil || now - last < (still ? 30000 : 41)) return;
        last = now;
        const cw = canvas.clientWidth, ch = canvas.clientHeight;
        if (!cw || !ch) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(BUDGET / (cw * ch)));
        const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
        if (!w || !h) return;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
        const t = (now - t0) / 1000, hr = wallHour(t), L = lightAt(hr), mob = phone.matches;
        const tw = twilightAt(hr);
        gl.uniform3f(U.dawn, tw.g, 0, 0);
        gl.uniform2f(U.res, w, h);
        gl.uniform2f(U.focus, room ? .85 : mob ? .82 : 1, page ? .35 : .45);
        gl.uniform1f(U.zoom, 1.05);
        gl.uniform1f(U.t, still ? 0 : t);
        gl.uniform1f(U.veil, page ? (mob ? 4 : 3) : room ? 2 : mob ? 1 : 0);
        /* The sign-in page is the first thing anyone sees, so the light there
           visibly travels: the camera drifts, the window's light glides slowly
           across the plaster and back (about a minute each way) and the sprig
           moves more. Elsewhere it stays quiet so it never distracts from work. */
        const lively = room && !still;
        gl.uniform1f(U.drift, lively ? 3.2 : 1);
        gl.uniform4fv(U.xf, L.xf);
        gl.uniform2f(U.dxy, L.dxy[0] + (lively ? Math.sin(t * .055) * .045 : 0), L.dxy[1] + (lively ? Math.sin(t * .041 + 1.1) * .018 : 0));
        gl.uniform3fv(U.sunCol, L.sunCol); gl.uniform3fv(U.ambCol, L.ambCol); gl.uniform3fv(U.lampCol, L.lampCol);
        gl.uniform1f(U.sunI, L.sunI); gl.uniform1f(U.moonI, L.moonI); gl.uniform1f(U.soft, L.soft);
        gl.uniform1f(U.sway, still ? 0 : lively ? .13 : .05); gl.uniform1f(U.cloud, still ? 1 : cloudAt(t));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!shown) {
          shown = true; canvas.classList.add('on');
          /* the live wall fades in over the photo; only once it is fully in
             is the photo underneath let go (no dark gap between the two) */
          window.setTimeout(() => canvas.classList.add('lit'), 1600);
          /* Keep a still of this exact wall on the page root, so the next
             page and the loading screen open on the same light instead of a
             darker photograph (read in the same frame it was drawn). At most
             every two minutes; it takes a few milliseconds. */
          if (page && performance.now() - snapAt > 120000) {
            try {
              snapAt = performance.now();
              const url = canvas.toDataURL('image/jpeg', .82);
              document.documentElement.style.setProperty('--wall-snap', `url(${url}) center / 100% 100% no-repeat`);
            } catch { /* a wall that cannot be read just keeps the photo */ }
          }
        }
      };
      const io = new IntersectionObserver(es => { visible = es[0].isIntersecting && document.visibilityState === 'visible'; });
      io.observe(canvas);
      const vis = () => { visible = document.visibilityState === 'visible'; if (visible) last = -1e9; };
      document.addEventListener('visibilitychange', vis);
      raf = requestAnimationFrame(frame);
      stop = () => {
        cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', vis);
        window.removeEventListener('scroll', busy, { capture: true } as any); window.removeEventListener('wheel', busy); window.removeEventListener('touchmove', busy);
      };
    })();
    return () => { dead = true; stop(); };
  }, [room, page]);
  return <canvas ref={ref} className={page ? 'sun-wall sun-page' : room ? 'sun-wall sun-room' : 'sun-wall'} aria-hidden="true" />;
}
