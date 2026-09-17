import ValueCalculator from '@/components/ValueCalculator';

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
          The math
        </div>
        <h2 style={{ fontSize: 30, color: 'var(--cream)', marginBottom: 14, maxWidth: 620 }}>
          $130,000 a year, or under $55,000 for the same hire.
        </h2>
        <p className="small" style={{ color: 'var(--pale)', maxWidth: 640, margin: 0 }}>
          A full-time executive assistant of this calibre costs six figures once you count
          benefits, payroll and recruiting. Relève puts the same standard in the seat, in
          fourteen days, for a fraction of it.
        </p>
      </div>

      <ValueCalculator retainerMonthlyCents={retainerMonthlyCents} placed={placed} />
    </>
  );
}
