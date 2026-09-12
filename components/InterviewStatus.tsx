'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving as save } from '@/components/Toast';

const OPTIONS = ['Proposed', 'Confirmed', 'Declined', 'Completed', 'No-show', 'Cancelled'];
const cls = (s: string) =>
  s === 'Confirmed' ? 'good' : s === 'Completed' ? 'good' :
  s === 'Proposed' ? 'warn' : s === 'Declined' || s === 'No-show' || s === 'Cancelled' ? 'crit' : '';

/* Who may say what about an interview.
   -----------------------------------
   The console keeps the full list, because Relève records what actually
   happened. The two people in the meeting get two plain choices instead: a
   raw dropdown containing "No-show" is both alarming and, on iOS, a spinning
   wheel one careless scroll away from firing. The executive previously had no
   control at all and could not cancel a booking they had made by mistake. */
export default function InterviewStatus({ id, status, mode }: {
  id: string; status: string; mode: 'admin' | 'client' | 'talent' | 'read';
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);

  async function set(next: string, word: string) {
    const prev = value;
    setValue(next); setSaving(true);
    const ok = await save(() => fetch('/api/interviews', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status: next }) }), word);
    setSaving(false); setAsking(false);
    if (!ok) setValue(prev);   // the pill must never claim something the database did not take
    else router.refresh();
  }

  const pill = <span className={`pill ${cls(value)}`}><span className="dot" />{value}</span>;
  if (mode === 'read') return pill;

  if (mode === 'admin') return (
    <select value={value} disabled={saving} className={`pill ${cls(value)}`}
      style={{ padding: '5px 10px', cursor: 'pointer' }}
      onChange={e => set(e.target.value, `Interview marked ${e.target.value}`)}>
      {OPTIONS.map(o => <option key={o}>{o}</option>)}
    </select>
  );

  /* Settled one way or the other — nothing left for either side to press. */
  if (['Completed', 'Cancelled', 'Declined', 'No-show'].includes(value)) return pill;

  if (asking) return (
    <div className="decide-form" style={{ minWidth: 230 }}>
      <p className="small" style={{ margin: '0 0 12px' }}>
        Tell us you cannot make this one? We will arrange another time with
        {mode === 'client' ? ' the candidate' : ' the executive'} — nobody is told anything
        beyond that it needs moving.
      </p>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn sm solid" disabled={saving}
          onClick={() => set('Cancelled', 'Noted — we will find another time')}>
          Yes, I need to move it
        </button>
        <button className="btn sm ghost" onClick={() => setAsking(false)}>Keep it</button>
      </div>
    </div>
  );

  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      {value === 'Confirmed'
        ? pill
        : <button className="btn sm solid" disabled={saving}
            onClick={() => set('Confirmed', 'Confirmed — it is in the diary')}>
            {saving ? 'Saving…' : 'Confirm I will be there'}
          </button>}
      <button className="btn sm ghost" disabled={saving} onClick={() => setAsking(true)}>
        I need to move it
      </button>
    </div>
  );
}
