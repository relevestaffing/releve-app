/* Relève: the window wall behind the website's page headers (3 November 2026).
   Nona: "on the website headers, I want to replicate the moving background
   with the plaster that we have in the app that changes depending on the time
   of day", for the green headers (Talent, Process, Pricing, About...). This is
   the app's SunWall (releve-app components/SunWall.tsx, lib/sun.ts) in plain
   JavaScript: the green plaster photograph relit live by the sun of the
   visitor's own clock, the window's light short and high in the morning, long
   and amber toward evening, moonlight and a warm lamp at night, a sprig of
   leaf shadow swaying, a cloud now and then. One canvas moves to whichever
   header is on screen; it rests while the page scrolls and when out of view.
   Reduced motion holds it still. Without WebGL the photograph stays (CSS).
   ?sun=17.5 previews an hour; ?sun=lapse30 runs a day in thirty seconds. */
(function () {
  'use strict';
  var heroes = document.querySelectorAll('.page-hero, .hero.wall-dark, .hero.wall-light');
  if (!heroes.length || !window.WebGLRenderingContext) return;

  var VS = `attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
  var FS = `precision highp float;
varying vec2 v;
uniform sampler2D plaster,sun;
uniform vec2 res;          // canvas px
uniform vec2 focus;        // cover focus (like background-position)
uniform float zoom, t, veil, drift;
uniform vec4 xf;           // sx, sy, shear, unused
uniform vec2 dxy;          // translation of the patch (uv)
uniform vec3 sunCol, ambCol, lampCol;
uniform float sunI, moonI, soft, sway, cloud, tone;
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
  vec3 E=ambCol*amb + sunCol*(sunI*cloud)*(direct + direct*direct*.15 + bounce*.015) + vec3(.5,.6,.8)*moonI*direct;
  // lamp washing up from the lower right at night
  float lamp=exp(-pow(length((uv-vec2(.86,1.12))*vec2(1.,1.6))/.42,2.));
  E+=lampCol*lamp;
  // grain reads more where the sun grazes it
  float lit=clamp(direct,0.,1.);
  vec2 cell=floor(uv*vec2(2048.,1024.));
  float sp=h1(dot(cell,vec2(12.9898,78.233)))-.5;
  float relief=(g*(1.+1.8*lit)+sp*.12*lit)*(veil>6.5?.5:1.);   // home page on a phone: the grain is shown close up, so half
  vec3 alb=vec3(.055,.10,.05)*exp(relief);
  vec3 c=alb*E;
  c=1.-exp(-c);                // soft film shoulder
  c=pow(c,vec3(1./2.2));
  // the light version (tone 1): pale limewash, the same window light and leaf shadow on it
  if(tone>.5){
    float sv=clamp(sunI*cloud/7.,0.,1.);
    float dl=clamp(direct,0.,1.3);
    vec3 cream=vec3(.925,.912,.872);
    float shade=.84+.20*dl*sv+.05*bounce*sv+.06*dl*moonI-.05*(1.-amb);
    vec3 warmth=mix(vec3(1.),vec3(1.06,.99,.88),dl*sv*(sunCol.b<.3?1.:.6));
    c=cream*shade*warmth*exp(relief*.06);
    c=pow(c,vec3(1.04));
    c+=(h1(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+t)-.5)*.012;
    gl_FragColor=vec4(c,1.);
    return;
  }
  // veil so the greeting reads (screen space)
  float vl = veil<.5 ? mix(.6,0.,smoothstep(0.,.86,v.x))          // header, desktop: the greeting sits left
           : veil<1.5 ? mix(.30,.62,1.-v.y)                         // header, phone: the greeting sits low
           : veil<2.5 ? mix(.62,.28,smoothstep(0.,.9,v.x))          // sign-in and welcome: the card sits centre
           : veil<3.5 ? mix(.55,.12,smoothstep(0.,.8,v.x))          // the whole page, desktop: greeting left, cards over the wall
           : veil<4.5 ? .38                                          // the whole page, phone
           : veil<5.5 ? mix(.58,.26,smoothstep(0.,.85,length((v-vec2(.5,.5))*vec2(1.5,1.))))  // website page header: the words sit centre
           : veil<6.5 ? .54                                          // website page header, phone: the words cover it
           : veil<7.5 ? mix(.28,.74,smoothstep(.08,.62,1.-v.y))       // home page, phone: light at the top, calm dark plaster under the words
           : .70;                                                    // a tall text-heavy hero on a phone (Discovery): evenly calm
  c*=1.-vl*.82;
  c+=(h1(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+t)-.5)*.018; // film grain
  gl_FragColor=vec4(c,1.);
}`;

  function S(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function mixv(a, b, t) { return a.map(function (x, i) { return x + (b[i] - x) * t; }); }
  function lightAt(h) {
    var s = (h - 6.5) / 13, up = s > 0 && s < 1;
    var e = up ? Math.sin(Math.PI * s) : 0;
    var rise = S(0, .06, s) * S(1, .93, s);
    var sunI = rise * (3.6 + 6.0 * Math.pow(e, .6));
    var warm = Math.pow(1 - e, 1.6);
    var sunCol = mixv([1.0, .60, .42], [1.0, .40, .22], warm);
    var day = S(5.6, 7.2, h) * S(20.6, 19.2, h);
    var ambCol = mixv([.030, .040, .060], mixv([.13, .135, .13], [.15, .125, .10], warm * .7).map(function (x) { return x * (.65 + .45 * e); }), day);
    var lamp = 1 - S(6.2, 7.6, h) * S(19.6, 18.4, h);
    var lampCol = [.40, .24, .11].map(function (x) { return x * lamp; });
    var moonI = (1 - day) * .42;
    var m = Math.min(1, Math.max(0, s));
    var sx = mix(.82, 1.38, m * m), sy = mix(1.06, 1.0, m), sh = mix(.10, -.12, m);
    var dx = mix(.13, -.01, Math.sqrt(m)), dy = mix(-.07, .03, e) + mix(0, -.02, m);
    return { sunI: sunI, sunCol: sunCol, ambCol: ambCol, lampCol: lampCol, moonI: moonI, xf: [sx, sy, sh, 0], dxy: [dx, dy], soft: mix(5, 2, e) };
  }
  function hourNow(t) {
    try {
      var q = new URLSearchParams(location.search).get('sun');
      var lapse = q && /^lapse(\d+)?$/.exec(q);
      if (lapse) return 5 + ((t / (Number(lapse[1]) || 60)) % 1) * 19;
      if (q !== null && q !== '' && !isNaN(Number(q))) return ((Number(q) % 24) + 24) % 24;
    } catch (e) {}
    var d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }
  function cloudAt(t) {
    var k = Math.floor(t / 70), f = t / 70 - k, r = Math.abs(Math.sin(k * 91.7) * 43758.5) % 1;
    if (r < .5) return 1;
    return 1 - S(.15, .4, f) * S(.95, .65, f) * mix(.3, .65, r);
  }
  function load(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.decoding = 'async'; i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
  }

  var canvas = document.createElement('canvas');
  canvas.className = 'rv-wall';
  canvas.setAttribute('aria-hidden', 'true');
  var host = null, visible = false;

  /* the canvas lives in whichever header is on screen */
  var seen = new Map();
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { seen.set(e.target, e.isIntersecting); });
    var next = null;
    heroes.forEach(function (h) { if (seen.get(h) && h.offsetParent !== null) next = next || h; });
    if (next && next !== host) { host = next; host.insertBefore(canvas, host.firstChild); last = -1e9; }
    visible = !!next && document.visibilityState === 'visible';
  });
  heroes.forEach(function (h) { io.observe(h); });
  document.addEventListener('visibilitychange', function () { visible = document.visibilityState === 'visible' && !!host && seen.get(host); if (visible) last = -1e9; });

  var last = -1e9;
  function start() {
    Promise.all([load('/learn-assets/wall-plaster.webp'), load('/learn-assets/wall-sunlight.webp')]).then(function (imgs) {
      var gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
      if (!gl) return;
      function sh(type, src) {
        var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
        return s;
      }
      var pr;
      try {
        pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
      } catch (e) { return; }
      gl.useProgram(pr);
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      var U = {};
      ['plaster', 'sun', 'res', 'focus', 'zoom', 't', 'veil', 'drift', 'xf', 'dxy', 'sunCol', 'ambCol', 'lampCol', 'sunI', 'moonI', 'soft', 'sway', 'cloud', 'tone']
        .forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
      imgs.forEach(function (img, unit) {
        var tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      });
      gl.uniform1i(U.plaster, 0); gl.uniform1i(U.sun, 1);
      var phone = matchMedia('(max-width:900px)'), calm = matchMedia('(prefers-reduced-motion: reduce)');
      var busyUntil = 0, t0 = performance.now(), shown = false;
      function busy() { busyUntil = performance.now() + 260; }
      addEventListener('scroll', busy, { passive: true });
      addEventListener('touchmove', busy, { passive: true });
      var BUDGET = 560000;
      function frame(now) {
        requestAnimationFrame(frame);
        var still = calm.matches;
        if (!visible || !host || now < busyUntil || now - last < (still ? 30000 : 41)) return;
        last = now;
        var cw = canvas.clientWidth, ch = canvas.clientHeight;
        if (!cw || !ch) return;
        var dpr = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(BUDGET / (cw * ch)));
        var w = Math.round(cw * dpr), h = Math.round(ch * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
        var t = (now - t0) / 1000, L = lightAt(hourNow(t)), mob = phone.matches;
        gl.uniform2f(U.res, w, h);
        var homePhone = mob && host.classList.contains('hero');
        gl.uniform2f(U.focus, homePhone ? .93 : mob ? .82 : 1, homePhone ? .28 : .35);
        gl.uniform1f(U.zoom, 1.05);
        gl.uniform1f(U.t, still ? 0 : t);
        var light = host.classList.contains('wall-light'), isHome = host.classList.contains('hero');
        var dv = mob ? (host.dataset.wallVeilPhone || host.dataset.wallVeil) : host.dataset.wallVeil;
        gl.uniform1f(U.veil, dv ? Number(dv) : isHome ? (mob ? 7 : 5) : (mob ? 6 : 5));
        gl.uniform1f(U.tone, light ? 1 : 0);
        gl.uniform1f(U.drift, 1);
        gl.uniform4fv(U.xf, L.xf);
        gl.uniform2f(U.dxy, L.dxy[0], L.dxy[1]);
        gl.uniform3fv(U.sunCol, L.sunCol); gl.uniform3fv(U.ambCol, L.ambCol); gl.uniform3fv(U.lampCol, L.lampCol);
        gl.uniform1f(U.sunI, L.sunI); gl.uniform1f(U.moonI, L.moonI); gl.uniform1f(U.soft, L.soft);
        gl.uniform1f(U.sway, still ? 0 : homePhone ? .025 : .05); gl.uniform1f(U.cloud, still ? 1 : cloudAt(t));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!shown) { shown = true; canvas.classList.add('on'); }
      }
      requestAnimationFrame(frame);
    }).catch(function () { /* the photograph stays */ });
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
})();
