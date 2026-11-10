#!/usr/bin/env python3
"""Assembles Inside Relève into one HTML page (course.html) plus the step list
for the server (steps.json). The page is served by the app at /inside/[token]
with window.__INSIDE injected where <!--INSIDE_CONFIG--> sits."""
import json, re, pathlib, sys
HERE = pathlib.Path(__file__).parent
APP = HERE.parent
SH = HERE / 'shared'
COURSE = sys.argv[1] if len(sys.argv) > 1 else 'inside'
SRC = HERE / COURSE
# The Handled Business course CSS (the approved shell), the site's wall palette, then ours.
css = (SH / 'shell.css').read_text() + '\n' + (SH / 'wall-palette.css').read_text() + '\n' + (SH / 'course.css').read_text()
data = json.loads((SRC / 'data.json').read_text())
engine = (SH / 'engine.js').read_text()
meta = json.loads((SRC / 'course.json').read_text())
engine = engine.replace('__META__', json.dumps(meta['engine'], ensure_ascii=False)).replace('__STEPS__', json.dumps(data['steps'], ensure_ascii=False)).replace('__CHECKS__', json.dumps(data['checks'], ensure_ascii=False))
lessons = ''.join(p.read_text() for p in sorted(SRC.glob('lessons-*.html')))

steps = data['steps']
parts = [tuple(p) for p in meta['parts']]
parts_html = ''.join(f'<li><span class="n">{n}</span><div><b>{t}</b><small>{s}</small></div><span class="c">{c}</span></li>' for n, t, s, c in parts)

