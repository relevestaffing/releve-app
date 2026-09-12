'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPROVE_REASONS, PASS_REASONS, type Decision, type DecisionState } from '@/lib/work-public';
import { saving } from './Toast';

const WORDING: Record<DecisionState, string> = {
  shortlisted: 'Approved', passed: 'Declined', interviewing: 'Interviewing', hired: 'Hired'
};

/* Approve and decline are the same shape on purpose.
   -------------------------------------------------
   A decline used to ask why and an approval asked nothing, which meant the
   only thing we ever learned was what had gone wrong. Both now open the same
   short form: a reason from a fixed list and a sentence in their own words.
   Nothing is sent until they submit it, so neither answer can be given by a
   mis-click. */
export default function DecisionControls({ talentId, name, decision }: {
  talentId: string; name: string; decision: Decision | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<null | 'shortlisted' | 'passed'>(null);

  async function decide(state: DecisionState, reason?: string, note?: string) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/decisions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ talent_id: talentId, state, reason, note })
    }), state === 'shortlisted' ? `${name} approved — we will arrange the introduction`
      : state === 'passed' ? 'Noted — we will bring the next one forward' : 'Saved');
    setBusy(false); setAsking(null);
    if (ok) router.refresh();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await decide(asking!, String(f.get('reason') ?? ''), String(f.get('note') ?? ''));
  }

  if (asking) {
    const yes = asking === 'shortlisted';
    return (
      <form onSubmit={submit} className="decide-form">
        <p className="small" style={{ marginBottom: 14 }}>
          {yes
            ? <>You are approving <b>{name}</b>. We will arrange the introduction and come back to you with a time.</>
            : <>You are declining <b>{name}</b>. We will put the next candidate forward.</>}
        </p>
        <div className="ff">
          <label>{yes ? `What made ${name} right?` : `What was not right about ${name}?`}
            {yes && <span className="muted"> — optional</span>}</label>
          <select name="reason" required={!yes} defaultValue="">
            <option value="" disabled={!yes}>{yes ? 'Rather not say' : 'Choose one…'}</option>
            {(yes ? APPROVE_REASONS : PASS_REASONS).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="ff">
          <label>Anything else <span className="muted">— optional</span></label>
          <textarea name="note" rows={2}
            placeholder={yes
              ? 'A sentence is plenty. What you say here shapes who we look for next.'
              : 'A sentence is plenty. This is what makes the next candidate sharper.'} />
        </div>
        <p className="xs muted" style={{ marginBottom: 12 }}>
          Only Relève sees this. {name} is never shown your reason
          {yes ? '.' : ', and is never told they were declined.'}
        </p>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn solid" disabled={busy}>
            {busy ? 'Saving…' : yes ? `Approve ${name}` : 'Decline'}
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setAsking(null)}>Cancel</button>
        </div>
      </form>
    );
  }

  const settled = decision?.state === 'shortlisted' || decision?.state === 'hired';

  return (
    <div className="decide">
      {decision && (
        <span className={`pill ${settled ? 'good' : ''}`}>
          {settled && <span className="dot" />}
          {WORDING[decision.state]}
        </span>
      )}
      {!settled && (
        <button className="btn sm solid" disabled={busy} onClick={() => setAsking('shortlisted')}>
          Approve {name}
        </button>
      )}
      {decision?.state !== 'passed' && (
        <button className="btn sm ghost" disabled={busy} onClick={() => setAsking('passed')}>Decline</button>
      )}
      {decision?.state === 'passed' && (
        <button className="btn sm ghost" disabled={busy} onClick={() => setAsking('shortlisted')}>Change my mind</button>
      )}
    </div>
  );
}
