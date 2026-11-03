'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/* The installed app has no browser, so no back button. On any screen that is
   not one of the main tabs, a back arrow sits beside the menu. In a normal
   browser tab it never shows (the browser has its own). */
const ROOTS = new Set([
  '/app', '/app/messages', '/app/pipeline', '/app/interviews', '/app/care', '/app/tasks', '/app/how', '/app/value',
  '/console', '/console/directory', '/console/placements', '/console/money', '/console/messages'
]);

export default function BackButton() {
  const path = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    document.documentElement.classList.toggle('rv-standalone', standalone);
    const shell = document.querySelector('.shell');
    if (!shell) return;
    const read = () => setScrolled(shell.classList.contains('scrolled'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(shell, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [path]);

  if (ROOTS.has(path)) return null;
  return (
    <button type="button" className={`rv-back${scrolled ? ' scrolled' : ''}`} aria-label="Back"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(path.startsWith('/console') ? '/console' : '/app');
      }}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4.5L6.5 10l5.5 5.5" />
      </svg>
    </button>
  );
}
