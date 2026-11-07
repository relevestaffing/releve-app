'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { CONTACT_EMAIL } from '@/lib/experience-public';
import { sameSigner } from '@/lib/words';

/* The signing step under the agreement: confirm you have read it, type your
   full name, sign. The name has to be the one on the account. A copy is
   emailed the moment it is signed. */
export default function AgreementSign({ name, email, version, kind = 'client', token }: {
  name: string | null; email: string; version: string; kind?: 'client' | 'talent'; token?: string;
}) {
  const talent = kind === 'talent';
  const title = talent ? 'Independent Contractor and Confidentiality Agreement' : 'Client Services Agreement';
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState('');
  const [business, setBusiness] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { to: string; emailed: boolean }>(null);

  const tidy = (v: string) => v.trim().replace(/\s+/g, ' ');
  const onFile = tidy(name ?? '');
  const nameOk = tidy(signed).length >= 3 && (!onFile || sameSigner(tidy(signed), onFile));
  const mismatch = tidy(signed).length >= 3 && !nameOk;
  const ready = agreed && nameOk && !busy && (!talent || tidy(country).length >= 2);

  async function sign() {
    if (!ready) return;
    setBusy(true);
    try {
      const r = await fetch(token ? '/api/agreement/sign-link' : talent ? '/api/agreement/talent-sign' : '/api/agreement/sign', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, version, agreed: true, signed_name: tidy(signed), business: tidy(business), country: tidy(country) })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ?? 'The agreement was not signed. Please try again.'); setBusy(false); return; }
      setDone({ to: d.to ?? email, emailed: d.emailed !== false });
      if (token) { setTimeout(() => { window.location.href = `/pay/${encodeURIComponent(token)}`; }, 1600); return; }
      router.refresh();
    } catch {
      toast.bad('No connection, so nothing was signed. Please try again.');
      setBusy(false);
    }
  }

  if (done) return (
    <div className="card">
      <div className="card-head"><h3>Thank you. Your agreement is signed.</h3><span className="pill good"><span className="dot" />Filed</span></div>
      <p className="small" style={{ maxWidth: 560, marginBottom: 12 }}>
        {done.emailed
          ? <>A signed copy is on its way to <b>{done.to}</b>.{token ? ' Next, your deposit.' : ' It is also kept in your account.'}</>
          : <>Your agreement is signed and saved. We could not email your copy just now.{!talent && !token ? ' You can download it below.' : ''}</>}
      </p>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {token
          ? <a className="btn solid" href={`/pay/${encodeURIComponent(token)}`}>Continue to your deposit</a>
          : <a className="btn solid" href="/app">Continue to your account</a>}
        {!talent && !token && <a className="btn ghost" href="/api/agreement/copy">Download your copy</a>}
      </div>
    </div>
  );

  return (
    <div className="card agr-sign">
      <div className="card-head"><h3>Sign your agreement</h3></div>
      <label className="check-line">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        <span>{talent ? `I have read the ${title} above and I agree to it.` : `I have read the ${title} above and I agree to it. If I am signing for a business, I am authorized to bind it.`}</span>
      </label>
      <div className="ff"><label>Sign by typing your full name</label>
        <input value={signed} onChange={e => setSigned(e.target.value)} placeholder={onFile || 'Your full name'}
          autoComplete="name" aria-invalid={mismatch} />
        <span className="xs muted">
          {mismatch
            ? <>This does not match the name on your account{onFile ? <> ({onFile})</> : null}. Type it as shown, or <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Please correct the name on my account')}`}>ask us to correct the name</a>.</>
            : 'Typing your name here is your signature. It is recorded with the date, the version of the agreement and your email.'}
        </span>
      </div>
      {talent ? (
        <div className="ff"><label>Country of residence</label>
          <input value={country} onChange={e => setCountry(e.target.value)} autoComplete="country-name" />
        </div>
      ) : (
        <div className="ff"><label>Business legal name (leave blank if signing as an individual)</label>
          <input value={business} onChange={e => setBusiness(e.target.value)} autoComplete="organization" />
        </div>
      )}
      <button className="btn solid" disabled={!ready} onClick={sign}>{busy ? 'Signing…' : 'Sign the agreement'}</button>
      <p className="xs muted" style={{ marginTop: 10, maxWidth: 520 }}>
        A signed copy is emailed to {email}.
      </p>
    </div>
  );
}
