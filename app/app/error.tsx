'use client';
import { useEffect } from 'react';
import BrandedError from '@/components/BrandedError';

export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[account]', error); }, [error]);
  return (
    <BrandedError
      eyebrow="Your account"
      title="This part of your account did not load"
      line="Everything you have saved is safe. Try again, or write to us and your Success Manager will pick it up."
      retry={reset} home="/app" digest={error.digest} />
  );
}
