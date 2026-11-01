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

    return () => {
      window.clearTimeout(later);
      io?.disconnect();
      bar?.removeEventListener('mousemove', move);
      bar?.removeEventListener('mouseleave', leave);
    };
  }, [pathname]);

  return null;
}
