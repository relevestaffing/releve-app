'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { CONTACT_EMAIL } from '@/lib/experience-public';

/* The signing step under the agreement: confirm you have read it, type your
   full name, sign. The name has to be the one on the account. A copy is
   emailed the moment it is signed. */
export default function AgreementSign({ name, email, version }: { name: string | null; email: string; version: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState('');
  const [business, setBusiness] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { to: string; emailed: boolean }>(null);

  const tidy = (v: string) => v.trim().replace(/\s+/g, ' ');
  const onFile = tidy(name ?? '');
  const nameOk = tidy(signed).length >= 3 && (!onFile || tidy(signed).toLowerCase() === onFile.toLowerCase());
  const mismatch = tidy(signed).length >= 3 && !nameOk;
  const ready = agreed && nameOk && !busy;

  async function sign() {
    if (!ready) return;
    setBusy(true);
    try {
      const r = await fetch('/api/agreement/sign', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, agreed: true, signed_name: tidy(signed), business: tidy(business) })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ?? 'That did not sign. Please try again.'); setBusy(false); return; }
      setDone({ to: d.to ?? email, emailed: d.emailed !== false });
      router.refresh();
    } catch {
      toast.bad('No connection. Nothing was signed.');
      setBusy(false);
    }
  }

  if (done) return (
    <div className="card">
      <div className="card-head"><h3>Signed. Thank you.</h3><span className="pill good"><span className="dot" />Filed</span></div>
      <p className="small" style={{ maxWidth: 560, marginBottom: 12 }}>
        {done.emailed
          ? <>Your signed copy is on its way to <b>{done.to}</b> for your records, and it is kept in your account.</>
          : <>Your agreement is signed and kept in your account. We could not email the copy just now; you can download it below.</>}
      </p>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <a className="btn solid" href="/app">Continue to your account</a>
        <a className="btn ghost" href="/api/agreement/copy">Download your copy</a>
      </div>
    </div>
  );

  return (
    <div className="card agr-sign">
      <div className="card-head"><h3>Sign your agreement</h3></div>
      <label className="check-line">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        <span>I have read the Client Services Agreement above and I agree to it.</span>
      </label>
      <div className="ff"><label>Sign by typing your full name</label>
        <input value={signed} onChange={e => setSigned(e.target.value)} placeholder={onFile || 'Your full name'}
          autoComplete="name" aria-invalid={mismatch} />
        <span className="xs muted">
          {mismatch
            ? <>That does not match the name on your account{onFile ? <> ({onFile})</> : null}. Sign as yourself, or <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Please correct the name on my account')}`}>ask us to correct the name</a> first.</>
            : 'Typing your name here is your signature. It is recorded with the date, the version of the agreement and your email.'}
        </span>
      </div>
      <div className="ff"><label>Business name (optional)</label>
        <input value={business} onChange={e => setBusiness(e.target.value)} autoComplete="organization" />
      </div>
      <button className="btn solid" disabled={!ready} onClick={sign}>{busy ? 'Signing…' : 'Sign agreement'}</button>
      <p className="xs muted" style={{ marginTop: 10, maxWidth: 520 }}>
        A copy is emailed to {email} straight away, and kept in your account.
      </p>
    </div>
  );
}
