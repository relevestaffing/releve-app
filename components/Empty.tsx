import Link from 'next/link';
import type { Empty as E } from '@/lib/words';

/* One empty state, used everywhere. Says what is not here, why that is
   normal, and what happens next — in that order. A blank screen is the
   cheapest place to lose someone's confidence.

   Takes either a named entry from lib/words (`of`) or an inline title and
   body, for the one-off console states that are not worth a dictionary
   entry. Either way it is the same shape: mark, heading, one line. */
export default function Empty({ of, title, body, cta, children }: {
  of?: E; title?: string; body?: string; cta?: E['cta']; children?: React.ReactNode;
}) {
  const t = of?.title ?? title ?? '';
  const b = of?.body ?? body ?? '';
  const c = of?.cta ?? cta;
  return (
    <div className="card empty-card">
      <div className="empty-mark" aria-hidden="true" />
      <h3>{t}</h3>
      {b && <p className="small">{b}</p>}
      {children}
      {c && (
        <Link className="btn sm ghost" href={c.href} style={{ marginTop: 18 }}>
          {c.label}
        </Link>
      )}
    </div>
  );
}