page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{meta['title']}</title>
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#1A241E">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/Lora-Regular.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="/fonts/Poppins-Light.woff" as="font" type="font/woff" crossorigin>
<style>
{css}
</style>
<style id="rv-splash-css">
#rv-splash{{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FBF8F1;opacity:1;transition:opacity .5s ease}}
#rv-splash.rv-splash-done{{opacity:0;pointer-events:none}}
#rv-splash .rv-logo{{display:block;width:min(74vw,400px);height:auto;opacity:0;animation:rvSplFade .9s ease .1s forwards}}
#rv-splash .rv-bar{{position:absolute;left:0;bottom:0;height:2px;width:100%;background:rgba(53,68,58,.12)}}
#rv-splash .rv-bar i{{display:block;height:100%;width:0;background:#35443A;animation:rvSplFill 2.2s cubic-bezier(.4,.1,.2,1) .2s forwards}}
@keyframes rvSplFade{{from{{opacity:0;transform:translateY(6px)}}to{{opacity:1;transform:none}}}}
@keyframes rvSplFill{{0%{{width:0}}70%{{width:82%}}100%{{width:100%}}}}
@media (prefers-reduced-motion:reduce){{#rv-splash .rv-logo{{animation:none;opacity:1}}#rv-splash .rv-bar i{{animation:none;width:40%}}}}
</style>
</head>
<body>
<div id="rv-splash" aria-hidden="true"><img class="rv-logo" src="/logo-fern.png" alt="" width="1200" height="360" decoding="sync" fetchpriority="high"><div class="rv-bar"><i></i></div></div>
<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#C8CFD4"/><stop offset="1" stop-color="#C8CFD4"/></linearGradient></defs></svg>

<section id="gate" class="hero wall-dark">
  <div class="veil" aria-hidden="true"></div>
  <div class="g-top">
    <img src="/logo-white.png" alt="Relève Executive Staffing" width="1200" height="360">
    <span class="tag">{meta['tag']}</span>
  </div>
  <div class="g-wrap">
    <div class="g-left">
      <p class="g-eyebrow">{meta['eyebrow']}</p>
      <h1>{meta['title']}.</h1>
      <p class="script tag-img"><img src="/consider-it-handled-cream.png" alt="Consider it handled." width="2755" height="414" decoding="async"></p>
      <p class="g-sub">{meta['sub']}</p>
      <ul class="g-parts">{parts_html}</ul>
    </div>
    <div class="g-card">
      <span class="k">Prepared for</span>
      <div class="who" id="g-who"></div>
      <ul class="facts-mini">
        <li><span>Lessons</span><b>{sum(1 for s in steps if s[4]=="l")}</b></li>
        <li><span>Checks</span><b>{sum(1 for s in steps if s[4]=="c")}</b></li>
        <li><span>Time</span><b>{meta['time']}</b></li>
        <li><span>Your progress</span><b id="g-prog">Not started</b></li>
      </ul>
      <button class="btn btn-cream" id="g-go" type="button">Begin the training <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      <p class="consent">This link is yours alone, so please keep it to yourself. Your progress saves on any device you open it on, and the Relève team can see how far you have come.</p>
    </div>
  </div>
</section>

<div id="course" hidden>
  <aside class="side" id="side">
    <div class="s-head">
      <img src="/logo-white.png" alt="Relève Executive Staffing" width="1200" height="360">
      <div class="t"><small>{meta['side']}</small>{meta['title']}</div>
    </div>
    <div class="s-stats">
      <div class="ring"><svg viewBox="0 0 66 66"><circle class="bg" cx="33" cy="33" r="29"/><circle class="fg" id="ring" cx="33" cy="33" r="29" stroke-dasharray="182.2" stroke-dashoffset="182.2"/></svg><span id="pct">0%</span></div>
      <div class="hrs"><div class="lbl">Checks passed</div><div class="v" id="hrs">0<small>of {sum(1 for s in steps if s[4]=="c")}</small></div></div>
    </div>
    <nav class="toc" id="toc" aria-label="Lessons"></nav>
  </aside>
  <div class="scrim" id="scrim"></div>
  <header class="c-bar">
    <button class="menu" id="menu" aria-label="Open lessons"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>Lessons</button>
    <div class="where" id="where"></div>
    <div class="c-prog" id="cprog"></div>
  </header>
  <main class="lesson-wrap" id="main"></main>
  <div class="toast" id="toast"><i></i><span id="toast-t"></span></div>
</div>

{lessons}

<!--INSIDE_CONFIG-->
<script>
{engine}
</script>
<script src="/learn-assets/wall.js" defer></script>
<script>
(function(){{var s=document.getElementById('rv-splash');if(!s)return;
function gone(){{s.classList.add('rv-splash-done');setTimeout(function(){{if(s&&s.parentNode)s.parentNode.removeChild(s)}},600);}}
function lift(){{var now=(window.performance&&performance.now)?performance.now():0;setTimeout(gone,Math.max(0,900-now));}}
if(document.readyState==='complete')lift();else window.addEventListener('load',lift);
setTimeout(function(){{if(s&&s.parentNode)gone();}},5000);}})();
</script>
</body>
</html>
'''
gen = APP / 'lib' / 'learn-gen'; gen.mkdir(exist_ok=True)
(gen / f'{COURSE}-html.ts').write_text('/* Generated by learn/build.py from learn/' + COURSE + '/. Do not edit by hand: edit the lessons and run python3 learn/build.py ' + COURSE + '. */\nexport const HTML = ' + json.dumps(page, ensure_ascii=False) + ';\n')
(gen / f'{COURSE}-steps.ts').write_text('/* Generated by learn/build.py. [id, part, short title, minutes, kind] kind: l lesson, c check, s sign-off. */\nexport const STEPS = ' + json.dumps(steps, ensure_ascii=False) + ' as const;\nexport const CHECK_IDS = ' + json.dumps([s[0] for s in steps if s[4] == 'c']) + ' as const;\n')
(HERE / 'preview').mkdir(exist_ok=True); (HERE / 'preview' / f'{COURSE}.html').write_text(page)
# lint the words: no em or en dashes, none of the banned words
text = re.sub(r'<style.*?</style>|<script.*?</script>|<[^>]+>', ' ', lessons + json.dumps(data, ensure_ascii=False), flags=re.S)
probs = []
if re.search('[—–]', text): probs.append('dash: ' + ', '.join(m.group(0) for m in re.finditer('.{30}[—–].{30}', text)))
for w in ['leverage', 'streamline', 'seamless', 'utilize', 'unlock', 'elevate', 'empower', 'journey', 'landscape', 'robust', 'game changer', "here's the thing", 'foster', 'facilitate', 'impactful']:
    for m in re.finditer(r'.{0,40}\b' + re.escape(w) + r'\w*.{0,40}', text, flags=re.I):
        probs.append(f'{w}: {m.group(0)}')
for m in re.finditer(r'.{0,50}\btrained\b.{0,40}', text, flags=re.I): probs.append('trained: ' + m.group(0))
for m in re.finditer(r'.{0,50}\b(chase|chased|flagged|gone quiet)\b.{0,30}', text, flags=re.I): probs.append('word: ' + m.group(0))
print('\n'.join(probs) if probs else 'lint clean')
print('bytes', len(page))
