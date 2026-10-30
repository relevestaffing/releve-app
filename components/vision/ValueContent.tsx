import ValueCalculator from '@/components/ValueCalculator';
import TimeBackCalculator from '@/components/TimeBackCalculator';

/* The body of "The value", as a fragment. The retainer is passed in — the real
   one on the page when a placement exists, null in the first-run tour, where the
   calculator falls to the middle of the published range. */
export default function ValueContent({ retainerMonthlyCents, placed }: {
  retainerMonthlyCents: number | null; placed: boolean;
}) {
  return (
    <>
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>
          {placed ? 'The math' : 'Your time'}
        </div>
        <h2 style={{ fontSize: 30, color: 'var(--cream)', marginBottom: 14, maxWidth: 620 }}>
          {placed
            ? '$130,000 a year, or under $55,000 for the same hire.'
            : 'Every hour they carry is an hour you get back.'}
        </h2>
        <p className="small" style={{ color: 'var(--pale)', maxWidth: 560, margin: 0 }}>
          {placed
            ? 'The same calibre of hire, once you count benefits, payroll and recruiting. Without the overhead, and inside fourteen days.'
            : 'Move the sliders to see the hours, the days and the value that return to you each year.'}
        </p>
      </div>

      {placed
        ? <ValueCalculator retainerMonthlyCents={retainerMonthlyCents} placed={placed} />
        : <TimeBackCalculator />}
    </>
  );
}
