import Link from 'next/link';
import type { Step } from '@/lib/onboarding';

/* Every setup page was a one-way trip. You finished your photo, and then you
   were simply on a page, with no sense of what was left or how to get back to
   the list — the first person to use it found her way by guessing at Menu.
   This goes at the foot of each setup page and answers both questions. */
export default function NextStep({ steps, current }: { steps: Step[]; current: string }) {
  const left = steps.filter(s => !s.done && s.key !== current);
  const next = left[0];

  return (
    <div className="next-step">
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {next ? 'Next' : 'That is everything'}
        </div>
        <div className="small">
          {next
            ? <>{next.title}{next.minutes ? ` — ${next.minutes}` : ''}. {next.blurb}</>
            : <>Your setup is complete. Nothing else is needed from you — we take it from here.</>}
        </div>
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {next && <Link className="btn solid" href={next.href}>Start it</Link>}
        <Link className="btn ghost" href="/app">
          {next ? 'Back to your list' : 'Back to your dashboard'}
        </Link>
      </div>
    </div>
  );
}
