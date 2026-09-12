'use client';
import { useEffect } from 'react';

/* Registers public/sw.js — see that file for what it does and why. Fires
   once, after the page has already loaded, so it never competes with the
   very first paint for bandwidth on a cold launch. */
export default function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Best-effort only — a page that never gets the cache benefit is
        // no worse off than before this existed.
      });
    });
  }, []);
  return null;
}
