'use client';
import { useId, useState } from 'react';

const CALENDLY = 'https://calendly.com/hello-relevestaffing/30min';

/* The public "I'm interested" form. Posts JSON to /api/interest on the same
   origin, so there is no CORS to think about here. On success it clears the
   fields and shows a calm, one-line confirmation in the house voice rather
   than throwing the form back at the person. */
export default function InterestedForm() {
  const fid = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');
  const [need, setNeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, org, need, source: 'website' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data?.error || 'That did not go through. Please try again in a moment.'); return; }
      setName(''); setEmail(''); setOrg(''); setNeed('');
      setDone(true);
    } catch {
      setErr('That did not go through. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Relève Executive Staffing</div>
        <h2 style={{ fontSize: 24, marginBottom: 12 }}>Thank you</h2>
        <p className="note">We have your details and we will be in touch shortly. Consider it handled.</p>
        <p className="note" style={{ marginTop: 20 }}>
          Ready to talk now? <a href={CALENDLY}>Book a discovery call.</a>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Relève Executive Staffing</div>
      <h2 style={{ fontSize: 24, marginBottom: 10 }}>Tell us you&rsquo;re interested</h2>
      <p className="note" style={{ marginBottom: 24 }}>
        Leave your details and a little about the role, and a person will be in touch. No pressure, no obligation.
      </p>
      <form onSubmit={submit}>
        <div className="ff">
          <label htmlFor={`${fid}-name`}>Your name</label>
          <input id={`${fid}-name`} type="text" required value={name}
            onChange={e => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="ff">
          <label htmlFor={`${fid}-email`}>Email</label>
          <input id={`${fid}-email`} type="email" required value={email}
            onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
        </div>
        <div className="ff">
          <label htmlFor={`${fid}-org`}>Company (optional)</label>
          <input id={`${fid}-org`} type="text" value={org}
            onChange={e => setOrg(e.target.value)} autoComplete="organization" />
        </div>
        <div className="ff">
          <label htmlFor={`${fid}-need`}>What do you need help with? (optional)</label>
          <textarea id={`${fid}-need`} rows={4} value={need}
            onChange={e => setNeed(e.target.value)} />
        </div>
        <button className="btn solid" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
      {err && <div className="err" role="alert">{err}</div>}
      <p className="note" style={{ marginTop: 22 }}>
        Ready to talk now? <a href={CALENDLY}>Book a discovery call.</a>
      </p>
    </>
  );
}
