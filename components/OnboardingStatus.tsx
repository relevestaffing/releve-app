import type { Step } from '@/lib/onboarding';

/* Every onboarding step for one person, read as the team.
   ---------------------------------------------------------
   components/Checklist.tsx is the person's own "what's left for me, and
   where to go do it" — built to send them to their next step. Sage never
   acts from here: this is a status board for someone else's progress, so
   it never links anywhere and never changes anything. Just the same steps
   that checklist tracks, in the same order, each marked done or not — so
   she can see at a glance what a given executive or talent still has left,
   without opening their own dashboard to find out.

   Fed by the exact same step-builders (lib/onboarding.ts's talentSteps /
   clientSteps) the person's own checklist uses, so the two can never
   disagree about what counts as done. */
export default function OnboardingStatus({ steps, compact }: { steps: Step[]; compact?: boolean }) {
  const done = steps.filter(s => s.done).length;
  const complete = done === steps.length;
  const list = (
    <ul className="plain" style={{ marginTop: compact ? 10 : 0 }}>
      {steps.map(s => (
        <li key={s.key} className={compact ? 'xs' : 'small'} style={{ marginBottom: 6 }}>
          <span className={s.done ? '' : 'muted'}>{s.done ? '✓' : '○'} {s.title}</span>
          {s.critical && !s.done && <span className="xs muted"> · needed to match</span>}
        </li>
      ))}
    </ul>
  );

  if (compact) {
    return (
      <details className="onboarding-status">
        <summary>
          <span className={`pill ${complete ? 'good' : 'warn'}`}>
            <span className="dot" />Onboarding {done}/{steps.length}
          </span>
        </summary>
        {list}
      </details>
    );
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Onboarding</h3>
        <span className={`pill ${complete ? 'good' : 'warn'}`}><span className="dot" />{done}/{steps.length} done</span></div>
      {list}
    </div>
  );
}
