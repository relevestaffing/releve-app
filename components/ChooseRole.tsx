'use client';
import { useState } from 'react';


/* The very first thing a new account sees, unless Relève added them by hand —
   in which case their side is already known and this never appears. */
export default function ChooseRole({ name }: { name?: string | null }) {

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function choose(role: 'client' | 'talent') {
    setBusy(role); setErr(null);
    try {
      /* never sit on a spinner forever if the server does not answer */
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), 15000);
      const res = await fetch('/api/role', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }), signal: stop.signal
      });
      clearTimeout(timer);
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(out.error ?? `Something went wrong (${res.status}).`); setBusy(null); return; }
      /* a full navigation, not just a refresh — the whole account changed shape */
      window.location.href = '/app';
    } catch (e: any) {
      setErr(e?.name === 'AbortError'
        ? 'That took too long. Check the app is still running, then try again.'
        : 'Could not reach the server. Check the app is still running.');
      setBusy(null);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img className="logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="welcome-card">
          <h1>{name ? `Welcome, ${name.split(' ')[0]}` : 'Welcome to Relève'}</h1>
          <p className="lede">Before anything else — which side of this are you on?</p>
        </div>

        <div className="choose-grid">
          <button className="choose-card" disabled={!!busy} onClick={() => choose('client')}>
            <div className="eyebrow">I am hiring</div>
            <h3>Executive</h3>
            <p>
              You need a right hand. We find, vet and manage the person, and match them to how you
              actually work rather than to a job description.
            </p>
            <span className="choose-go">{busy === 'client' ? 'One moment…' : 'This is me →'}</span>
          </button>

          <button className="choose-card" disabled={!!busy} onClick={() => choose('talent')}>
            <div className="eyebrow">I am looking to be placed</div>
            <h3>Talent</h3>
            <p>
              You want a seat beside one executive, not a queue of tasks from twelve. We place you
              deliberately, and manage the relationship after you land.
            </p>
            <span className="choose-go">{busy === 'talent' ? 'One moment…' : 'This is me →'}</span>
          </button>
        </div>

        <p className="xs muted" style={{ marginTop: 22, maxWidth: 440, marginInline: 'auto' }}>
          Pick the one that fits. If you choose wrong, your Relève contact can move you across —
          you just cannot switch yourself once the account is set up.
        </p>
        {err && <p className="small" style={{ color: 'var(--rust, #8C4A3F)', marginTop: 14 }}>{err}</p>}
      </div>
    </div>
  );
}
