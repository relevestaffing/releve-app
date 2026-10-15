'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';

/* Removing someone is not a form field, it is a decision, so this asks twice.
   A record nobody has signed into yet (pending) has no history to lose, so
   one click removes it. A real account cascades away everything on file for
   that person the moment their auth user is deleted, so this makes the admin
   type the person's own first name before that call goes out.

   ARCHIVE SITS IN FRONT OF IT (13 October 2026). Most of the time the real
   intent is "get this person off my list", not "destroy everything they
   did", and until now the only button on offer did the second. So an
   account gets Archive first, with Remove kept behind it — reversed from
   how it read before, because the reversible action should be the easy one.
   An unclaimed invitation has no account to archive, so it keeps the single
   Remove it always had. */
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

  async function archive() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/people', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'archive', ids: [id] })
    }), `${name} archived`);
    setBusy(false);
    if (ok) router.refresh();
  }

  if (!open) return (
    <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {!pending && (
        <button className="btn sm ghost" disabled={busy} onClick={archive}
          title="Takes them off every list and keeps everything on file. Reversible.">
          {busy ? 'Archiving…' : 'Archive'}
        </button>
      )}
      {/* The sentence explaining the difference between these two used to be
          printed beside every row, which on a roster of eight people meant
          reading it eight times and gave each row 60px of dead height on a
          phone. It is on the buttons themselves now, and said properly once
          at the top of Tidy up. */}
      <button className="btn sm ghost danger" onClick={() => setOpen(true)}
        title="Erases the account and everything on file. Cannot be undone.">Remove</button>
    </div>
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
        onClick={remove}>{busy ? 'Removing…' : 'Yes, remove permanently'}</button>
      <button className="btn sm ghost" disabled={busy} onClick={() => { setOpen(false); setTyped(''); }}>Cancel</button>
    </div>
  );
}
