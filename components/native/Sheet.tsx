'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* A native bottom sheet: rises from the bottom on the iOS sheet curve, the
   page behind dims, and it closes the way a phone sheet closes, by dragging
   it down (from the grabber, or from anywhere once its own content is
   scrolled to the top), by tapping the dimmed page, or with Escape. */
export default function Sheet({ open, onClose, label, children, className = '' }: {
  open: boolean; onClose: () => void; label: string; children: React.ReactNode; className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const g = useRef({ y: 0, t: 0, on: false, fromGrab: false });

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false); setDrag(0);
    const t = window.setTimeout(() => setMounted(false), 420);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [mounted, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  const start = (e: React.TouchEvent, fromGrab: boolean) => {
    const atTop = (body.current?.scrollTop ?? 0) <= 0;
    if (!fromGrab && !atTop) return;
    g.current = { y: e.touches[0].clientY, t: performance.now(), on: true, fromGrab };
  };
  const move = (e: React.TouchEvent) => {
    if (!g.current.on) return;
    const dy = e.touches[0].clientY - g.current.y;
    if (dy <= 0) { if (drag) setDrag(0); if (!g.current.fromGrab) g.current.on = false; return; }
    setDrag(dy);
  };
  const end = () => {
    if (!g.current.on) return;
    g.current.on = false;
    const v = drag / Math.max(1, performance.now() - g.current.t);
    const h = panel.current?.offsetHeight ?? 600;
    if (drag > Math.min(140, h * .3) || v > .55) onClose(); else setDrag(0);
  };

  return createPortal(
    <>
      <div className="nv-scrim" data-shown={shown ? '1' : '0'} onClick={onClose} />
      <div ref={panel} className={`nv-sheet ${className}${drag ? ' dragging' : ''}`} data-shown={shown ? '1' : '0'}
        role="dialog" aria-modal="true" aria-label={label}
        style={{ ['--drag' as any]: `${drag}px` }}
        onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
        <div className="nv-grab" onTouchStart={e => start(e, true)} aria-hidden="true" />
        <div ref={body} className="nv-sheet-body" onTouchStart={e => start(e, false)}>{children}</div>
      </div>
    </>,
    document.body
  );
}
