import Link from 'next/link';
import type { Step } from '@/lib/onboarding';

export default function Checklist({ steps, heading }: { steps: Step[]; heading?: string }) {
  const done = steps.filter(s => s.done).length;
  if (done === steps.length) return null;

  return (
    <div className="card" style={{ borderColor: 'var(--pale)' }}>
      <div className="card-head">
        <div>
          <h3>{heading ?? 'Getting set up'}</h3>
          <div className="small muted" style={{ marginTop: 4 }}>
            {done} of {steps.length} done{done === 0 ? ' — start with the first one' : ''}
          </div>
        </div>
        <span className="pill">{Math.round((done / steps.length) * 100)}%</span>
      </div>
      <div className="setup-rail"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="steps-list">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? 'done' : ''}>
            <span className="mark" aria-hidden>{s.done ? '✓' : i + 1}</span>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <b>{s.title}</b>
                {s.minutes && !s.done && <span className="pill">{s.minutes}</span>}
                {s.critical && !s.done && <span className="pill warn"><span className="dot" />Needed before you can be matched</span>}
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>{s.blurb}</div>
            </div>
            {!s.done && <Link className="btn sm ghost" href={s.href}>Start</Link>}
          </li>
        ))}
      </ol>
    </div>
  );
}
