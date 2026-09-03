'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PASS_REASONS, type Decision, type DecisionState } from '@/lib/work-public';
import { saving } from './Toast';

const WORDING: Record<DecisionState, string> = {
  shortlisted: 'Shortlisted', passed: 'Passed', interviewing: 'Interviewing', hired: 'Hired'
};

export default function DecisionControls({ talentId, name, decision }: {
  talentId: string; name: string; decision: Decision | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [passing, setPassing] = useState(false);

  async function decide(state: DecisionState, reason?: string, note?: string) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/decisions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ talent_id: talentId, state, reason, note })
    }), state === 'shortlisted' ? `${name} shortlisted — we will be in touch`
      : state === 'passed' ? 'Noted, thank you' : 'Saved');
    setBusy(false); setPassing(false);
    if (ok) router.refresh();
  }

  async function pass(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await decide('passed', String(f.get('reason') ?? ''), String(f.get('note') ?? ''));
  }

  if (passing) {
    return (
      <form onSubmit={pass} className="decide-form">
        <div className="ff"><label>What was not right about {name}?</label>
          <select name="reason" required defaultValue="">
            <option value="" disabled>Choose one…</option>
            {PASS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select></div>
        <div className="ff"><label>Anything else <span className="muted">— optional</span></label>
          <input name="note" placeholder="A sentence is plenty." /></div>
        <p className="xs muted" style={{ marginBottom: 12 }}>
          Only Relève sees this. {name} is never told they were passed over, or why.
        </p>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Pass'}</button>
          <button type="button" className="btn ghost sm" onClick={() => setPassing(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="decide">
      {decision && (
        <span className={`pill ${decision.state === 'shortlisted' || decision.state === 'hired' ? 'good' : ''}`}>
          {(decision.state === 'shortlisted' || decision.state === 'hired') && <span className="dot" />}
          {WORDING[decision.state]}
        </span>
      )}
      {decision?.state !== 'shortlisted' && decision?.state !== 'hired' && (
        <button className="btn sm solid" disabled={busy} onClick={() => decide('shortlisted')}>
          I would like to meet {name}
        </button>
      )}
      {decision?.state !== 'passed' && (
        <button className="btn sm ghost" disabled={busy} onClick={() => setPassing(true)}>Not this one</button>
      )}
      {decision && (
        <button className="btn sm ghost" disabled={busy} onClick={() => decide('shortlisted')}
          style={{ display: decision.state === 'passed' ? 'inline-flex' : 'none' }}>Change my mind</button>
      )}
    </div>
  );
}
