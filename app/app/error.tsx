'use client';
import { useEffect } from 'react';
import BrandedError from '@/components/BrandedError';

export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
  useEffect(() => { console.error('[account]', error); }, [error]);
  return (
    <BrandedError
      eyebrow="Your account"
      title="This part of your account did not load"
      line="Everything you have saved is safe. Try again, or write to us and a person will pick it up."
      retry={reset} home="/app" digest={error.digest} detail={error?.message} />
  );
}
