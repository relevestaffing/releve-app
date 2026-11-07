'use client';
import { useState } from 'react';
import { firstName } from '@/lib/words';
import './experience.css';


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
      if (!res.ok) {
        /* No status codes here. This is the first screen a new account ever
           sees, and "Something went wrong (500)" tells them nothing they can
           act on and everything about how little we thought about them. */
        setErr(out.error ?? 'We could not set up your account. Please try again, or write to hello@relevestaffing.com if it happens again.');
        setBusy(null); return;
      }
      /* a full navigation, not just a refresh — the whole account changed shape */
      window.location.href = '/app';
    } catch (e: any) {
      setErr(e?.name === 'AbortError'
        ? 'That took too long. Please try again.'
        : 'No connection. Check your internet and try again.');
      setBusy(null);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img className="logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="welcome-card">
          <h1>{name ? `Welcome, ${firstName(name)}` : 'Welcome to Relève'}</h1>
          <p className="lede">Which of these describes you?</p>
          <p className="small" style={{ marginTop: 14 }}>
            If Relève sent you an invitation, sign out below and sign in with the email address it was sent to.
          </p>
        </div>

        <div className="choose-grid">
          {/* An executive account is never self-selected — it starts with a
             discovery call, which is what puts the record here in the first
             place. Anyone reaching this screen has not had one yet, so the
             card explains that instead of offering a button that would only
             fail. */}
          <a className="choose-card" href="mailto:hello@relevestaffing.com?subject=Booking a discovery call">
            <div className="eyebrow">I am hiring</div>
            <h3>Executive</h3>
            <p>
              A trusted virtual professional, vetted on six fronts, matched to how you work and fully
              managed by Relève.
            </p>
            <p className="xs muted" style={{ marginTop: 10 }}>
              Every search begins with a short discovery call. Write to us and we will find a time.
            </p>
            <span className="choose-go">Talk to us →</span>
          </a>

          <button className="choose-card" disabled={!!busy} onClick={() => { if (confirm('Set this account up as talent? This cannot be changed from inside the account later.')) choose('talent'); }}>
            <div className="eyebrow">I am looking for a placement</div>
            <h3>Talent</h3>
            <p>
              You want to work closely with one executive. We match you with care and support you
              throughout the placement.
            </p>
            <span className="choose-go">{busy === 'talent' ? 'One moment…' : 'Continue as talent →'}</span>
          </button>
        </div>

        <p className="xs muted" style={{ marginTop: 22, maxWidth: 440, marginInline: 'auto' }}>
          If you choose the wrong one, your Relève contact can change it for you.
        </p>
        {err && <p className="small" style={{ color: 'var(--crit)', marginTop: 14 }}>{err}</p>}
        {/* The one way out that is not a choice: the same quiet sign-out the
            other gates carry, for whoever signed in with the wrong address. */}
        <form action="/api/signout" method="post" style={{ margin: '18px 0 0' }}>
          <button className="gate-link" type="submit">Sign out</button>
        </form>
      </div>
    </div>
  );
}
