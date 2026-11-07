'use client';
import { useState } from 'react';

type State = 'ask' | 'busy' | 'done' | 'back' | 'error';

export default function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'ask' : 'error');
  const [msg, setMsg] = useState(token ? '' : 'This link is incomplete. Use the unsubscribe link in the email again, or write to hello@relevestaffing.com.');

  async function send(action: 'unsubscribe' | 'resubscribe') {
    setState('busy'); setMsg('');
    try {
      const r = await fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ t: token, action })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'We could not update your preferences. Please email hello@relevestaffing.com.');
      setState(action === 'resubscribe' ? 'back' : 'done');
    } catch (e: any) {
      setState('error'); setMsg(e?.message || 'We could not update your preferences. Please email hello@relevestaffing.com.');
    }
  }

  return (
    <div>
      <div className="eyebrow">Email preferences</div>
      {state === 'done' ? (
        <>
          <h2>You are unsubscribed.</h2>
          <p className="muted">You will no longer receive emails from Relève.</p>
          <button className="btn" onClick={() => send('resubscribe')}>Subscribe again</button>
        </>
      ) : state === 'back' ? (
        <>
          <h2>Welcome back.</h2>
          <p className="muted">You are subscribed again.</p>
        </>
      ) : (
        <>
          <h2>Unsubscribe from Relève&rsquo;s emails?</h2>
          <p className="muted">You will stop receiving our emails. Any call you have booked is not affected.</p>
          {msg && <p className="small" role="alert" style={{ color: 'var(--crit)' }}>{msg}</p>}
          <button className="btn solid" disabled={state === 'busy' || !token} onClick={() => send('unsubscribe')}>
            {state === 'busy' ? 'One moment…' : 'Unsubscribe'}
          </button>
        </>
      )}
    </div>
  );
}
