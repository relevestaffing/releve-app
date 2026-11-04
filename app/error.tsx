'use client';
import { useEffect } from 'react';
import BrandedError from '@/components/BrandedError';

/* Anything below the root layout that throws lands here, inside the normal
   page (fonts and styles already loaded), rather than on Next's own screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
  useEffect(() => { console.error('[app]', error); }, [error]);
  return (
    <BrandedError
      eyebrow="A moment"
      title="This page did not load"
      line="Nothing you entered has been lost. Try again, and if it happens twice, write to us and we will look at it straight away."
      retry={reset} home="/" digest={error.digest} detail={error?.message} />
  );
}
