import Link from 'next/link';
import type { Step } from '@/lib/onboarding';

/* What is left to set up.
   ----------------------
   The old version stamped a label on everything: a boxed "10 MIN" and a boxed
   "NEEDED TO BE MATCHED" on almost every row, then a bordered START button on
   each. Fourteen boxes down a column, all the same weight, so nothing read as
   more important than anything else and the whole thing looked like a form to
   be endured rather than a short sequence with an obvious first move.

   Two changes carry it. The step you should do now is lifted out and given
   room; everything after it is a quiet list. And the "needed to be matched"
   warning is said once, in the header, rather than repeated on four rows —
   a label on nearly every item is not a label, it is texture. */
export default function Checklist({ steps, heading }: { steps: Step[]; heading?: string }) {
  const done = steps.filter(s => s.done).length;
  if (done === steps.length) return null;

  const next = steps.find(s => !s.done)!;
  /* What is left, then what is finished. Leaving completed steps in their
     original position put a tick between steps two and three and made the
     numbering look broken — and anything already done is the least useful
     thing on the screen. */
  const rest = [
    ...steps.filter(s => s !== next && !s.done),
    ...steps.filter(s => s.done)
  ];
  const blocking = steps.filter(s => s.critical && !s.done).length;

  return (
    <div className="setup">
      <div className="setup-head">
        <div>
          <h3>{heading ?? 'Getting set up'}</h3>
          <p className="setup-count">
            {done === 0
              ? `${steps.length} things, and the first is below`
              : `${done} of ${steps.length} done`}
          </p>
        </div>
        {/* One mark per step, filled from the left. Marking them in place
            meant the finished ones sat wherever they happened to be in the
            list — two done out of seven rendered as 0101000, which reads as
            decoration rather than progress. This is a gauge, not a map. */}
        <div className="setup-marks" aria-hidden>
          {steps.map((s, n) => <i key={s.key} className={n < done ? 'on' : ''} />)}
        </div>
      </div>

      {blocking > 0 && (
        <p className="setup-note">
          {blocking === 1
            ? 'One of these is needed before you can be matched.'
            : `${blocking} of these are needed before you can be matched.`}
        </p>
      )}

      {/* The one to do now. Given the room to look like a decision rather than
          a row in a table. */}
      <Link href={next.href} className="setup-next">
        <div className="setup-next-body">
          <div className="eyebrow">Start here</div>
          <h4>{next.title}</h4>
          <p>{next.blurb}</p>
        </div>
        <div className="setup-next-go">
          {next.minutes && <span className="setup-mins">{next.minutes}</span>}
          <span className="setup-arrow" aria-hidden>→</span>
        </div>
      </Link>

      {rest.length > 0 && (
        <ol className="setup-rest">
          {/* No numerals. They were taken from each step's position in the
              original list, so with one step lifted out as "start here" and
              the finished ones moved to the bottom, the visible sequence read
              3, 5, 6, 7 — which looks like a bug because it is one. The order
              down the page is the order; the header already says how many
              there are. The mark is the same tick the website uses. */}
          {rest.map(s => s.done ? (
            <li key={s.key} className="done">
              <span className="n" aria-hidden>✓</span>
              <span className="t">{s.title}</span>
              <span className="m">Done</span>
            </li>
          ) : (
            <li key={s.key}>
              <Link href={s.href}>
                <span className="tick" aria-hidden />
                <span className="t">{s.title}</span>
                {s.minutes && <span className="m">{s.minutes}</span>}
                <span className="a" aria-hidden>→</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
