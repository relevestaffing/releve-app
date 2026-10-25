import { money, DEPOSIT_CENTS, PLANS } from '@/lib/money-public';

/* The body of "How Relève works", as a fragment so it renders the same whether
   it sits inside the page (in Shell) or as a step in the first-run tour. No
   navigation lives here — the page and the tour each add their own footer — so
   nothing in a tour step ever navigates away mid-sequence.

   Rewritten 12 October 2026, from roughly 700 words to roughly 200. The person
   reading this has just come off a call with Sage: they are already sold, and
   re-pitching them at length reads as insecurity rather than confidence. Two
   rules applied throughout, and worth keeping to to whoever edits next:
   one idea per line, and never define Relève by what it is not. Every "this is
   not a job board / not a personality quiz / not an extra fee" came out —
   defending a thing nobody has attacked is the opposite of luxury. */

const METHOD: { t: string; d: string }[] = [
  { t: 'Your business, studied first',
    d: 'Your Client Success Manager learns how you operate and builds the role around what you actually need.' },
  { t: 'Your Executive Signature',
    d: 'About fifteen minutes measuring how you work. Every candidate is scored against it.' },
  { t: 'Vetted on six fronts',
    d: 'Tested against your role, background checked, scored against your Signature, with the reasons written out.' },
  { t: 'Prepared, then presented',
    d: 'Briefed on your tools and standards before you meet. Your calendar, your terms, your decision.' },
  { t: 'Handled from there',
    d: 'Your Client Success Manager and their Talent Success Manager carry the weekly reports, coaching and cover.' }
];

export default function HowContent() {
  return (
    <>
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>
          The whole idea
        </div>
        <h2 style={{ fontSize: 30, color: 'var(--cream)', marginBottom: 14, maxWidth: 620 }}>
          Someone you can trust with it. Everything after, handled.
        </h2>
        <p className="small" style={{ maxWidth: 580, color: 'var(--pale)' }}>
          One person, vetted on six fronts and matched to how you work, prepared
          for your role and in front of you within fourteen days.
        </p>
      </div>

      <h3 className="section-h">The method</h3>
      <ol className="method">
        {METHOD.map((m, i) => (
          <li key={m.t} className="method-step">
            <span className="method-n">{i + 1}</span>
            <div>
              <h4 style={{ fontSize: 18, marginBottom: 6 }}>{m.t}</h4>
              <p className="small muted" style={{ margin: 0, maxWidth: 560 }}>{m.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="card">
        <div className="card-head"><h3>What the match is made of</h3></div>
        <div className="money-strip">
          <div className="money-stat"><div className="n">12</div><div className="k">Working-style axes</div></div>
          <div className="money-stat"><div className="n">18</div><div className="k">Facets measured</div></div>
          <div className="money-stat"><div className="n">1</div><div className="k">Candidate at a time</div></div>
          <div className="money-stat"><div className="n">14</div><div className="k">Day placement promise</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Vetted before you meet them</h3></div>
        <ul className="plain">
          <li>Your business and role studied first.</li>
          <li>Skills tested against the work you will hand over.</li>
          <li>Scored against your Executive Signature.</li>
          <li>Identity, right to work and background checked.</li>
          <li>NDA and contractor agreement signed.</li>
          <li>Personally reviewed by our team before you see them.</li>
        </ul>
      </div>

      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 8 }}>
          The 14-Day Placement Guarantee
        </div>
        <p className="small" style={{ color: 'var(--cream)', maxWidth: 560, margin: 0 }}>
          One vetted candidate, chosen for you personally, in front of you within
          fourteen days. Not a list to sort. A person to meet.
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h3>What it costs</h3></div>
        <div className="money-strip">
          <div className="money-stat">
            <div className="n">{money(DEPOSIT_CENTS)}</div>
            <div className="k">To open your search</div>
          </div>
          <div className="money-stat">
            <div className="n">{money(PLANS.essential.monthlyCents)}–{money(PLANS.specialist.monthlyCents).replace('$', '')}</div>
            <div className="k">Monthly, unlimited hours. Starter: $950 a month, or $2,500 for three months, up to fifteen hours a week</div>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 4, maxWidth: 560 }}>
          The {money(DEPOSIT_CENTS)} opens your search and is credited in full against
          your first month. The retainer begins when your placement does, and there is
          no placement fee.
        </p>
      </div>
    </>
  );
}
