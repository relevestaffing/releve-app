'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/* The finishing touches from the website's /discovery page, brought into the
   app (29 Oct 2026). Sage loved that page's motion and asked for it here;
   square corners stay, by her call. Three things, all decoration only:

   1. Figures count up the first time they scroll into view (run rate,
      stat tiles, scores). The count writes to the figure's existing text
      node and gives way the moment React writes to it, so a live update
      always wins and the figure always ends on the real value.
   2. The page title rises in on every page change.
   3. A soft light follows the cursor across the fern header on desktop.

   If this component never runs, nothing is hidden and nothing changes. */

const FIGURES = '.founder-n, .founder-t-n, .money-stat .n, .card.stat .score, .card.stat .mono-num, .fb-score .n';

function parse(text: string) {
  const m = text.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/s);
  if (!m) return null;
  const raw = m[2];
  const value = parseFloat(raw.replace(/,/g, ''));
  if (!isFinite(value) || value === 0) return null;
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  return { pre: m[1], post: m[3], value, decimals, commas: raw.includes(',') };
}

function format(n: number, p: NonNullable<ReturnType<typeof parse>>) {
  const s = p.commas
    ? n.toLocaleString('en-US', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
    : n.toFixed(p.decimals);
  return p.pre + s + p.post;
}

function countUp(el: Element) {
  if (el.childNodes.length !== 1 || el.firstChild!.nodeType !== Node.TEXT_NODE) return;
  const node = el.firstChild as Text;
  const original = node.nodeValue || '';
  const p = parse(original.trim());
  if (!p) return;
  let last = '';
  const t0 = performance.now();
  const step = (t: number) => {
    if (last && node.nodeValue !== last) return;          // React wrote a new value: let it stand
    const k = Math.min(1, (t - t0) / 1300), e = 1 - Math.pow(1 - k, 3);
    last = k < 1 ? format(p.value * e, p) : original;
    node.nodeValue = last;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function Flourish() {
  const pathname = usePathname();

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* 2. title rise, replayed on each navigation */
    const h1 = document.querySelector('.topbar h1');
    if (h1 && !reduced) {
      h1.classList.remove('title-rise');
      void (h1 as HTMLElement).offsetWidth;
      h1.classList.add('title-rise');
    }

    /* 1. count-up figures */
    const seen = new WeakSet<Element>();
    const io = !reduced && 'IntersectionObserver' in window
      ? new IntersectionObserver(es => es.forEach(e => {
          if (e.isIntersecting) { io!.unobserve(e.target); countUp(e.target); }
        }), { threshold: 0.6 })
      : null;
    const scan = () => {
      if (!io) return;
      document.querySelectorAll(FIGURES).forEach(el => { if (!seen.has(el)) { seen.add(el); io.observe(el); } });
    };
    scan();
    const later = window.setTimeout(scan, 900);              // figures that load their own data

    /* 3. light on the header */
    const bar = document.querySelector<HTMLElement>('.topbar');
    const fine = window.matchMedia('(pointer:fine) and (min-width:901px)').matches;
    const move = (e: MouseEvent) => {
      if (!bar) return;
      const r = bar.getBoundingClientRect();
      bar.style.setProperty('--gx', `${e.clientX - r.left}px`);
      bar.style.setProperty('--gy', `${e.clientY - r.top}px`);
      bar.classList.add('lit');
    };
    const leave = () => bar?.classList.remove('lit');
    if (bar && fine && !reduced) {
      bar.addEventListener('mousemove', move);
      bar.addEventListener('mouseleave', leave);
    }

    /* 4. Depth: cards lean a degree toward the cursor and catch a soft light.
       Spring-smoothed (each frame closes part of the gap) so it settles like
       a physical thing rather than snapping to the pointer. Desktop only. */
    let card: HTMLElement | null = null;
    let raf = 0;
    const cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };
    const step = () => {
      cur.x += (tgt.x - cur.x) * 0.14; cur.y += (tgt.y - cur.y) * 0.14;
      if (card) card.style.transform = `perspective(1400px) rotateX(${cur.y.toFixed(3)}deg) rotateY(${cur.x.toFixed(3)}deg) translateY(-4px)`;
      if (Math.abs(tgt.x - cur.x) > 0.005 || Math.abs(tgt.y - cur.y) > 0.005) raf = requestAnimationFrame(step);
      else { raf = 0; if (card && tgt.x === 0 && tgt.y === 0) { card.style.transform = ''; card.classList.remove('leaning'); card = null; } }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    const onMove = (e: PointerEvent) => {
      const c = (e.target as HTMLElement | null)?.closest('.page-body > .card, .page-body > .stack > .card, .page-body > :is(.grid-2,.grid-3,.grid-4) > .card, .page-body > .setup, .qa-tile, .choose-card, .welcome-card, .auth-card') as HTMLElement | null;
      if (c !== card) {
        if (card) { card.style.transform = ''; card.classList.remove('leaning'); }
        card = c; cur.x = 0; cur.y = 0;
      }
      /* A card with a form or a table in it holds still: nothing should
         swing under a hand that is typing or reading across columns. */
      if (card && card.querySelector('input:not([type=hidden]), textarea, select, table')) { card = null; }
      if (!card) { tgt.x = 0; tgt.y = 0; return; }
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      const max = r.width > 900 ? 1.6 : r.width > 600 ? 2.6 : 4;
      tgt.x = (px - .5) * 2 * max; tgt.y = (.5 - py) * 2 * max;
      card.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
      card.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
      card.classList.add('leaning');
      kick();
    };
    const onOut = () => { tgt.x = 0; tgt.y = 0; kick(); };
    if (fine && !reduced) {
      document.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onOut);
    }

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onOut);
      if (raf) cancelAnimationFrame(raf);
      if (card) { card.style.transform = ''; card.classList.remove('leaning'); }
      window.clearTimeout(later);
      io?.disconnect();
      bar?.removeEventListener('mousemove', move);
      bar?.removeEventListener('mouseleave', leave);
    };
  }, [pathname]);

  return null;
}
