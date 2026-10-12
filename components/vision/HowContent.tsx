import { money, DEPOSIT_CENTS, RATE_MIN_CENTS, RATE_MAX_CENTS } from '@/lib/money-public';

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
  { t: 'A conversation first',
    d: 'Your manager learns what the seat is really for, and what went wrong last time.' },
  { t: 'Your Executive Signature',
    d: 'Twenty minutes measuring how you work. Every candidate is scored against it.' },
  { t: 'One person, chosen by hand',
    d: 'Sourced against your Signature, vetted by your manager, with the reasons written out.' },
  { t: 'You meet them',
    d: 'Your calendar, your terms, your decision. A good no sharpens the next match.' },
  { t: 'The working relationship',
    d: 'A shared board, a weekly check-in, and your manager alongside you throughout.' }
];

export default function HowContent() {
  return (
    <>
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>
          The whole idea
        </div>
        <h2 style={{ fontSize: 30, color: 'var(--cream)', marginBottom: 14, maxWidth: 620 }}>
          One person, matched to how you actually work.
        </h2>
        <p className="small" style={{ maxWidth: 580, color: 'var(--pale)' }}>
          Most staffing sends a stack of résumés and calls the sorting your job.
          We send one person, vetted, within fourteen days.
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
          <li>Identity verified against a government document.</li>
          <li>NDA and contractor agreement signed.</li>
          <li>Skills reviewed against your role by their manager.</li>
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
            <div className="n">{money(RATE_MIN_CENTS)}–{money(RATE_MAX_CENTS).replace('$', '')}</div>
            <div className="k">Monthly retainer</div>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 4, maxWidth: 560 }}>
          The {money(DEPOSIT_CENTS)} opens your search and is credited in full against
          your first month. The retainer begins when your placement does. No placement
          fee, no contract.
        </p>
      </div>
    </>
  );
}
