'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import HowContent from '@/components/vision/HowContent';
import DelegateContent from '@/components/vision/DelegateContent';
import ValueContent from '@/components/vision/ValueContent';
import { CONTACT_EMAIL } from '@/lib/experience-public';
import './experience.css';

/* The executive's first sign-in. The three screens play in sequence, full
   screen, and they click through. Finishing marks the account onboarded so it
   never plays again, then drops them into the app. */
const STEPS = [
  <HowContent key="how" />,
  <DelegateContent key="delegate" />,
  <ValueContent key="value" retainerMonthlyCents={null} placed={false} />
];

export default function ExecFirstRun() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const last = i === STEPS.length - 1;

  async function finish() {
    setBusy(true);
    try {
      const r = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ onboarded: true })
      });
      if (!r.ok) toast.bad('Taking you through, though we could not save that you have seen this.');
    } catch {
      toast.bad('Taking you through, though we could not save that you have seen this.');
    }
    router.push('/app');
    router.refresh();
  }

  function next() {
    if (last) { finish(); return; }
    setI(i + 1);
    // start each screen from the top
    const s = document.querySelector('.firstrun-scroll');
    if (s) s.scrollTop = 0;
  }

  return (
    <div className="firstrun">
      <div className="firstrun-top">
        <img src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="firstrun-exit">
          <span className="firstrun-step">{i + 1} of {STEPS.length}</span>
          {/* Full screen, but never a trap: a person, or the door. */}
          <a className="gate-link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('A question about Relève')}`}>
            Write to us
          </a>
          <form action="/api/signout" method="post" style={{ margin: 0 }}>
            <button className="gate-link" type="submit">Sign out</button>
          </form>
        </div>
      </div>

      <div className="firstrun-scroll">
        <div className="firstrun-body stack" key={i}>
          {STEPS[i]}
        </div>
      </div>

      <div className="firstrun-foot">
        <div className="firstrun-foot-inner">
          <div className="dots" aria-hidden>
            {STEPS.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}
          </div>
          <div className="firstrun-acts">
            {i > 0 && (
              <button className="btn sm ghost" disabled={busy} onClick={() => {
                setI(i - 1);
                const s = document.querySelector('.firstrun-scroll');
                if (s) s.scrollTop = 0;
              }}>Back</button>
            )}
            <button className="btn sm solid" disabled={busy} onClick={next}>
              {busy ? 'One moment…' : last ? 'Take me to my account' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
