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
export default function TermsGate({ name, side }: {
  name?: string | null;
  side?: 'client' | 'talent';
}) {
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState('');
  const [busy, setBusy] = useState(false);

  /* The executive signs. Talent tick, because they sign a separate agreement
     with a recorded signature during vetting — asking twice would be theatre. */
  const signs = side === 'client';
  const tidy = (v: string) => v.trim().replace(/\s+/g, ' ');
  const onFile = tidy(name ?? '');
  const nameOk = !signs
    || (tidy(signed).length >= 3
        && (!onFile || tidy(signed).toLowerCase() === onFile.toLowerCase()));
  const mismatch = signs && tidy(signed).length >= 3 && !nameOk;
  const ready = agreed && nameOk;

  async function accept() {
    if (!ready) return;
    setBusy(true);
    try {
      const r = await fetch('/api/terms', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: TERMS_VERSION, signed_name: signs ? tidy(signed) : null })
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
            {side === 'talent'
              ? <>Worth knowing before you tick the box: you work as a contractor rather
                  than an employee, Relève pays you directly each month, and for twelve
                  months after we introduce you to an executive, work with them goes
                  through us. All of it is in Section 5 and Section 6.</>
              : <>Worth knowing before you tick the box: placements carry a three-month
                  minimum, invoices go out on the first Monday of each month, and there
                  is a twelve-month non-circumvention clause covering anyone we
                  introduce you to. All of it is in Section 5 and Section 6.</>}
          </p>

          <label className="terms-tick">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <span>I have read and accept the Terms of Service and the Privacy Policy.</span>
          </label>

          {signs && (
            <div style={{ marginTop: 18 }}>
              <div className="ff" style={{ marginBottom: 0 }}>
                <label htmlFor="tg-sign">Sign by typing your full name</label>
                <input
                  id="tg-sign" type="text" value={signed} autoComplete="name" spellCheck={false}
                  placeholder={onFile || 'Your full name'}
                  onChange={e => setSigned(e.target.value)}
                  aria-invalid={mismatch || undefined}
                />
              </div>
              {mismatch ? (
                <p className="xs" style={{ color: '#8C4A3F', marginTop: 6 }}>
                  That does not match the name on this account{onFile ? ` (${onFile})` : ''}.
                  Sign as yourself, or tell us to correct the name first.
                </p>
              ) : (
                <p className="xs muted" style={{ marginTop: 6 }}>
                  Typing your name here is your signature. It is recorded with the date
                  and the version of the terms you were shown.
                </p>
              )}
            </div>
          )}

          <button className="btn solid" disabled={!ready || busy} onClick={accept}
            style={{ marginTop: signs ? 20 : undefined }}>
            {busy ? 'One moment…' : signs ? 'Sign and continue' : 'Continue'}
          </button>

          <p className="xs muted" style={{ marginTop: 16 }}>
            We record the date you accepted{signs ? ', the name you signed with,' : ''} and
            which version you saw. Version {TERMS_VERSION}.
          </p>
        </div>
      </div>
    </div>
  );
}
