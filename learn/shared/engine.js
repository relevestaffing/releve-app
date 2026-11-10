(function(){
  'use strict';
  /* Inside Relève: the team training engine (10 Nov 2026). Built on The
     Handled Business course engine. The page is served by the app at
     /inside/[token]; the server puts window.__INSIDE in front of this script:
     { t: token, name, progress: {done:[], checks:{}, last}, completedAt, videos:{} }.
     Progress saves to this browser and to the server, so the link works on
     any device and the console can see how far someone has come. */
  var CFG = window.__INSIDE || {};
  var TOKEN = CFG.t || '';
  var KEY = 'releve_inside_' + (TOKEN ? TOKEN.slice(0, 12) : 'preview');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function(s,c){return (c||document).querySelector(s)};
  var $$ = function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s))};
  function store(v){ try{ if (v === undefined) return JSON.parse(localStorage.getItem(KEY) || 'null'); localStorage.setItem(KEY, JSON.stringify(v)); }catch(e){ return null; } }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /* [id, part, short title, minutes, kind]  l = lesson, c = check, s = sign-off */
  var L = __STEPS__;
  var Q = __CHECKS__;
  var META = __META__;
  var LESSONS = L.filter(function(l){ return l[4] === 'l'; });
  var CHECKS = L.filter(function(l){ return l[4] === 'c'; });
  function lessonNo(id){ for (var i=0,n=0;i<L.length;i++){ if (L[i][4]==='l') n++; if (L[i][0]===id) return n; } return 0; }
  function checkNo(id){ for (var i=0,n=0;i<L.length;i++){ if (L[i][4]==='c') n++; if (L[i][0]===id) return n; } return 0; }
  function idx(id){ return L.map(function(l){return l[0]}).indexOf(id); }
  var PART_NAMES = { 'Part one':'Part one', 'Part two':'Part two', 'Part three':'Part three', 'Part four':'Part four', 'Part five':'Part five' };

  /* state: this browser first, then whatever the server already holds */
  var state = store() || {};
  state.done = state.done || {}; state.checks = state.checks || {};
  var sp = CFG.progress || {};
  (sp.done || []).forEach(function(id){ if (idx(id) >= 0) state.done[id] = 1; });
  Object.keys(sp.checks || {}).forEach(function(k){
    var s = sp.checks[k]; if (!s) return;
    if (!state.checks[k] || (s.score || 0) > (state.checks[k].score || 0)) state.checks[k] = s;
  });
  if (state.last == null && typeof sp.last === 'number') state.last = sp.last;
  if (CFG.completedAt) state.signed = CFG.completedAt;
  store(state);

  var syncT;
  function sync(now){
    if (!TOKEN) return;
    clearTimeout(syncT);
    var send = function(){
      var body = JSON.stringify({ token: TOKEN, done: Object.keys(state.done), checks: state.checks, last: state.last || 0 });
      try { fetch('/api/learn/progress', { method:'POST', headers:{'content-type':'application/json'}, body: body, keepalive: true }).catch(function(){}); } catch(e){}
    };
    if (now) send(); else syncT = setTimeout(send, 700);
  }

  var first = (CFG.name || '').trim().split(/\s+/)[0] || '';

  /* ───── cover ───── */
  $('#g-who').textContent = CFG.name || 'The Relève team';
  function coverState(){
    var n = LESSONS.filter(function(l){ return state.done[l[0]]; }).length;
    var b = $('#g-go'), p = $('#g-prog');
    if (state.signed){ p.textContent = 'Signed off'; b.firstChild.textContent = 'Open the training '; }
    else if (n || Object.keys(state.checks).length){ p.textContent = n + ' of ' + LESSONS.length + ' lessons'; b.firstChild.textContent = 'Continue where you left off '; }
    else { p.textContent = 'Not started'; b.firstChild.textContent = 'Begin the training '; }
  }
  coverState();
  requestAnimationFrame(function(){ setTimeout(function(){ $('#gate').classList.add('in'); }, 60); });
  $('#g-go').addEventListener('click', function(){ enter(); });
  /* A course opened from inside the app (the talent training) offers the way back. */
  if (META.back){
    var bk = document.createElement('a'); bk.className = 'back'; bk.href = META.back; bk.textContent = '← ' + (META.backLabel || 'Back');
    $('.g-card').appendChild(bk);
    var sf = document.createElement('div'); sf.className = 's-foot';
    sf.innerHTML = '<a class="btn btn-cream" href="' + esc(META.back) + '">' + esc(META.backLabel || 'Back') + '</a>';
    $('#side').appendChild(sf);
  }

  /* ───── course ───── */
  var cur = 0, main = $('#main');

  function buildToc(){
    var html = '', last = '';
    L.forEach(function(l,i){
      if (l[1] !== last){ html += '<div class="part">' + l[1] + '</div>'; last = l[1]; }
      var dot = l[4] === 'l' ? '<b>' + ('0' + lessonNo(l[0])).slice(-2) + '</b>' : '';
      html += '<button data-i="'+i+'" class="'+(l[4] !== 'l' ? 'chk-row' : '')+'"><span class="dot">'+dot+'</span><span>'+l[2]+'</span></button>';
    });
    $('#toc').innerHTML = html;
    $$('#toc button').forEach(function(b){ b.addEventListener('click', function(){ go(+b.dataset.i); document.body.classList.remove('drawer'); }); });
  }

  function refreshSide(){
    var need = L.filter(function(l){ return l[4] !== 's'; });
    var n = need.filter(function(l){ return state.done[l[0]]; }).length;
    var pct = state.signed ? 100 : Math.round(n / need.length * 100);
    $('#pct').textContent = pct + '%';
    $('#ring').style.strokeDashoffset = 182.2 * (1 - pct / 100);
    var c = CHECKS.filter(function(l){ return state.done[l[0]]; }).length;
    $('#hrs').innerHTML = c + '<small>of ' + CHECKS.length + '</small>';
    $$('#toc button').forEach(function(b){ var i = +b.dataset.i, id = L[i][0]; b.classList.toggle('done', id === 'signoff' ? !!state.signed : !!state.done[id]); b.classList.toggle('cur', i === cur); });
  }

  function videoFor(id){
    var u = (CFG.videos || {})[id]; if (!u) return '';
    var src = '';
    var m;
    if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/))) src = 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0';
    else if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) src = 'https://player.vimeo.com/video/' + m[1];
    else if ((m = u.match(/loom\.com\/(?:share|embed)\/([\w]+)/))) src = 'https://www.loom.com/embed/' + m[1];
    if (!src) return '';
    return '<div class="video"><iframe src="'+esc(src)+'" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" title="Lesson video"></iframe></div>';
  }

  function nextCard(nx, tease){
    if (!nx) return '';
    var title, k;
    if (nx[4] === 'l'){ title = document.getElementById('t-' + nx[0]).dataset.title; k = 'Complete and continue · Lesson ' + lessonNo(nx[0]); }
    else if (nx[4] === 'c'){ title = 'Check: ' + nx[1].split(' · ')[1].toLowerCase().replace(/^./, function(c){return c.toUpperCase()}); k = 'Complete and continue · Check ' + checkNo(nx[0]) + ' of ' + CHECKS.length; }
    else { title = 'Your sign-off'; k = 'Continue'; }
    return '<div class="next" id="next" role="button" tabindex="0"><div><span class="k">'+k+'</span><b>'+title+'</b><span>'+(tease || '')+'</span></div><span class="go"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></div>';
  }

  function go(i, fromHash){
    cur = Math.max(0, Math.min(L.length-1, i));
    var l = L[cur], nx = L[cur+1], head, body, foot;
    var back = cur > 0 ? '<button class="back" id="prev">← Previous</button>' : '';
    if (l[4] === 'l'){
      var tpl = document.getElementById('t-' + l[0]), n = lessonNo(l[0]);
      head = '<header class="l-head"><span class="l-num">'+('0'+n).slice(-2)+'</span><p class="l-part">'+l[1]+'</p><h1>'+tpl.dataset.title+'</h1><p class="hook">'+tpl.dataset.hook+'</p>' +
        '<div class="l-meta"><span><i></i>Lesson '+n+' of '+LESSONS.length+'</span><span>'+l[3]+' minute read</span></div></header>';
      body = videoFor(l[0]) + tpl.innerHTML;
      foot = '<footer class="l-foot">' + nextCard(nx, tpl.dataset.tease) + back + '</footer>';
    } else if (l[4] === 'c'){
      var part = l[1].split(' · ')[1];
      head = '<header class="l-head"><p class="l-part">'+l[1]+'</p><h1>Check: '+part.toLowerCase().replace(/^./, function(c){return c.toUpperCase()})+'.</h1><p class="hook">Five questions on what you have just read. Four right to pass, and you can take it again as often as you like.</p>' +
        '<div class="l-meta"><span><i></i>Check '+checkNo(l[0])+' of '+CHECKS.length+'</span><span>About '+l[3]+' minutes</span>' + (state.checks[l[0]] ? '<span>Passed with '+state.checks[l[0]].score+' of 5</span>' : '') + '</div></header>';
      body = quizHtml(l[0]);
      foot = '<footer class="l-foot">' + back + '</footer>';
    } else {
      head = '<header class="l-head"><p class="l-part">'+l[1]+'</p><h1>Your sign-off.</h1><p class="hook">' + META.signHook + '</p></header>';
      body = signHtml();
      foot = '<footer class="l-foot">' + back + '</footer>';
    }
    main.innerHTML = '<article class="lesson">' + head + body + foot + '</article>';
    $('#where').innerHTML = (l[4] === 'l' ? '<b>' + ('0'+lessonNo(l[0])).slice(-2) + '</b> &nbsp;·&nbsp; ' : '') + l[2];
    window.scrollTo(0,0);
    if (!fromHash) history.replaceState(null, '', '#' + l[0]);
    state.last = cur; store(state); sync();
    var nEl = $('#next');
    if (nEl){ var adv = function(){ complete(); go(cur+1); }; nEl.addEventListener('click', adv); nEl.addEventListener('keydown', function(e){ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); adv(); } }); }
    if ($('#prev')) $('#prev').addEventListener('click', function(){ go(cur-1); });
    refreshSide();
    wire(main);
    if (l[4] === 'c') wireQuiz(l[0]);
    if (l[4] === 's') wireSign();
  }

  function complete(){
    var l = L[cur];
    if (l[4] !== 'l' || state.done[l[0]]) return;
    state.done[l[0]] = 1; store(state); sync(true);
    refreshSide();
    toast('Lesson ' + lessonNo(l[0]) + ' complete.');
  }
  var tt;
  function toast(h){ var t = $('#toast'); $('#toast-t').innerHTML = h; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(function(){ t.classList.remove('show'); }, 2800); }

  window.addEventListener('scroll', function(){
    if ($('#course').hidden) return;
    var h = document.documentElement.scrollHeight - innerHeight;
    var p = h > 0 ? Math.min(1, scrollY / h) : 1;
    $('#cprog').style.width = (p*100) + '%';
  }, {passive:true});

  /* ───── the checks ───── */
  function quizHtml(id){
    var qs = Q[id] || [];
    return '<div class="quiz" id="quiz">' + qs.map(function(q, qi){
      return '<div class="q"><span class="qn">Question '+(qi+1)+' of '+qs.length+'</span><h3>'+q.q+'</h3><div class="opts">' +
        q.o.map(function(o, oi){ return '<button type="button" class="opt" data-q="'+qi+'" data-o="'+oi+'"><i></i><span>'+o+'</span></button>'; }).join('') +
        '</div><p class="why" data-w="'+esc(q.w)+'"></p></div>';
    }).join('') + '</div>' +
    '<div class="q-bar" id="qbar"><span class="note" id="qnote">Answer all five, then check your score.</span><button type="button" class="btn btn-fern" id="qgo" disabled>Check my answers</button></div><div id="qres"></div>';
  }
  function wireQuiz(id){
    var qs = Q[id] || [], picks = {}, quiz = $('#quiz'), goBtn = $('#qgo');
    $$('.opt', quiz).forEach(function(b){
      b.addEventListener('click', function(){
        if (quiz.classList.contains('marked')) return;
        var q = +b.dataset.q; picks[q] = +b.dataset.o;
        $$('.opt[data-q="'+q+'"]', quiz).forEach(function(x){ x.classList.toggle('sel', x === b); });
        var n = Object.keys(picks).length;
        goBtn.disabled = n < qs.length;
        $('#qnote').textContent = n < qs.length ? (qs.length - n) + ' to go.' : 'All answered.';
      });
    });
    goBtn.addEventListener('click', function(){
      var score = 0;
      quiz.classList.add('marked');
      qs.forEach(function(q, qi){
        var pick = picks[qi], ok = pick === q.a;
        if (ok) score++;
        $$('.opt[data-q="'+qi+'"]', quiz).forEach(function(x){
          var o = +x.dataset.o;
          if (o === q.a) x.classList.add('right');
          else if (o === pick) x.classList.add('wrong');
          x.classList.remove('sel');
        });
        var w = $$('.q', quiz)[qi].querySelector('.why');
        w.innerHTML = '<b>' + (ok ? 'Right.' : 'Not quite.') + '</b> ' + w.dataset.w;
      });
      $('#qbar').hidden = true;
      var pass = score >= 4, partFirst = L.filter(function(l){ return l[1] === L[cur][1] && l[4] === 'l'; })[0];
      if (pass){
        var prev = state.checks[id];
        if (!prev || score > prev.score) state.checks[id] = { score: score, at: new Date().toISOString() };
        state.done[id] = 1; store(state); sync(true); refreshSide();
      }
      $('#qres').innerHTML = '<div class="result"><span class="k">' + (pass ? 'Passed' : 'Not yet') + '</span><b class="score">' + score + ' of ' + qs.length + '</b><p>' +
        (pass ? (score === qs.length ? 'Every answer right.' : 'Read the note under the one you missed, then carry on.') : 'Four right to pass. Read the notes under each answer, look back over the part if it helps, and try again.') + '</p>' +
        (pass ? '<button class="btn btn-cream" id="qnext">Continue</button>' : '<button class="btn btn-cream" id="qagain">Try again</button>' + (partFirst ? ' <button class="btn btn-line" id="qreview" style="margin-left:8px">Review the part</button>' : '')) + '</div>';
      $('#qres').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      if (pass){ toast('Check passed, ' + score + ' of ' + qs.length + '.'); $('#qnext').addEventListener('click', function(){ go(cur+1); }); }
      else {
        $('#qagain').addEventListener('click', function(){ go(cur, true); });
        if ($('#qreview')) $('#qreview').addEventListener('click', function(){ go(idx(partFirst[0])); });
      }
    });
  }

  /* ───── sign-off ───── */
  function missing(){ return L.filter(function(l){ return l[4] !== 's' && !state.done[l[0]]; }); }
  function doneCard(){
    var when = state.signed ? new Date(state.signed) : new Date();
    var d = when.toLocaleDateString('en-US', { day:'numeric', month:'long', year:'numeric' });
    return '<div class="done-card"><img class="logo" src="/logo-white.png" alt="Relève Executive Staffing" width="1200" height="360"><span class="k">Signed off</span><h2>' + META.doneTitle + (first ? ', ' + esc(first) : '') + '.</h2>' +
      '<p class="tag-img"><img src="/consider-it-handled-cream.png" alt="Consider it handled." width="2755" height="414"></p>' +
      '<p>' + META.doneText + '</p><p class="when">' + d + '</p></div>';
  }
  function signHtml(){
    if (state.signed) return doneCard();
    var left = missing();
    if (left.length){
      return '<section class="sec"><div class="k">Nearly there</div><h2>' + left.length + (left.length === 1 ? ' step' : ' steps') + ' to go before you can sign off.</h2><p>Open each one below. Lessons count once you continue past them, and checks count once you pass.</p></section>' +
        '<div class="todo">' + left.map(function(l){ return '<button data-goto="'+l[0]+'">'+l[2]+'<span>'+(l[4]==='c' ? 'Check' : 'Lesson ' + lessonNo(l[0]))+'</span></button>'; }).join('') + '</div>';
    }
    return '<form class="sign" id="sign" novalidate><span class="k">Your sign-off</span>' +
      '<p class="pledge">' + META.pledge + '</p>' +
      '<label class="f" for="s-name">Type your full name</label><input type="text" id="s-name" autocomplete="name" value="">' +
      '<label class="chk"><input type="checkbox" id="s-ok"><span>' + META.ack + '</span></label>' +
      '<p class="err" id="s-err" role="alert"></p><button class="btn btn-fern" id="s-go" type="submit">Sign off</button></form>';
  }
  function wireSign(){
    $$('[data-goto]', main).forEach(function(b){ b.addEventListener('click', function(){ go(idx(b.dataset.goto)); }); });
    var f = $('#sign'); if (!f) return;
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var name = $('#s-name').value.replace(/\s+/g, ' ').trim(), er = $('#s-err');
      er.textContent = '';
      if (name.split(' ').length < 2){ er.textContent = 'Please type your first and last name.'; $('#s-name').focus(); return; }
      if (!$('#s-ok').checked){ er.textContent = 'Please tick the box to confirm.'; return; }
      var b = $('#s-go'); b.disabled = true; b.textContent = 'Signing off…';
      var finish = function(at){ state.signed = at || new Date().toISOString(); store(state); refreshSide(); main.querySelector('.lesson').innerHTML = '<header class="l-head"><p class="l-part">Sign-off</p><h1>You are done.</h1></header>' + doneCard(); window.scrollTo(0,0); toast('Signed off. ' + META.doneToast); };
      if (!TOKEN){ finish(); return; }
      fetch('/api/learn/complete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ token: TOKEN, name: name, done: Object.keys(state.done), checks: state.checks }) })
        .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { ok: r.ok, j: j }; }); })
        .then(function(res){
          if (!res.ok){ er.textContent = (res.j && res.j.error) || 'That did not go through. Please try again.'; b.disabled = false; b.textContent = 'Sign off'; return; }
          finish(res.j.completedAt);
        })
        .catch(function(){ er.textContent = 'That did not go through. Check your connection and try again.'; b.disabled = false; b.textContent = 'Sign off'; });
    });
  }

  /* ───── component wiring ───── */
  function wire(root){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if (!e.isIntersecting) return; io.unobserve(e.target); e.target.classList.add('on'); });
    }, {threshold:.15, rootMargin:'0px 0px -4% 0px'});
    $$('.rv,.front', root).forEach(function(el){ if (reduce) el.classList.add('on'); io.observe(el); });

    /* the live audit arithmetic, as on the discovery call */
    var rev = $('#a-rev', root);
    if (rev){
      var hrs = $('#a-hrs', root), off = $('#a-off', root);
      var money = function(n){ return '$' + Math.round(n).toLocaleString('en-US'); };
      var upd = function(){
        var r = Math.max(0, +rev.value || 0), h = Math.max(1, +hrs.value || 1), o = Math.max(0, +off.value || 0);
        var hour = Math.round(r / (h * 52 / 12));
        var month = o * 52 / 12 * hour;
        $('#a-hour', root).textContent = money(hour);
        $('#a-month', root).textContent = money(month);
        $('#a-three', root).textContent = money(month * 3);
      };
      [rev, hrs, off].forEach(function(x){ x.addEventListener('input', upd); });
      upd();
    }
  }

  function enter(){
    $('#gate').hidden = true; $('#course').hidden = false;
    document.title = META.title;
    buildToc();
    var h = location.hash.replace('#',''), i = idx(h);
    go(i >= 0 ? i : (state.last || 0), i >= 0);
    if (!state.welcomed){ state.welcomed = 1; store(state); setTimeout(function(){ toast('Welcome' + (first ? ', ' + esc(first) : '') + '. Your training is open.'); }, 700); }
  }

  $('#menu').addEventListener('click', function(){ document.body.classList.add('drawer'); });
  $('#scrim').addEventListener('click', function(){ document.body.classList.remove('drawer'); });
  window.addEventListener('hashchange', function(){ if ($('#course').hidden) return; var i = idx(location.hash.replace('#','')); if (i>=0 && i!==cur) go(i, true); });
  window.addEventListener('pagehide', function(){ sync(true); });
  if (location.hash && idx(location.hash.slice(1)) >= 0) enter();
})();
