import { money, DEPOSIT_CENTS, RATE_MIN_CENTS, RATE_MAX_CENTS } from '@/lib/money-public';
import Explain from '@/components/Explain';

/* The body of "How Relève works", as a fragment so it renders the same whether
   it sits inside the page (in Shell) or as a step in the first-run tour. No
   navigation lives here — the page and the tour each add their own footer — so
   nothing in a tour step ever navigates away mid-sequence. */

const METHOD: { t: string; d: string }[] = [
  { t: 'A conversation first',
    d: 'Before anything is built, your Client Success Manager talks with you — what the seat is really for, who you are to work alongside, what has gone wrong with past hires. Relève is a matching platform, not a job board; the match starts with understanding, not a posting.' },
  { t: 'Your Executive Signature',
    d: 'You spend twenty to twenty-five minutes on the Signature — the instrument every candidate is measured against. It reads twelve working-style axes across eighteen facets: how you decide, how you delegate, where you want someone ahead of you and where you want them to wait to be asked. It is saved as you go, and it is the whole basis of who you are shown.' },
  { t: 'One person, chosen by hand',
    d: 'We do not send you a directory to sort through. Your manager sources against your Signature, vets the shortlist themselves, and puts a single person in front of you — the one they would stake the relationship on — with the reasons written out in plain words. If that one is not right, you tell us why, and the next is sharper for it.' },
  { t: 'You meet them',
    d: 'You interview on your own terms and your own calendar. Nobody is placed on you; the decision is always yours to make, and there is no pressure to take a candidate you are not sure of. A good no is worth more to the next match than a reluctant yes.' },
  { t: 'The working relationship',
    d: 'Once you place someone, the app becomes the place the two of you run the work: a shared task board, a light weekly check-in, and a care plan for the first weeks so a new hire lands well rather than being left to sink or swim. Your manager stays with you the whole time.' }
];

export default function HowContent() {
  return (
    <>
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 14 }}>
          The whole idea
        </div>
        <h2 style={{ fontSize: 30, color: 'var(--cream)', marginBottom: 14, maxWidth: 620 }}>
          One person, matched to how you actually work — not the first one available.
        </h2>
        <p className="small" style={{ maxWidth: 640, color: 'var(--pale)' }}>
          Most staffing sends you a stack of résumés and calls the sorting your job.
          Relève does the opposite: we measure how you work, source against it by hand,
          vet the person ourselves, and bring you the one we would stand behind — inside
          fourteen days of opening your search. What follows is exactly how that happens,
          and exactly what it costs.
        </p>
      </div>

      <h3 className="section-h">The method, step by step</h3>
      <ol className="method">
        {METHOD.map((m, i) => (
          <li key={m.t} className="method-step">
            <span className="method-n">{i + 1}</span>
            <div>
              <h4 style={{ fontSize: 18, marginBottom: 6 }}>{m.t}</h4>
              <p className="small muted" style={{ margin: 0, maxWidth: 620 }}>{m.d}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="card">
        <div className="card-head"><h3>What the match is made of</h3></div>
        <p className="small" style={{ marginBottom: 18, maxWidth: 640 }}>
          The Signature is not a personality quiz with a label at the end. It is a
          measured instrument, and it produces a specific, comparable profile that every
          candidate is scored against on the same terms.
        </p>
        <div className="money-strip">
          <div className="money-stat"><div className="n">12</div><div className="k">Working-style axes</div></div>
          <div className="money-stat"><div className="n">18</div><div className="k">Facets measured</div></div>
          <div className="money-stat"><div className="n">1</div><div className="k">Candidate at a time</div></div>
          <div className="money-stat"><div className="n">14</div><div className="k">Day placement promise</div></div>
        </div>
        <div style={{ marginTop: 4 }}>
          <Explain>
            You can see your own Signature in full on the Executive Signature page, axis by
            axis. The same numbers are what your candidate was ranked on before you ever saw
            their name.
          </Explain>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>How we vet, before you meet anyone</h3></div>
        <p className="small" style={{ marginBottom: 16, maxWidth: 640 }}>
          By the time a person reaches you, the checks are already done. Every candidate
          Relève puts forward has:
        </p>
        <ul className="plain">
          <li>verified their identity against a government document;</li>
          <li>signed an NDA and a contractor agreement, so the terms are settled before day one;</li>
          <li>completed a skills breakdown their manager has reviewed against your role.</li>
        </ul>
        <p className="small muted" style={{ marginTop: 14, maxWidth: 640 }}>
          It is why we send one name and not twenty — the work of trusting someone has
          been done for you, rather than handed to you.
        </p>
      </div>

      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 8 }}>
          The 14-Day Placement Guarantee
        </div>
        <p className="small" style={{ color: 'var(--cream)', maxWidth: 620, margin: 0 }}>
          One vetted candidate, chosen for you personally, in front of you within fourteen
          days of your search opening. Not a list to sort — a person to meet. If the search
          runs long, it is because we are still finding the right one rather than settling
          for an available one, and your manager is on it personally the whole way.
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
        <p className="small muted" style={{ marginTop: 4, maxWidth: 640 }}>
          The <b>{money(DEPOSIT_CENTS)}</b> deposit is what starts the sourcing — and it is
          not an extra fee. It is credited in full against your first month once you are
          placed, so the only thing it really buys is the search beginning now instead of
          after an invoice clears. The monthly retainer, set with you inside the range above,
          begins when your placement does, is prorated for the first partial month, and can
          be ended any month with notice. There is no separate placement fee and no long
          contract to sign.
        </p>
      </div>
    </>
  );
}
