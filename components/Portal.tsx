'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/* Anything that covers the page (a scrim, a modal, a side panel) renders at
   the end of <body>, outside the page's own stacking and transform contexts.
   A fixed element inside a transformed or isolated ancestor is positioned
   against that ancestor, not the viewport: the 1 November dimension pass
   (cards that tilt, a main that isolates its light) made that visible. */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.body); }, []);
  return host ? createPortal(children, host) : null;
}
