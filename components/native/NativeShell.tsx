'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { haptic } from '@/lib/haptic';
import UnreadBadge from '../UnreadBadge';
import Sheet from './Sheet';
import { Glyph, glyphFor } from './icons';
import './console.css';

/* Relève on a phone, as an app (Nona, 3 November 2026: "it feels like a
   website ... I want it to feel like a $1 million app"). She chose a new phone
   shell in Relève's branding, native movement, thin tab icons and soft
   rounding on phones.

   Why this lives in the root layout: every page renders its own <Shell>, so
   anything inside it is torn down and rebuilt on each tap, which is exactly
   what makes a web app feel like a website. This shell is mounted once and
   never leaves: the glass top bar, the floating tab bar, the More sheet and
   the movement between screens all persist while only the page underneath
   changes. Each page tells it what it needs through a small JSON note the
   server-rendered Shell writes (#rv-native-ctx).

   Movement:
     tab     the four tabs switch in place with a quick dissolve, the lens
             under the tab glides to it at the touch
     push    any deeper screen slides in from the right over the last one,
             which drifts back and dims, the iOS way
     pop     the back button, or a swipe in from the left edge in the
             installed app, slides the screen away to the right
   A screen that is not ready within a fifth of a second arrives as a shaped
   placeholder on the same wall and fills in, so a tap is never a frozen
   pause. The bars never move. Text never drifts on its own. With reduced
   motion every change is instant. */

type Item = { href: string; label: string; icon?: string; hint?: string };
type Group = { group?: string; items: Item[] };
export type NativeCtx = {
  on: boolean; role: string; home: string; title: string; isHome: boolean; active?: string;
  tabs: Item[]; groups: Group[]; who: string; name: string; org?: string | null;
  profileHref?: string; unread: number; messagesHref: string; line?: string;
};
type Kind = 'push' | 'pop' | 'tab';

const PHONE = '(max-width:900px)';
/* two frames, or 80 ms if the browser holds frames back while a transition is being prepared */
const raf2 = () => new Promise<void>(r => { let done = false; const end = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => requestAnimationFrame(end)); window.setTimeout(end, 80); });

function readCtx(): NativeCtx | null {
  const el = document.getElementById('rv-native-ctx');
  if (!el?.textContent) return null;
  try { return JSON.parse(el.textContent) as NativeCtx; } catch { return null; }
}
function depth(d?: number) {
  try {
    if (d === undefined) return Number(sessionStorage.getItem('rv-depth') || 0);
    sessionStorage.setItem('rv-depth', String(Math.max(0, d)));
  } catch { /* private mode: no stack, back goes home */ }
  return 0;
}
/* the tab a path belongs to: its own, or the deepest tab it sits under */
function tabIndex(path: string, ctx: NativeCtx | null): number {
  if (!ctx) return -1;
  const own = ctx.active ? ctx.tabs.findIndex(t => t.href === ctx.active) : -1;
  if (own >= 0) return own;
  const exact = ctx.tabs.findIndex(t => t.href === path);
  if (exact >= 0) return exact;
  let best = -1, len = 0;
  ctx.tabs.forEach((t, i) => {
    if (t.href !== ctx.home && path.startsWith(t.href + '/') && t.href.length > len) { best = i; len = t.href.length; }
  });
  return best;
}

