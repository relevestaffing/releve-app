import Link from 'next/link';
import type { Empty as E } from '@/lib/words';

/* One empty state, used everywhere. Says what is not here, why that is
   normal, and what happens next — in that order. A blank screen is the
   cheapest place to lose someone's confidence. */
export default function Empty({ of, children }: { of: E; children?: React.ReactNode }) {
  return (
    <div className="card empty-card">
      <div className="empty-mark" aria-hidden="true" />
      <h3>{of.title}</h3>
      <p className="small">{of.body}</p>
      {children}
      {of.cta && (
        <Link className="btn sm ghost" href={of.cta.href} style={{ marginTop: 18 }}>
          {of.cta.label}
        </Link>
      )}
    </div>
  );
}
