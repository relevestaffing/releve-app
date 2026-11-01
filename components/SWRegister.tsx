'use client';
import { useEffect } from 'react';

/* Registers public/sw.js — see that file for what it does and why. Fires
   once, after the page has already loaded, so it never competes with the
   very first paint for bandwidth on a cold launch. */
export default function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Best-effort only: a page that never gets the cache benefit is
        // no worse off than before this existed.
      });
    };
    /* The effect can run after the load event has already fired (client-side
       navigation, a fast cache hit), in which case a listener would never
       fire and the worker would never register on that visit. */
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
