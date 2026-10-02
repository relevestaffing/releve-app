import type { Metadata } from 'next';
import BrandedError from '@/components/BrandedError';

export const metadata: Metadata = { title: 'Not found · Relève' };

/* Every unknown address, and every notFound() an account page raises for a
   record that is not yours, lands here rather than on Next's own page. */
export default function NotFound() {
  return (
    <BrandedError
      eyebrow="Not found"
      title="There is nothing at this address"
      line="The link may be out of date, or the page may belong to another account. Your own account is one step back."
      home="/app" />
  );
}
