/* Relève booking: the discovery-call picker the website shows instead of
   Calendly (Nona, 2 November 2026). Served from app.relevestaffing.com so the
   website only loads one script. The app books the call behind it, on hello@'s
   calendar and Zoom, through its /api/booking endpoints.

   RelBooking.mount(element, {
     name, email, phone, notes, source,   // what the site already asked
     onReady(),                           // times are showing: hide anything Calendly-related
     onMeta(data),                        // durationMin and the page wording from the console
     submit(startIso, tz) -> fetch(...)   // optional: book differently (the reschedule page)
     confirmWord, doneLine                // optional wording for the button and the last screen
     onBooked(startIso),                  // the call is booked
     onFallback()                         // booking is not switched on: show Calendly instead
   })

   Nothing here repeats a question the site asked: the phone field only shows
   when the site did not collect one. */
(function () {
  var API = 'https://app.relevestaffing.com';
  var CSS = [
    '.rlb{font:inherit;color:#22302A;text-align:left;background:#FAF8F2;border:1px solid rgba(53,68,58,.12);padding:26px 24px}', '@media(max-width:520px){.rlb{padding:20px 16px}}',
    '.rlb *{box-sizing:border-box}',
    '.rlb-h{font-family:Lora,Georgia,serif;font-size:22px;line-height:1.25;color:#35443A;margin:0 0 4px;font-weight:400;letter-spacing:0;text-transform:none}',
    '.rlb-tz{font-size:12.5px;line-height:1.5;color:#888466;margin:0 0 18px;opacity:1;max-width:none;text-align:left}',
    '.rlb-days{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 -2px 14px;scrollbar-width:thin}',
    '.rlb-day{flex:0 0 auto;min-width:72px;padding:10px 12px;border:1px solid rgba(53,68,58,.2);background:#fff;border-radius:2px;cursor:pointer;text-align:center;font:inherit;color:#22302A;transition:border-color .15s,background .15s}',
    '.rlb-day b{display:block;font-family:Lora,Georgia,serif;font-weight:400;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#888466}',
    '.rlb-day span{display:block;font-size:17px;margin-top:2px}',
    '.rlb-day:hover{border-color:#35443A}',
    '.rlb-day[aria-pressed=true]{background:#35443A;border-color:#35443A;color:#fff}',
    '.rlb-day[aria-pressed=true] b{color:#E9E7D8}',
    '.rlb-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;margin:0 0 18px}',
    '.rlb-t{padding:11px 8px;border:1px solid rgba(53,68,58,.2);background:#fff;border-radius:2px;cursor:pointer;font:inherit;font-size:14.5px;color:#22302A;transition:border-color .15s,background .15s}',
    '.rlb-t:hover{border-color:#35443A}',
    '.rlb-t[aria-pressed=true]{background:#35443A;border-color:#35443A;color:#fff}',
    '.rlb-f{margin:0 0 14px}',
    '.rlb-f label{display:block;font-size:12.5px;color:#888466;margin:0 0 6px}',
    '.rlb-f input{width:100%;padding:12px 14px;border:1px solid rgba(53,68,58,.25);border-radius:2px;font:inherit;font-size:15px;color:#22302A;background:#fff}',
    '.rlb-f input:focus{outline:none;border-color:#35443A}',
    '.rlb-go{width:100%;padding:15px 18px;border:0;border-radius:2px;background:#35443A;color:#fff;font-family:Lora,Georgia,serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;transition:opacity .15s}',
    '.rlb-go[disabled]{opacity:.45;cursor:default}',
    '.rlb-err{color:#8C4A3F;font-size:13.5px;margin:10px 0 0}','.rlb-err[hidden]{display:none}',
    '.rlb-msg{font-size:14.5px;color:#3C463F;padding:18px 0}',
    '.rlb-done{text-align:center;padding:26px 0}',
    '.rlb-done-h{font-family:Lora,Georgia,serif;font-weight:400;font-size:28px;color:#35443A;margin:0 0 10px}',
    '.rlb-done-p{margin:0;color:#3C463F;font-size:15px;line-height:1.6}'
  ].join('');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mount(root, o) {
    o = o || {};
    if (!document.getElementById('rlb-css')) {
      var s = document.createElement('style'); s.id = 'rlb-css'; s.textContent = CSS; document.head.appendChild(s);
    }
    var tz = 'America/Los_Angeles';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) {}
    var dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz });
    var numFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: tz });
    var keyFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz });
    var timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    var longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz });

    root.innerHTML = '';
    var box = el('div', 'rlb');
    root.appendChild(box);
    box.appendChild(el('div', 'rlb-msg', 'Finding the open times…'));

    var state = { days: [], byDay: {}, day: null, slot: null, busy: false };

    fetch(API + '/api/booking/times?days=21', { mode: 'cors' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.configured) { if (o.onFallback) o.onFallback(); return; }
        state.minutes = d.durationMin || 30;
        if (o.onMeta) { try { o.onMeta(d); } catch (e) {} }
        (d.slots || []).forEach(function (iso) {
          var k = keyFmt.format(new Date(iso));
          if (!state.byDay[k]) { state.byDay[k] = []; state.days.push(k); }
          state.byDay[k].push(iso);
        });
        if (!state.days.length) {
          box.innerHTML = '';
          box.appendChild(el('div', 'rlb-msg', 'Every time in the next three weeks is taken. Email hello@relevestaffing.com and we will make one for you.'));
          return;
        }
        state.day = state.days[0];
        if (o.onReady) { try { o.onReady(); } catch (e) {} }
        render();
      })
      .catch(function () { if (o.onFallback) o.onFallback(); });

    function render() {
      box.innerHTML = '';
      box.appendChild(el('div', 'rlb-h', 'Choose your time'));
      var tzName = tz.replace(/_/g, ' ').split('/').pop();
      box.appendChild(el('div', 'rlb-tz', (state.minutes || 30) + ' minutes on Zoom. Times are shown in your time zone (' + tzName + ').'));

      var days = el('div', 'rlb-days');
      days.setAttribute('role', 'group'); days.setAttribute('aria-label', 'Day');
      state.days.forEach(function (k) {
        var first = new Date(state.byDay[k][0]);
        var b = el('button', 'rlb-day'); b.type = 'button';
        b.setAttribute('aria-pressed', String(k === state.day));
        b.appendChild(el('b', null, dayFmt.format(first)));
        b.appendChild(el('span', null, numFmt.format(first)));
        b.onclick = function () { state.day = k; state.slot = null; render(); };
        days.appendChild(b);
      });
      box.appendChild(days);

      var times = el('div', 'rlb-times');
      times.setAttribute('role', 'group'); times.setAttribute('aria-label', 'Time');
      state.byDay[state.day].forEach(function (iso) {
        var t = el('button', 'rlb-t', timeFmt.format(new Date(iso))); t.type = 'button';
        t.setAttribute('aria-pressed', String(iso === state.slot));
        t.onclick = function () { state.slot = iso; render(); };
        times.appendChild(t);
      });
      box.appendChild(times);

      var phoneInput = null;
      if (!o.phone && !o.submit) {
        var f = el('div', 'rlb-f');
        var lab = el('label', null, 'Phone number'); lab.htmlFor = 'rlb-phone';
        phoneInput = el('input'); phoneInput.id = 'rlb-phone'; phoneInput.type = 'tel'; phoneInput.autocomplete = 'tel';
        phoneInput.placeholder = '+1 555 123 4567'; phoneInput.value = state.phone || '';
        phoneInput.oninput = function () { state.phone = phoneInput.value; sync(); };
        f.appendChild(lab); f.appendChild(phoneInput); box.appendChild(f);
      }

      var go = el('button', 'rlb-go'); go.type = 'button';
      var err = el('div', 'rlb-err'); err.hidden = true;
      function sync() {
        var phone = o.phone || state.phone || '';
        go.disabled = state.busy || !state.slot || (!o.submit && phone.replace(/\D/g, '').length < 7);
        go.textContent = state.busy ? 'Booking…'
          : state.slot ? (o.confirmWord || 'Confirm') + ' ' + numFmt.format(new Date(state.slot)) + ', ' + timeFmt.format(new Date(state.slot))
          : 'Choose a time';
      }
      sync();
      go.onclick = function () {
        if (go.disabled) return;
        state.busy = true; sync(); err.hidden = true;
        var req = o.submit ? o.submit(state.slot, tz) : fetch(API + '/api/booking/book', {
          method: 'POST', mode: 'cors', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: o.name, email: o.email, phone: o.phone || state.phone, org: o.org || '', notes: o.notes || '',
            source: o.source || '', applicant: o.applicant || '', start: state.slot, timezone: tz
          })
        });
        req.then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (x) {
            state.busy = false;
            if (!x.ok) {
              err.textContent = (x.d && x.d.error) || 'That did not go through. Please try again.'; err.hidden = false;
              if (/taken/i.test(err.textContent)) { refresh(); }
              sync(); return;
            }
            done(x.d.start || state.slot, x.d);
          })
          .catch(function () { state.busy = false; err.textContent = 'That did not go through. Please try again.'; err.hidden = false; sync(); });
      };
      box.appendChild(go); box.appendChild(err);
    }

    function refresh() {
      fetch(API + '/api/booking/times?days=21', { mode: 'cors' }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.configured) return;
        state.days = []; state.byDay = {};
        (d.slots || []).forEach(function (iso) {
          var k = keyFmt.format(new Date(iso));
          if (!state.byDay[k]) { state.byDay[k] = []; state.days.push(k); }
          state.byDay[k].push(iso);
        });
        if (!state.byDay[state.day]) state.day = state.days[0];
        state.slot = null;
        if (state.day) render();
      });
    }

    function done(iso, data) {
      box.innerHTML = '';
      var d = el('div', 'rlb-done');
      d.appendChild(el('div', 'rlb-done-h', 'It\u2019s handled.'));
      d.appendChild(el('div', 'rlb-done-p', longFmt.format(new Date(iso)) + ' at ' + timeFmt.format(new Date(iso)) + '. ' + (o.doneLine || 'Your confirmation is on its way from Relève.')));
      box.appendChild(d);
      if (o.onBooked) { try { o.onBooked(iso, data); } catch (e) {} }
    }
  }

  window.RelBooking = { mount: mount };
})();
