'use client';
import { useEffect } from 'react';
import BrandedError from '@/components/BrandedError';

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[console]', error); }, [error]);
  return (
    <BrandedError
      eyebrow="Relève Console"
      title="This screen did not load"
      line="Usually a dropped connection or a database that is a migration behind. Try again; the reference below helps if you need to look further."
      retry={reset} home="/console" digest={error.digest} />
  );
}
