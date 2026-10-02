'use client';
import { useEffect } from 'react';
import BrandedError from '@/components/BrandedError';

/* Anything below the root layout that throws lands here, inside the normal
   page (fonts and styles already loaded), rather than on Next's own screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[app]', error); }, [error]);
  return (
    <BrandedError
      eyebrow="A moment"
      title="This page did not load"
      line="Nothing you entered has been lost. Try again, and if it happens twice, write to us and we will look at it straight away."
      retry={reset} home="/" digest={error.digest} />
  );
}
