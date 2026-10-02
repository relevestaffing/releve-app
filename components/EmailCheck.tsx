'use client';
import { useState } from 'react';

/* Email is the platform's nervous system and it fails silently by design.
   This is the one place that says, out loud, whether it works. */
export default function EmailCheck() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  async function run() {
    setBusy(true); setRes(null);
    try {
      const r = await fetch('/api/admin/email-test', { method: 'POST', body: '{}' });
      setRes(await r.json());
    } catch {
      setRes({ ok: false, stage: 'unreachable', says: 'Could not reach the server at all.' });
    }
    setBusy(false);
  }

  return (
    <div className="card tight">
      <div className="row between" style={{ gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)' }}>Is email working?</b>
          <div className="small muted" style={{ marginTop: 3 }}>
            Every notification in the platform fails quietly if it is not. This sends one
            to you and reports exactly what the mail host said.
          </div>
        </div>
        <button className="btn sm solid" disabled={busy} onClick={run}>
          {busy ? 'Sending…' : 'Send a test email'}
        </button>
      </div>

      {res && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <span className={`pill ${res.ok ? 'good' : 'crit'}`}>
            <span className="dot" />{res.ok ? 'Working' : res.stage === 'not configured' ? 'Not configured' : 'Refused'}
          </span>
          <p className="small" style={{ marginTop: 12, marginBottom: res.error ? 10 : 0 }}>{res.says}</p>
          {res.error && (
            <p className="xs" style={{ fontFamily: 'ui-monospace,Menlo,monospace', background: 'var(--mist)',
              padding: '10px 12px', borderRadius: 3, wordBreak: 'break-word', margin: '0 0 10px' }}>
              {res.error}
            </p>
          )}
          {res.seen && (
            <details className="more"><summary>What the server can see</summary>
              <div className="inner">
                <ul className="plain">
                  {Object.entries(res.seen).map(([k, v]) => (
                    <li key={k}><b>{k}</b>: {String(v)}</li>
                  ))}
                </ul>
                <p className="xs muted">Names and whether a value exists. Never the values themselves.</p>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
