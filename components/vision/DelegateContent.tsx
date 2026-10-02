import { DISCIPLINES } from '@/lib/disciplines';

/* The body of "What to delegate", as a fragment — the same content whether it
   sits inside the page or as a step in the first-run tour. Reads the live
   discipline taxonomy, so it can never drift from what the matching understands. */
export default function DelegateContent() {
  return (
    <>
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 12 }}>
          Start here if the page feels blank
        </div>
        <h2 style={{ fontSize: 28, color: 'var(--cream)', marginBottom: 14, maxWidth: 620 }}>
          The hardest part of hiring is picturing what someone could take off your plate.
        </h2>
        <p className="small" style={{ maxWidth: 640, color: 'var(--pale)' }}>
          Most executives under-hire. They hand over the calendar and stop there, because the
          rest never occurs to them until they are drowning in it. Below is the whole territory
          a Relève placement can own, in the words we actually match on. Read it as a menu, not a
          checklist: pick the few areas that would give you your week back, and the role brief
          turns them into a real search.
        </p>
      </div>

      <div className="delegate-grid">
        {DISCIPLINES.map(d => (
          <div key={d.key} className="card delegate-card">
            <h3 style={{ fontSize: 19, marginBottom: 6 }}>{d.name}</h3>
            <p className="small muted" style={{ marginBottom: 14, minHeight: 40 }}>{d.blurb}</p>
            <div className="deleg-tags">
              {d.comps.slice(0, 5).map(c => (
                <span key={c.key} className="deleg-tag">{c.label}</span>
              ))}
              {d.comps.length > 5 && (
                <span className="deleg-tag more">+{d.comps.length - 5} more</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
