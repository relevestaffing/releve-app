'use client';
import { useState } from 'react';
import { TERMS_VERSION } from '@/lib/money-public';
import { toast } from '@/components/Toast';

/* Shown once, before anything else, to an account that has never accepted the
   current terms. It is a gate rather than a banner on purpose: an agreement
   nobody had to look at is not much of an agreement.

   The links open in a new tab so nobody loses their place, and the button
   stays disabled until the box is ticked — a pre-ticked box is not consent in
   most of the places Relève operates. */
export default function TermsGate({ name }: { name?: string | null }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!agreed) return;
    setBusy(true);
    try {
      const r = await fetch('/api/terms', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: TERMS_VERSION })
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.bad(d.error ? `Not recorded — ${d.error}` : 'That did not record. Please try again.');
        setBusy(false); return;
      }
      window.location.reload();
    } catch {
      toast.bad('No connection — nothing was recorded.');
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img className="logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="welcome-card">
          <h1>{name ? `One moment, ${name.split(' ')[0]}` : 'One moment'}</h1>
          <p className="lede">
            Before you go any further, please read how Relève works and what we do
            with your information.
          </p>

          <div className="terms-links">
            <a href="https://relevestaffing.com/terms" target="_blank" rel="noreferrer">
              Terms of Service
            </a>
            <a href="https://relevestaffing.com/privacy" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
          </div>

          <p className="small muted" style={{ marginTop: 18 }}>
            Worth knowing before you tick the box: placements carry a three-month
            minimum, invoices go out on the first Monday of each month, and there
            is a twelve-month non-circumvention clause covering anyone we
            introduce you to. All of it is in Section 5 and Section 6.
          </p>

          <label className="terms-tick">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <span>I have read and accept the Terms of Service and the Privacy Policy.</span>
          </label>

          <button className="btn solid" disabled={!agreed || busy} onClick={accept}>
            {busy ? 'One moment…' : 'Continue'}
          </button>

          <p className="xs muted" style={{ marginTop: 16 }}>
            We record the date you accepted and which version you saw. Version {TERMS_VERSION}.
          </p>
        </div>
      </div>
    </div>
  );
}