export default function NativeShell() {
  const router = useRouter();
  const path = usePathname();
  const [ctx, setCtx] = useState<NativeCtx | null>(null);
  const [phone, setPhone] = useState(false);
  const [tab, setTab] = useState(-1);
  const [more, setMore] = useState(false);
  const [ghost, setGhost] = useState<{ title: string; out: boolean } | null>(null);
  const [bar, setBar] = useState({ glass: false, title: false });
  const pending = useRef<null | (() => void)>(null);
  const ghostOn = useRef(false);
  const busy = useRef(false);
  const prefetched = useRef(new Set<string>());
  const titleAt = useRef(80);

  const active = !!(ctx?.on && phone);
  /* a tab's own screen, or one of its sibling views (Directory opens on its
     People view, Talent and Leads sit beside it); a record one level deeper
     (an executive, an invoice) is an inner screen with a back button */
  const tabKey = !!ctx && (ctx.active === ctx.home || ctx.tabs.some(t => t.href === ctx.active));
  const root = !!ctx && (path === ctx.home || ctx.tabs.some(t => t.href === path) ||
    (tabKey && path.split('/').filter(Boolean).length <= 2));

  /* the URL switch for the preview: ?native=1 turns it on in this browser, ?native=0 off */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('native');
    if (q === '1' || q === '0') {
      document.cookie = `rv_native=${q}; path=/; max-age=${q === '1' ? 31536000 : 0}; samesite=lax`;
      const u = new URL(window.location.href); u.searchParams.delete('native');
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    const m = window.matchMedia(PHONE);
    const set = () => setPhone(m.matches);
    set(); m.addEventListener('change', set);
    return () => m.removeEventListener('change', set);
  }, []);

  /* a page has committed: read its note, settle the movement, let the placeholder go */
  useEffect(() => {
    const c = readCtx();
    setCtx(c);
    const ti = tabIndex(path, c);
    setTab(prev => ti >= 0 ? ti : prev);
    setMore(false);
    const done = pending.current; pending.current = null; done?.();
    if (ghostOn.current) {
      ghostOn.current = false;
      setGhost(g => g && { ...g, out: true });
      window.setTimeout(() => setGhost(null), 260);
    }
    const h1 = document.querySelector('.topbar h1');
    titleAt.current = h1 ? h1.getBoundingClientRect().bottom + window.scrollY - 52 : 80;
    /* one orchestrated rise out of depth as the screen lands, then it rests */
    const root = document.documentElement;
    root.classList.remove('nv-land'); void root.offsetWidth; root.classList.add('nv-land');
    const t = window.setTimeout(() => root.classList.remove('nv-land'), 1400);
    return () => window.clearTimeout(t);
  }, [path]);

  /* The sheet rises over the wall: as the page scrolls, the wall settles back a little and the
     greeting dims behind the paper. One number (--cx-y, 0 to 1) drives it, on the compositor. */
  useEffect(() => {
    if (!active) return;
    const rootEl = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { rootEl.style.setProperty('--cx-y', '0'); return; }
    let tick = false;
    const read = () => { tick = false; rootEl.style.setProperty('--cx-y', Math.min(1, Math.max(0, window.scrollY / 260)).toFixed(3)); };
    const on = () => { if (!tick) { tick = true; requestAnimationFrame(read); } };
    read();
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); rootEl.style.removeProperty('--cx-y'); };
  }, [active, path]);

  useEffect(() => {
    document.documentElement.classList.toggle('rv-native', active);
    return () => document.documentElement.classList.remove('rv-native');
  }, [active]);

  /* the four tabs are loaded ahead, so switching between them is instant */
  useEffect(() => {
    if (!active || !ctx) return;
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 600));
    const id = idle(() => ctx.tabs.forEach(t => {
      if (t.href === path || prefetched.current.has(t.href)) return;
      prefetched.current.add(t.href);
      try { router.prefetch(t.href); } catch { /* best effort */ }
    }));
    return () => { try { (window as any).cancelIdleCallback?.(id); } catch {} };
  }, [active, ctx, path, router]);

  /* the top bar turns to glass once the page moves under it; the small title arrives when the big one leaves */
  useEffect(() => {
    if (!active) return;
    let tick = false;
    const read = () => {
      tick = false;
      const y = window.scrollY;
      setBar(b => {
        const n = { glass: y > 6, title: y > titleAt.current };
        return n.glass === b.glass && n.title === b.title ? b : n;
      });
    };
    const on = () => { if (!tick) { tick = true; requestAnimationFrame(read); } };
    read();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [active, path]);

  /* one movement between two screens */
  const move = useCallback((kind: Kind, label: string, href: string, go: () => void) => {
    if (busy.current) return;
    busy.current = true;
    const doc: any = document;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const commit = (ms: number) => new Promise<'yes' | 'late'>(res => {
      pending.current = () => res('yes');
      window.setTimeout(() => res('late'), ms);
    });
    const placeholder = () => {
      ghostOn.current = true;
      flushSync(() => setGhost({ title: label, out: false }));
      /* never leave a placeholder up if the screen does not come */
      window.setTimeout(() => { if (ghostOn.current) { ghostOn.current = false; setGhost(null); } }, 9000);
    };
    const release = () => { busy.current = false; delete document.documentElement.dataset.vt; };
    window.setTimeout(() => { busy.current = false; }, 1200);
    const safeGo = () => { try { go(); } catch { release(); window.location.assign(href); } };
    if (calm || typeof doc.startViewTransition !== 'function') {
      safeGo();
      commit(kind === 'tab' ? 120 : 160).then(r => { if (r === 'late' && pending.current) placeholder(); release(); });
      return;
    }
    try {
      document.documentElement.dataset.vt = kind;
      const vt = doc.startViewTransition(async () => {
        safeGo();
        const r = await commit(kind === 'tab' ? 140 : 200);
        if (r === 'late' && pending.current) placeholder();
        await raf2();
      });
      vt.finished.then(release, release);
    } catch { safeGo(); release(); }
  }, []);

  const goTo = useCallback((href: string, label: string) => {
    if (!ctx) return;
    const ti = ctx.tabs.findIndex(t => t.href === href);
    const kind: Kind = ti >= 0 || href === ctx.home ? 'tab' : 'push';
    if (kind === 'tab') { setTab(ti); haptic(8); depth(0); } else depth(depth() + 1);
    flushSync(() => setMore(false));
    move(kind, label, href, () => router.push(href));
  }, [ctx, move, router]);

  const back = useCallback(() => {
    if (!ctx) return;
    const d = depth();
    const hist = d > 0 && window.history.length > 1;
    depth(d - 1);
    move('pop', '', ctx.home, () => hist ? router.back() : router.push(ctx.home));
  }, [ctx, move, router]);

  /* every in-app link on a phone moves like an app */
  useEffect(() => {
    if (!active || !ctx) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.dataset.native === 'skip') return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return;
      if (!url.pathname.startsWith('/app') && !url.pathname.startsWith('/console')) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      const label = (a.dataset.title || a.getAttribute('aria-label') || a.textContent || '').trim().split('\n')[0].slice(0, 40);
      goTo(url.pathname + url.search + url.hash, label);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, ctx, goTo]);

  /* swipe in from the left edge to go back (installed app only: Safari has its own) */
  useEffect(() => {
    if (!active || root) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (!standalone) return;
    let sx = 0, sy = 0, t = 0, dx = 0, on = false, locked = false;
    const els = () => Array.from(document.querySelectorAll<HTMLElement>('main.main > .topbar, main.main > .page-body'));
    const put = (x: number, anim = false) => els().forEach(el => {
      el.style.transition = anim ? 'transform .34s cubic-bezier(.32,.72,0,1), opacity .34s' : 'none';
      el.style.transform = x ? `translateX(${x}px)` : '';
      el.style.opacity = x ? String(1 - Math.min(.5, x / window.innerWidth)) : '';
    });
    const start = (e: TouchEvent) => {
      const p = e.touches[0];
      if (p.clientX > 22 || document.body.style.overflow === 'hidden') return;
      sx = p.clientX; sy = p.clientY; t = performance.now(); dx = 0; on = true; locked = false;
    };
    const mv = (e: TouchEvent) => {
      if (!on) return;
      const p = e.touches[0];
      dx = Math.max(0, p.clientX - sx);
      if (!locked) {
        if (Math.abs(p.clientY - sy) > 12 && Math.abs(p.clientY - sy) > dx) { on = false; put(0); return; }
        if (dx > 8) locked = true;
      }
      if (locked) { e.preventDefault(); put(dx); }
    };
    const end = () => {
      if (!on) return; on = false;
      if (!locked) return;
      const v = dx / Math.max(1, performance.now() - t);
      if (dx > window.innerWidth * .32 || v > .5) {
        document.documentElement.style.setProperty('--pop-from', `${dx}px`);
        put(0);
        back();
        window.setTimeout(() => document.documentElement.style.removeProperty('--pop-from'), 700);
      } else put(0, true);
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', mv, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', mv);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, [active, root, back]);

  if (!active || !ctx) return null;

  const n = ctx.tabs.length + 1;
  const lens = more ? ctx.tabs.length : tab;
  const tabSet = new Set(ctx.tabs.map(t => t.href));
  const rest = ctx.groups
    .map(g => ({ ...g, items: g.items.filter(i => !tabSet.has(i.href) && i.href !== ctx.home) }))
    .filter(g => g.items.length);

  return (
    <>
      <header className="nv-bar" data-glass={bar.glass ? '1' : '0'}>
        <div className="nv-left">
          {!root && (
            <button type="button" className="nv-btn" aria-label="Back" onClick={back}><Glyph k="back" /></button>
          )}
        </div>
        <div className={`nv-title${bar.title ? ' on' : ''}`} aria-hidden={!bar.title}>
          {ctx.isHome ? <img src="/logo-white.png" alt="" /> : ctx.title}
        </div>
        <div className="nv-right">
          <button type="button" className="nv-btn nv-ask" aria-label="Ask Relève"
            onClick={() => document.querySelector<HTMLButtonElement>('.ask-fab')?.click()}>
            <span>Ask</span>
          </button>
        </div>
      </header>

      <nav className="nv-tabs" aria-label="Main" style={{ ['--n' as any]: n, ['--i' as any]: Math.max(0, lens) }}
        data-lens={lens < 0 ? 'off' : 'on'}>
        <span className="nv-lens" aria-hidden="true" />
        <span className="nv-sheen" aria-hidden="true" />
        {ctx.tabs.map((t, i) => (
          <Link key={t.href} href={t.href} className="nv-tab" aria-current={i === tab && !more ? 'page' : undefined}
            data-title={t.label}>
            <Glyph k={glyphFor(t.href, t.icon)} />
            <span>{t.label}</span>
            {t.href === ctx.messagesHref && <UnreadBadge initial={ctx.unread} variant="dot" />}
          </Link>
        ))}
        <button type="button" className="nv-tab" aria-current={more ? 'page' : undefined}
          aria-expanded={more} onClick={() => { haptic(8); setMore(true); }}>
          <Glyph k="more" /><span>More</span>
        </button>
      </nav>

      {ghost && (
        <div className={`nv-ghost${ghost.out ? ' out' : ''}`} aria-hidden="true">
          <h2>{ghost.title || '\u00a0'}</h2>
          <div className="nv-sk" /><div className="nv-sk" /><div className="nv-sk" />
        </div>
      )}

      <Sheet open={more} onClose={() => setMore(false)} label="More" className="nv-more">
        <div className="nv-me">
          {ctx.profileHref
            ? <Link href={ctx.profileHref} className="nv-me-row" data-title="Your profile">
                <span className="nv-avatar" aria-hidden="true">{(ctx.name || 'R').trim().charAt(0)}</span>
                <span className="nv-me-text"><b>{ctx.name}</b><small>{ctx.org || ctx.who}</small></span>
                <Glyph k="chevron" />
              </Link>
            : <div className="nv-me-row">
                <span className="nv-avatar" aria-hidden="true">{(ctx.name || 'R').trim().charAt(0)}</span>
                <span className="nv-me-text"><b>{ctx.name}</b><small>{ctx.org || ctx.who}</small></span>
              </div>}
        </div>
        {rest.map((g, gi) => (
          <div className="nv-group" key={g.group ?? `g${gi}`}>
            {g.group && <div className="nv-group-h">{g.group}</div>}
            <div className="nv-list">
              {g.items.map(it => (
                <Link key={it.href} href={it.href} className="nv-row" data-title={it.label}>
                  <span className="nv-row-t">{it.label}{it.hint && <small>{it.hint}</small>}</span><Glyph k="chevron" />
                </Link>
              ))}
            </div>
          </div>
        ))}
        <form action="/api/signout" method="post" className="nv-group">
          <div className="nv-list"><button type="submit" className="nv-row nv-signout"><span>Sign out</span></button></div>
        </form>
      </Sheet>
    </>
  );
}
