/* The value, as a sale — numbers first.
   ------------------------------------------------------------------
   Anchor high on what a full-time hire really costs, then the one small number
   beside it, then the money kept. No sourcing paragraph, no input. Relève's own
   side is a ceiling, not a quoted price; a placed executive sees their own. */

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/* An experienced California executive assistant, fully loaded. $100k base is the
   middle of the $80–120k that level commands, plus benefits/payroll and the
   one-time cost to recruit them. */
const CA_EA_SALARY = 100_000;
const BENEFITS_LOAD = 0.30;
const RECRUITING_FEE = 0.20;
const RELEVE_CEILING = 55_000; // annual — "under" this, set to the role

export default function ValueCalculator({ retainerMonthlyCents, placed }: {
  retainerMonthlyCents: number | null; placed: boolean;
}) {
  const fullOngoing = CA_EA_SALARY * (1 + BENEFITS_LOAD);      // 130,000
  const fullFirstYear = fullOngoing + CA_EA_SALARY * RECRUITING_FEE; // 150,000

  const hasRetainer = placed && retainerMonthlyCents != null;
  const releveYear = hasRetainer ? (retainerMonthlyCents! / 100) * 12 : RELEVE_CEILING;
  const releveFigure = hasRetainer ? fmt(releveYear) : 'Under $55,000';
  const over = hasRetainer ? '' : 'over ';
  const ongoingSave = fullOngoing - releveYear;     // ~75,000
  const firstYearSave = fullFirstYear - releveYear; // ~95,000

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>Same standard. A fraction of the cost.</h3>
          <span className="pill good"><span className="dot" />Save {over}{fmt(ongoingSave)} a year</span>
        </div>

        <div className="money-strip">
          <div className="money-stat">
            <div className="n">{fmt(fullFirstYear)}</div>
            <div className="k">Full-time · first year</div>
          </div>
          <div className="money-stat">
            <div className="n">{fmt(fullOngoing)}</div>
            <div className="k">Full-time · ongoing</div>
          </div>
          <div className="money-stat" style={{ boxShadow: 'inset 3px 0 0 var(--fern)' }}>
            <div className="n" style={{ color: 'var(--fern)' }}>{releveFigure}</div>
            <div className="k">Relève · per year</div>
          </div>
        </div>

        <p className="verdict" style={{ marginTop: 4 }}>
          The same calibre of executive assistant, in the seat in fourteen days — for {over}
          <b>{fmt(firstYearSave)}</b> less in year one, and {over}<b>{fmt(ongoingSave)}</b> less
          every year after.
        </p>
        <p className="xs muted" style={{ marginTop: 10 }}>
          Full-time figures include benefits, payroll and the one-time fee to recruit them.
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h3>The same hire, none of the overhead</h3></div>
        <ul className="plain">
          <li>No recruiting fee.</li>
          <li>No payroll, benefits or HR to run — they are a contractor, not headcount.</li>
          <li>In the seat in fourteen days, not months.</li>
          <li>Wrong fit? We replace them — no bad hire to exit.</li>
          <li>Cancel any month. No severance, no contract, no sunk spend.</li>
        </ul>
      </div>
    </>
  );
}
