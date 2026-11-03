'use client';
import { useEffect } from 'react';
import './savelock.css';

/* The save lock (Nona, 3 November 2026).
   --------------------------------------
   Rule: anywhere a person types something and presses Save, the form closes
   into a read-only "Saved" state. It never stays open and editable after a
   save. A form that stayed open looked unfinished, and a client must never
   see that.

   How it works, and why it is built this way: every save in the app is a
   non-GET call to /api/. This watches for the click or submit that started
   one, remembers which form (or [data-save-scope] block) it came from, and
   when the server answers ok it locks that block: the fields turn into plain
   text, the Save buttons go, and a "Saved" bar with an Edit button takes
   their place. Because it hangs off the request itself, every form is
   covered, including ones that do not exist yet.

   - A <form> is covered automatically.
   - A block of fields that is not a <form> (a card with its own Save button)
     opts in with data-save-scope.
   - Something that must stay live after sending (a chat box, an
     add-another row) opts out with data-keep-open. A form whose text fields
     clear themselves after sending is left alone without any marker.
   - A form that closes itself (setOpen(false)) is gone before the lock
     lands, so it is also left alone.

   Never remove this. New forms need nothing: they are covered the moment
   they exist. */

const TEXTY = 'textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]):not([type=range])';
/* Calls that are not "I saved some information": sign-in, push, chat, the
   task board's own live editing, uploads that save on their own. */
const SKIP = /\/api\/(auth|push|ai|demo-role|placement-reveal|tasks|photo|video|messages)(\/|\?|$)/;

type Ctx = { scope: HTMLElement; trigger: HTMLElement | null; t: number };
let last: Ctx | null = null;

function scopeOf(el: Element | null): HTMLElement | null {
  if (!el || el.closest('[data-keep-open]')) return null;
  return (el.closest('form') ?? el.closest('[data-save-scope]')) as HTMLElement | null;
}

function remember(target: EventTarget | null, submitter?: Element | null) {
  const el = target instanceof Element ? target : null;
  const trigger = (submitter ?? el?.closest('button, input[type=submit]') ?? null) as HTMLElement | null;
  const scope = scopeOf(trigger ?? el);
  last = scope ? { scope, trigger, t: Date.now() } : null;
}

function filled(scope: HTMLElement) {
  if (scope.hasAttribute('data-save-scope')) return true;
  const texts = Array.from(scope.querySelectorAll<HTMLInputElement>(TEXTY));
  if (texts.some(x => x.value.trim() !== '')) return true;
  if (texts.length) return false;
  return !!scope.querySelector('input:checked, [aria-pressed="true"]')
    || Array.from(scope.querySelectorAll<HTMLSelectElement>('select')).some(s => s.value !== '');
}

function unlock(scope: HTMLElement) {
  scope.removeAttribute('data-locked');
  scope.querySelectorAll(':scope .sl-bar').forEach(b => b.remove());
  scope.querySelectorAll<HTMLElement>('[data-sl]').forEach(el => {
    (el as HTMLInputElement).disabled = false; el.removeAttribute('data-sl');
  });
  scope.querySelectorAll<HTMLElement>('[data-sl-hide]').forEach(el => el.removeAttribute('data-sl-hide'));
  const first = scope.querySelector<HTMLElement>(TEXTY + ', select');
  first?.focus({ preventScroll: false });
}

function lock(scope: HTMLElement, trigger: HTMLElement | null) {
  scope.setAttribute('data-locked', '');
  scope.querySelectorAll<HTMLElement>('input, textarea, select, button').forEach(el => {
    const c = el as HTMLInputElement;
    if (c.disabled || el.closest('.sl-bar')) return;
    c.disabled = true; el.setAttribute('data-sl', '');
  });
  /* Buttons that did something (Save, Cancel, Clear, presets) have no place in
     a saved state. Chips and pickers stay, showing what was chosen. */
  scope.querySelectorAll<HTMLElement>('button.btn, button[type=submit], input[type=submit]').forEach(el => {
    if (!el.closest('.sl-bar')) el.setAttribute('data-sl-hide', '');
  });
  if (trigger && scope.contains(trigger)) trigger.setAttribute('data-sl-hide', '');

  const bar = document.createElement('div');
  bar.className = 'sl-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span class="sl-tick" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2.4 6.3l2.3 2.3 4.9-5.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
    + '<span class="sl-text"><b>Saved</b><span>Press Edit to change anything.</span></span>';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'sl-edit'; edit.textContent = 'Edit';
  edit.addEventListener('click', () => unlock(scope));
  bar.appendChild(edit);
  scope.appendChild(bar);
  try {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = bar.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) bar.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
  } catch { /* scrolling is a nicety */ }
}

function settle(ctx: Ctx) {
  /* Wait for the form's own follow-up (a refresh, a reset, closing itself)
     before deciding whether anything is still open to edit. */
  window.setTimeout(() => {
    const { scope, trigger } = ctx;
    if (!scope.isConnected || scope.hasAttribute('data-locked')) return;
    if (!filled(scope)) return;
    lock(scope, trigger);
  }, 650);
}

export default function SaveLock() {
  useEffect(() => {
    const w = window as any;
    if (w.__saveLock) return;
    w.__saveLock = true;

    document.addEventListener('click', e => remember(e.target), true);
    document.addEventListener('submit', e => remember(e.target, (e as SubmitEvent).submitter), true);

    const orig = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let ctx: Ctx | null = null;
      try {
        const req = input instanceof Request ? input : null;
        const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : (req?.url ?? '');
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        if (method !== 'GET' && method !== 'DELETE' && method !== 'HEAD' && path.startsWith('/api/') && !SKIP.test(path)
          && last && Date.now() - last.t < 2500) { ctx = last; last = null; }
      } catch { /* never get in the way of a request */ }
      const res = await orig(input, init);
      if (ctx && res.ok) settle(ctx);
      return res;
    };
  }, []);
  return null;
}
