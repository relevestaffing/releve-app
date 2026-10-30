import { DISCIPLINES } from '@/lib/disciplines';

/* The body of "What to delegate", as a fragment — the same content whether it
   sits inside the page or as a step in the first-run tour. Reads the live
   discipline taxonomy, so it can never drift from what the matching understands. */
export default function DelegateContent() {
  return (
    <>
      <div className="card dark">
        <div className="eyebrow" style={{ color: 'var(--pale)', marginBottom: 12 }}>
          Built around your business
        </div>
        <h2 style={{ fontSize: 28, color: 'var(--cream)', marginBottom: 14, maxWidth: 560 }}>
          We tune your assistant to your business.
        </h2>
        <p className="small" style={{ maxWidth: 520, color: 'var(--pale)' }}>
          Choose what you want off your plate. We shape the role, and match your
          person, around how your business actually runs.
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
