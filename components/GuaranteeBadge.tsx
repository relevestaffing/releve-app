/* The 14-Day Placement Guarantee, made visible on the dashboard rather than
   buried in a paragraph of "needs attention" copy. It reads three ways:
   still counting down, met (a candidate arrived), or running past day
   fourteen — which the console's own guarantee_watch is already handling
   operationally, so this stays reassuring rather than alarming. */
export default function GuaranteeBadge({ openedAt, firstCandidateOn }: {
  openedAt: string; firstCandidateOn: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  /* Count ELAPSED days, the same convention the console's guarantee_watch
     uses (current_date - opened_at). The old +1 made the badge read "Day 15 /
     overdue" while the console still showed 14 days open — the two disagreed
     by a day on the client's own screen. */
  const dayNumber = Math.max(1, Math.round(
    (new Date((firstCandidateOn ?? today) + 'T00:00:00Z').getTime() -
     new Date(openedAt + 'T00:00:00Z').getTime()) / 86_400_000
  ));
  const met = !!firstCandidateOn;
  const withinPromise = met && dayNumber <= 14;
  const overdue = !met && dayNumber > 14;
  const pct = Math.min(100, (dayNumber / 14) * 100);

  return (
    <div className="card dark">
      <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 6 }}>
            The 14-Day Placement Guarantee
          </div>
          <p className="small" style={{ color: 'var(--cream)', margin: 0, maxWidth: 520 }}>
            {met
              ? withinPromise
                ? <>We put your first candidate in front of you on <b>day {dayNumber}</b> — inside our fourteen-day promise.</>
                : <>Your first candidate arrived on <b>day {dayNumber}</b>.</>
              : overdue
                ? <>Day <b>{dayNumber}</b> since your search opened. We are still finding the right person, not just an available one — your Client Success Manager is on this personally.</>
                : <>Day <b>{dayNumber} of 14.</b> One vetted candidate, chosen for you personally — never a list to sort through.</>}
          </p>
        </div>
        {met && withinPromise && <span className="pill good">Met</span>}
      </div>
      <div className="fortnight-bar">
        <i style={{ width: `${pct}%`, background: overdue ? 'var(--needs)' : undefined }} />
      </div>
    </div>
  );
}
