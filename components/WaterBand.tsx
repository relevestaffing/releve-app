'use client';
import { useEffect, useRef } from 'react';

/* The header as moving water (Nona, 2 November 2026: "I want it to move
   like water"). A small WebGL shader draws the band as looking down into a
   pool lined with dark emerald stone: the stone refracts through the moving
   surface, and the light the surface focuses (caustics) ripples across it,
   brightest in the sunlit upper right and falling away to the left where
   the title sits. Moving the pointer across it disturbs the water.

   Cheap by construction: drawn at a reduced resolution, about 30 frames a
   second, paused when the tab is hidden or the band scrolls out of view.
   With reduced motion, or no WebGL, the canvas is never shown and the CSS
   band underneath (the stone photograph with drifting light) stands in.

   The noise is Ashima Arts' simplex noise (webgl-noise, MIT licence,
   Ian McEwan / Stefan Gustavson). */

const VERT = `attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;

const FRAG = `precision mediump float;
varying vec2 v;
uniform sampler2D stone;
uniform float t;
uniform vec2 res;
uniform vec2 ptr;
uniform float stir;
uniform vec2 imgAspect;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;
  vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);
}
float height(vec2 p){
  return snoise(p*1.1+vec2(t*.05,t*.03))*.6+snoise(p*2.3-vec2(t*.07,-t*.04))*.3+snoise(p*4.7+vec2(-t*.11,t*.09))*.1;
}
float ridge(vec2 p){return 1.-abs(snoise(p));}
/* Long lines of light, the way sun through a rippled surface lays itself
   across a wall (Nona's reference): sets of long, nearly parallel
   filaments, each one wavering gently along its length, brightening and
   fading as it travels, with a soft glow around it. Two sets at slightly
   different angles cross the way real caustics do. Lines are drawn
   explicitly (distance to the nearest filament), not as noise contours,
   so they stay long and never curl into loops. */
vec2 rot(vec2 p,float a){return mat2(cos(a),-sin(a),sin(a),cos(a))*p;}
float strand(vec2 p,float freq,float seed,float speed){
  float wob=snoise(vec2(p.x*.42,p.y*.18)+vec2(seed,t*.05))*1.15+snoise(vec2(p.x*1.1,p.y*.4)+vec2(-t*.07,seed))*.35;
  float ph=p.y*freq+wob+t*speed;
  float d=abs(fract(ph)-.5);d=.5-d;
  float core=exp(-d*d*900.);
  float halo=exp(-d*d*60.)*.16;
  float life=smoothstep(-.35,.75,snoise(vec2(p.x*.35,p.y*.9)+vec2(seed*1.7,t*.08)));
  return (core+halo)*life;
}
float caustic(vec2 q){
  vec2 p=rot(q,-.5);
  p.y*=mix(1.,1.6,v.y);
  float a=strand(p,4.2,1.3,.22);
  float b=strand(rot(p,.22)+vec2(4.,1.),3.3,7.9,-.16)*.75;
  float c=strand(rot(p,-.15)+vec2(-3.,2.),4.6,13.1,.30)*.4;
  return a+b+c+a*b*1.4;
}
void main(){
  vec2 asp=vec2(res.x/res.y,1.);
  vec2 q=v*asp*1.1;
  float e=.02;
  float h=height(q);
  vec2 grad=vec2(height(q+vec2(e,0.))-h,height(q+vec2(0.,e))-h)/e;
  vec2 d=v-ptr;d.x*=res.x/res.y;float r=length(d);
  float ring=sin(r*48.-t*6.)*exp(-r*6.)*stir;
  grad+=normalize(d+1e-4)*ring*1.6;
  /* the wall: smooth deep fern plaster, the photograph only as a whisper of grain */
  vec2 iu=((v+grad*.004)-.5)*imgAspect+.5;
  vec3 st=texture2D(stone,vec2(iu.x,1.-iu.y)).rgb;
  vec3 wall=mix(vec3(.05,.08,.064),vec3(.15,.20,.17),smoothstep(-.1,1.1,v.x*.8+v.y*.4));
  wall=mix(wall,wall*(.78+st*1.4),.3);
  float c=caustic(q+grad*.012);
  float sun=smoothstep(2.1,.1,distance(v*asp,vec2(.92*asp.x,1.)));
  float reach=mix(.42,1.,smoothstep(.0,.6,v.x));
  vec3 light=mix(vec3(.60,.77,.63),vec3(.94,.90,.74),sun*.75);
  vec3 col=wall*(.85+.3*sun)+light*c*(.18+.75*sun)*reach;
  col+=light*ring*.05;
  gl_FragColor=vec4(col,1.);
}`;

export default function WaterBand({ src = '/atmos/emerald-stone.webp' }: { src?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return;

    const sh = (type: number, s: string) => { const o = gl.createShader(type)!; gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uT = U('t'), uRes = U('res'), uPtr = U('ptr'), uStir = U('stir'), uAsp = U('imgAspect');

    const tex = gl.createTexture();
    let imgW = 2, imgH = 1, ready = false;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      imgW = img.naturalWidth; imgH = img.naturalHeight; ready = true;
      canvas.classList.add('on');
    };
    img.src = src;

    let w = 0, h = 0;
    const size = () => {
      const r = canvas.getBoundingClientRect();
      const scale = Math.min(1, 900 / Math.max(1, r.width)) * 0.6;
      w = Math.max(2, Math.round(r.width * scale)); h = Math.max(2, Math.round(r.height * scale));
      canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(canvas);

    /* the pointer stirs the water; the ripple settles on its own */
    const ptr = { x: .8, y: .7 }; let stir = 0;
    const host = canvas.parentElement!;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ptr.x = (e.clientX - r.left) / r.width; ptr.y = 1 - (e.clientY - r.top) / r.height;
      stir = Math.min(1, stir + .08);
    };
    host.addEventListener('pointermove', onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0]?.isIntersecting ?? true; }, { threshold: 0 });
    io.observe(canvas);

    let raf = 0, last = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!ready || !visible || document.hidden || now - last < 33) return;
      last = now;
      stir *= .965;
      const ca = w / h, ia = imgW / imgH;
      /* cover: scale the shorter side of the photograph to the band */
      const ax = ca > ia ? 1 : ca / ia, ay = ca > ia ? ia / ca : 1;
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.uniform2f(uRes, w, h);
      gl.uniform2f(uPtr, ptr.x, ptr.y);
      gl.uniform1f(uStir, stir);
      gl.uniform2f(uAsp, ax, ay);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      host.removeEventListener('pointermove', onMove);
      const lose = gl.getExtension('WEBGL_lose_context'); lose?.loseContext();
    };
  }, [src]);

  return <canvas ref={ref} className="water-band" aria-hidden="true" />;
}
