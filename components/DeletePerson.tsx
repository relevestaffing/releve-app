'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';

/* Removing someone is not a form field, it is a decision, so this asks twice.
   A record nobody has signed into yet (pending) has no history to lose, so
   one click removes it. A real account cascades away everything on file for
   that person the moment their auth user is deleted, so this makes the admin
   type the person's own first name before that call goes out. */
export default function DeletePerson({ id, name: rawName, pending }: {
  id: string; name: string | null; pending: boolean;
}) {
  /* full_name is nullable on a self-serve account; .trim() on null took the
     whole People page down. An unnamed record is confirmed by its label. */
  const name = (rawName ?? '').trim() || 'this person';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const first = (rawName ?? '').trim() ? (name.split(/\s+/)[0]).toLowerCase() : 'remove';

  async function remove() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/people', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, pending })
    }), `${name} removed`);
    setBusy(false);
    if (ok) { setOpen(false); setTyped(''); router.refresh(); }
  }

  if (!open) return (
    <button className="btn sm ghost danger" onClick={() => setOpen(true)}>Remove</button>
  );

  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {pending ? (
        <span className="xs muted">Remove this record?</span>
      ) : (
        <>
          <span className="xs muted">
            {(rawName ?? '').trim()
              ? 'Type their first name to remove everything on file for them. This cannot be undone.'
              : 'Type REMOVE to remove everything on file for them. This cannot be undone.'}
          </span>
          <span className="ff" style={{ margin: 0 }}>
            <input aria-label="Type the name to confirm" value={typed} autoFocus disabled={busy} style={{ width: 110 }}
              placeholder={(rawName ?? '').trim() ? name.split(/\s+/)[0] : 'REMOVE'}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setTyped(''); } }} />
          </span>
        </>
      )}
      <button className="btn sm solid danger" disabled={busy || (!pending && typed.trim().toLowerCase() !== first)}
        onClick={remove}>{busy ? 'Removing…' : 'Confirm'}</button>
      <button className="btn sm ghost" disabled={busy} onClick={() => { setOpen(false); setTyped(''); }}>Cancel</button>
    </div>
  );
}
