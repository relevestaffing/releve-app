'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPROVE_REASONS, PASS_REASONS } from '@/lib/work-public';
import { saving } from './Toast';

/* The executive's answer, written down by Relève.
   ------------------------------------------------
   A high-touch agency hears most decisions on a call, and until now nothing
   could record one: the decisions route accepted executives only, so a "yes"
   said out loud lived in nobody's account. This is the same form the
   executive sees, with the executive named, and the row records who wrote
   it down. */
export default function RecordAnswer({ clientId, clientName, talentId, talentName }: {
  clientId: string; clientName: string; talentId: string; talentName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<null | 'shortlisted' | 'passed'>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/decisions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId, talent_id: talentId, state: asking,
        reason: String(f.get('reason') ?? ''), note: String(f.get('note') ?? '')
      })
    }), asking === 'shortlisted' ? `Recorded — ${clientName} approved ${talentName}` : `Recorded — ${clientName} declined ${talentName}`);
    setBusy(false); setAsking(null);
    if (ok) router.refresh();
  }

  if (asking) {
    const yes = asking === 'shortlisted';
    return (
      <form onSubmit={submit} className="decide-form" style={{ textAlign: 'left', minWidth: 260, marginTop: 8 }}>
        <p className="xs muted" style={{ marginBottom: 10 }}>
          Recording that <b>{clientName}</b> {yes ? 'approved' : 'declined'} <b>{talentName}</b> — as told to you, in their words where you can.
        </p>
        <div className="ff">
          <label>{yes ? 'What made them right' : 'What was not right'}{yes && <span className="muted"> — optional</span>}</label>
          <select name="reason" required={!yes} defaultValue="">
            <option value="" disabled={!yes}>{yes ? 'Not said' : 'Choose one…'}</option>
            {(yes ? APPROVE_REASONS : PASS_REASONS).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="ff">
          <label>In their words <span className="muted">— optional</span></label>
          <textarea name="note" rows={2} placeholder="What they actually said." />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm solid" disabled={busy}>{busy ? 'Saving…' : 'Record it'}</button>
          <button type="button" className="btn sm ghost" onClick={() => setAsking(null)}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
      <span className="xs muted" style={{ width: '100%' }}>Told you on a call?</span>
      <button className="btn sm ghost" disabled={busy} onClick={() => setAsking('shortlisted')}>They said yes</button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setAsking('passed')}>They said no</button>
    </div>
  );
}
