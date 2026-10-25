'use client';
import { useEffect } from 'react';

/* A form that opens over the page rather than inside it. The create actions
   on the list pages (send onboarding, write a role) live in a card head now,
   and a form unfolding inside a card head has nowhere to go; this gives it
   the .scrim/.modal shell that globals.css already defines. Escape and a
   click on the scrim both close it. */
export default function Overlay({ onClose, label, children }: {
  onClose: () => void; label: string; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </>
  );
}
