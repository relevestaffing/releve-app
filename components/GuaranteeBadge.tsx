import { daysFrom } from '@/lib/experience-public';

/* The 14-day promise, on the dashboard rather than in a paragraph.
   ---------------------------------------------------------------
   What the promise is, said one way everywhere: a qualified candidate within
   fourteen days of the search opening, and a replacement if a hire does not
   work out. It counts toward the first candidate (which is what the console's
   guarantee_watch measures), uses the search's own guarantee_days rather than
   a hard-coded fourteen, and reads three ways: counting, met, or past the
   day, where it stays calm and says what happens next. */
export default function GuaranteeBadge({ openedAt, firstCandidateOn, guaranteeDays = 14, today }: {
  openedAt: string; firstCandidateOn: string | null;
  guaranteeDays?: number | null;
  /* "today" in the reader's timezone, YYYY-MM-DD. */
  today: string;
}) {
  const days = guaranteeDays && guaranteeDays > 0 ? guaranteeDays : 14;
  /* Elapsed days, the same convention as the console (current_date - opened_at). */
  const dayNumber = Math.max(1, daysFrom(openedAt.slice(0, 10), (firstCandidateOn ?? today).slice(0, 10)));
  const met = !!firstCandidateOn;
  const withinPromise = met && dayNumber <= days;
  const past = !met && dayNumber > days;
  const pct = Math.min(100, (dayNumber / days) * 100);

  return (
    <div className="card dark">
      <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 6 }}>
            {days}-day promise: a qualified candidate within {days} days
          </div>
          <p className="small" style={{ color: 'var(--cream)', margin: 0, maxWidth: 560 }}>
            {met
              ? withinPromise
                ? <>Your first candidate was in front of you on <b>day {dayNumber}</b>, inside the promise.</>
                : <>Your first candidate was in front of you on <b>day {dayNumber}</b>.</>
              : past
                ? <>Day <b>{dayNumber}</b>. We are holding out for the right person rather than an available one, and your Client Success Manager is on this search personally. You will hear from them with an update.</>
                : <>Day <b>{dayNumber} of {days}</b>. One vetted candidate, chosen for you by hand, never a list to sort through.</>}
          </p>
          <p className="xs" style={{ color: 'var(--pale)', margin: '10px 0 0', maxWidth: 560 }}>
            And if a hire does not work out, we find the replacement.
          </p>
        </div>
        {withinPromise && <span className="pill good"><span className="dot" />Kept</span>}
      </div>
      <div className="fortnight-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
