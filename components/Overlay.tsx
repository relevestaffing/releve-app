'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Portal from './Portal';
import Sheet from './native/Sheet';

/* A form that opens over the page rather than inside it. The create actions
   on the list pages (send onboarding, write a role) live in a card head now,
   and a form unfolding inside a card head has nowhere to go; this gives it
   the .scrim/.modal shell that globals.css already defines. Escape and a
   click on the scrim both close it.

   In the phone app shell (html.rv-native, 3 November 2026) the same form
   rises as a bottom sheet instead, and closes by dragging it down. The form
   keeps its own .modal panel colours inside the sheet. */
export default function Overlay({ onClose, label, children }: {
  onClose: () => void; label: string; children: React.ReactNode;
}) {
  const [native] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('rv-native'));
  const [open, setOpen] = useState(true);
  const closing = useRef(false);

  /* the sheet plays its way down before the parent takes the form away */
  const close = useCallback(() => {
    if (!native) { onClose(); return; }
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    window.setTimeout(onClose, 360);
  }, [native, onClose]);

  useEffect(() => {
    if (native) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [native, onClose]);

  if (native) return (
    <Sheet open={open} onClose={close} label={label}>
      <div className="modal" role="document">{children}</div>
    </Sheet>
  );
  return (
    <Portal>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </Portal>
  );
}
