'use client';
import { useEffect } from 'react';
import BrandedError from '@/components/BrandedError';

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  /* An app left open across a deploy asks the new server for pages with the
     old script in hand. That shows up as a chunk or fetch failure; one fresh
     load fixes it, so take that load once rather than showing this screen. */
  useEffect(() => {
    const m = String(error?.message ?? '');
    if (!/chunk|Loading CSS|Failed to fetch|NetworkError|Load failed|server action|deployment/i.test(m)) return;
    try {
      if (sessionStorage.getItem('rv-skew-reload') === '1') return;
      sessionStorage.setItem('rv-skew-reload', '1');
      window.location.reload();
    } catch { /* then the screen stays, with the detail on it */ }
  }, [error]);
  useEffect(() => { console.error('[console]', error); }, [error]);
  return (
    <BrandedError
      eyebrow="Relève Console"
      title="This screen did not load"
      line="Usually a dropped connection or a database that is a migration behind. Try again; the reference below helps if you need to look further."
      retry={reset} home="/console" digest={error.digest} detail={error?.message} />
  );
}
