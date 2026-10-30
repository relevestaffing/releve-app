'use client';
import { useState } from 'react';

type State = 'ask' | 'busy' | 'done' | 'back' | 'error';

export default function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'ask' : 'error');
  const [msg, setMsg] = useState(token ? '' : 'That link is not complete. Use the unsubscribe link in the email, or write to hello@relevestaffing.com.');

  async function send(action: 'unsubscribe' | 'resubscribe') {
    setState('busy'); setMsg('');
    try {
      const r = await fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ t: token, action })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'We could not do that just now. Please email hello@relevestaffing.com.');
      setState(action === 'resubscribe' ? 'back' : 'done');
    } catch (e: any) {
      setState('error'); setMsg(e?.message || 'We could not do that just now. Please email hello@relevestaffing.com.');
    }
  }

  return (
    <div>
      <div className="eyebrow">Email preferences</div>
      {state === 'done' ? (
        <>
          <h2>You are unsubscribed.</h2>
          <p className="muted">You will not receive Relève&rsquo;s emails again. Changed your mind?</p>
          <button className="btn" onClick={() => send('resubscribe')}>Keep me on the list</button>
        </>
      ) : state === 'back' ? (
        <>
          <h2>Welcome back.</h2>
          <p className="muted">You are on the list again. Consider it handled.</p>
        </>
      ) : (
        <>
          <h2>Unsubscribe from Relève&rsquo;s emails?</h2>
          <p className="muted">One press and you will not hear from us again. Any call you have booked with us is not affected.</p>
          {msg && <p className="small" role="alert" style={{ color: 'var(--crit)' }}>{msg}</p>}
          <button className="btn solid" disabled={state === 'busy' || !token} onClick={() => send('unsubscribe')}>
            {state === 'busy' ? 'One moment…' : 'Unsubscribe'}
          </button>
        </>
      )}
    </div>
  );
}
