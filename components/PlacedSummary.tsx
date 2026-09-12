import Link from 'next/link';
import type { Placement } from '@/lib/work-public';
import { Portrait } from '@/components/Viz';
import { firstName } from '@/lib/words';

/* Who is working for this executive, at the top of their dashboard.
   ----------------------------------------------------------------
   Before this the dashboard was entirely search-shaped: an executive who had
   hired somebody months ago still opened their account to "your Client
   Success Manager is working the search". The placement existed, was being
   invoiced for, and was nowhere on the first screen. */
export default function PlacedSummary({
  placements, hiring
}: {
  placements: Placement[];
  hiring: boolean;
}) {
  if (!placements.length) return null;
  const one = placements.length === 1;

  return (
    <div className="card">
      <div className="card-head">
        <h3>{one ? 'Working with you' : `Your team of ${placements.length}`}</h3>
        {hiring && <span className="pill"><span className="dot" />And still hiring</span>}
      </div>

      <div className="stack" style={{ gap: 12 }}>
        {/* Two separate links, not one giant one — "message" and "open their
            page" are different jobs, and this is the one place on the
            dashboard both are a single tap away. */}
        {placements.map(p => (
          <div key={p.id} className="card" style={{ padding: '14px 16px' }}>
            <div className="row between" style={{ alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <Link href={one ? '/app/care' : `/app/care/${p.id}`} className="row"
                style={{ gap: 14, textDecoration: 'none', color: 'inherit' }}>
                <Portrait id={p.talent_id} name={p.talent_name} />
                <div>
                  <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', fontSize: 15 }}>
                    {p.talent_name}
                  </b>
                  <div className="xs muted">Since {p.started_on}</div>
                </div>
              </Link>
              <div className="row" style={{ gap: 16 }}>
                <Link href="/app/messages" className="btn sm ghost">Message</Link>
                <Link href={one ? '/app/care' : `/app/care/${p.id}`} className="choose-go">
                  {one ? 'Open the placement →' : `${firstName(p.talent_name)}’s page →`}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="xs muted" style={{ marginTop: 16, maxWidth: 620 }}>
        {hiring
          ? 'A search is still open alongside this, so your candidate screens stay where they are.'
          : 'Want a second person? Tell your Client Success Manager and we will open a new search — the hiring screens come back the moment we do.'}
      </p>
    </div>
  );
}
