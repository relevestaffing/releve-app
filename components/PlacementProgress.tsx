import Link from 'next/link';
import type { Step } from '@/lib/care-public';
import { dueOn } from '@/lib/care-public';
import { daysFrom, todayIn } from '@/lib/experience-public';

/* A read-only look at the first fortnight, for the dashboard rail.
   ------------------------------------------------------------
   The full plan on the placement page has a checkbox next to every step, and
   the executive could tick their own. But Relève and the talent are the ones
   actually doing onboarding — the executive doesn't need a box to check, just
   somewhere to see where it stands. This card is that: a progress bar and
   whatever's next, no button anywhere on it. It steps aside once the plan is
   finished rather than sitting there as a stale "done" card forever. */
export default function PlacementProgress({ steps, startedOn, planHref, today: todayProp }: {
  steps: Step[]; startedOn: string; planHref: string;
  /* "today" in the reader's timezone; Pacific when it is not known. */
  today?: string;
}) {
  if (!steps.length) return null;

  const done = steps.filter(s => s.done).length;
  const total = steps.length;
  if (done === total) return null;

  const today = todayProp ?? todayIn('America/Los_Angeles');
  const totalDays = Math.max(14, ...steps.map(s => s.day + 1));
  const dayNumber = Math.min(totalDays, Math.max(1, daysFrom(startedOn.slice(0, 10), today) + 1));

  const next = steps.find(s => !s.done)!;
  const overdue = dueOn(startedOn, next.day) < today;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Your 30/60/90 day plan</h3>
        <span className="xs muted">{done} of {total} done</span>
      </div>
      <div className="fortnight-bar"><i style={{ width: `${(done / total) * 100}%` }} /></div>

      <div className="xs muted" style={{ marginBottom: 8 }}>Day {dayNumber} of {totalDays}</div>
      <p className="small" style={{ margin: 0 }}>
        Next: <b>{next.title}</b>
        {overdue && <span className="pill warn" style={{ marginLeft: 8 }}>Overdue</span>}
      </p>

      <div className="row" style={{ marginTop: 16 }}>
        <Link className="btn sm ghost" href={planHref}>See the full plan →</Link>
      </div>
    </div>
  );
}
