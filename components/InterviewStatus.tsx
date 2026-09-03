'use client';
import { useState } from 'react';
import { saving as save } from '@/components/Toast';

const OPTIONS = ['Proposed', 'Confirmed', 'Declined', 'Completed', 'No-show', 'Cancelled'];
const cls = (s: string) =>
  s === 'Confirmed' ? 'good' : s === 'Completed' ? 'good' :
  s === 'Proposed' ? 'warn' : s === 'Declined' || s === 'No-show' || s === 'Cancelled' ? 'crit' : '';

export default function InterviewStatus({ id, status, canEdit }: { id: string; status: string; canEdit: boolean }) {
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);
  if (!canEdit) return <span className={`pill ${cls(value)}`}><span className="dot" />{value}</span>;
  return (
    <select value={value} disabled={saving} className={`pill ${cls(value)}`}
      style={{ padding: '5px 10px', cursor: 'pointer' }}
      onChange={async e => {
        const prev = value;
        const next = e.target.value; setValue(next); setSaving(true);
        const ok = await save(() => fetch('/api/interviews', {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, status: next }) }), `Interview marked ${next}`);
        setSaving(false);
        if (!ok) setValue(prev);   // the pill must never claim something the database did not take
      }}>
      {OPTIONS.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}
