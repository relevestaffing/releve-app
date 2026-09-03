'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';

const KINDS = [
  { k: 'note', label: 'Note' },
  { k: 'call', label: 'Call' },
  { k: 'escalation', label: 'Escalation' },
  { k: 'review', label: 'Review' },
  { k: 'resolution', label: 'Resolved' }
];

export default function NoteAdder({ placementId }: { placementId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/notes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ placement_id: placementId, body: f.get('body'), kind: f.get('kind') })
    }), 'Noted');
    setBusy(false);
    if (ok) { form.reset(); router.refresh(); }
  }

  return (
    <form onSubmit={add}>
      <div className="ff">
        <textarea name="body" rows={3} required
          placeholder="What happened, what you did about it, what you are watching for." />
      </div>
      <div className="row" style={{ gap: 12 }}>
        <select name="kind" defaultValue="note" style={{ maxWidth: 170 }}>
          {KINDS.map(k => <option key={k.k} value={k.k}>{k.label}</option>)}
        </select>
        <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Add to the file'}</button>
      </div>
    </form>
  );
}
