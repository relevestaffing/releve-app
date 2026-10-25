'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import type { CleanupRow, ArchivedRow } from '@/lib/archive';

/* Clearing the directory, in one pass instead of one row at a time.
   ----------------------------------------------------------------
   Two actions, and the difference between them is the only thing this
   screen really has to teach:

     ARCHIVE  takes somebody out of every list and keeps everything they
              did. Reversible, and the right answer for a real client or a
              talent who has moved on.
     REMOVE   erases them. Right for a row typed in while testing, wrong for
              anybody who ever had an invoice.

   So the table leads with what each person has on file. A row reading
   "nothing on file" is safe to remove; a row with three invoices behind it
   should be archived, and the screen says so rather than leaving it to
   memory. Anything that cannot be removed carries the reason before you
   click, not after. */
export default function Cleanup({ rows, archived }: {
  rows: CleanupRow[];
  archived: ArchivedRow[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<null | 'archive' | 'remove'>(null);
  const [typed, setTyped] = useState('');

  const chosen = useMemo(() => rows.filter(r => picked[r.id]), [rows, picked]);
  /* Invitations have no account to archive, and anyone blocked cannot be
     removed, so each action reports its own honest count. */
  const archivable = chosen.filter(r => !r.pending);
  const removable = chosen.filter(r => !r.blocker);
  const blocked = chosen.filter(r => r.blocker);

  function toggle(id: string) {
    setPicked(p => ({ ...p, [id]: !p[id] }));
    setConfirming(null);
  }
  function clear() { setPicked({}); setConfirming(null); setTyped(''); }

  async function run(action: 'archive' | 'remove') {
    setBusy(true);
    const byId = new Map(rows.map(r => [r.id, r]));
    const name = (id: string) => byId.get(id)?.name || byId.get(id)?.email || 'Someone';
    try {
      const r = action === 'archive'
        ? await fetch('/api/admin/people', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'archive', ids: archivable.map(x => x.id) })
          })
        : await fetch('/api/admin/people', {
            method: 'DELETE', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ people: removable.map(x => ({ id: x.id, pending: x.pending })) })
          });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ?? 'That did not go through.'); setBusy(false); return; }

      toast.saved(action === 'archive' ? `${d.done} archived` : `${d.done} removed`);
      if (d.failed?.length) {
        for (const f of d.failed.slice(0, 3)) toast.bad(`${name(f.id)}: ${f.why}`);
      }
      clear(); setBusy(false); router.refresh();
    } catch {
      toast.bad('No connection. Nothing was changed.');
      setBusy(false);
    }
  }

  const [restoring, setRestoring] = useState<string | null>(null);
  async function restore(id: string, who: string) {
    setRestoring(id);
    try {
      const r = await fetch('/api/admin/people', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'restore', ids: [id] })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.saved(`${who} is back`); router.refresh(); }
      else toast.bad(d.error ? `Not restored. ${d.error}` : `${who} was not put back. Please try again.`);
    } catch {
      toast.bad(`No connection. ${who} was not put back.`);
    }
    setRestoring(null);
  }

  return (
    <>
      <div className="card tight" style={{ marginBottom: 22 }}>
        <div className="card-head" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 19 }}>Everyone in the directory</h3>
          {chosen.length > 0 && (
            <span className="pill"><span className="dot" />{chosen.length} selected</span>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="small muted">Nobody yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Name</th>
                  <th>Kind</th>
                  <th>On file</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={picked[r.id] ? 'picked' : undefined}>
                    <td>
                      <input type="checkbox" checked={!!picked[r.id]} disabled={busy}
                        aria-label={`Select ${r.name ?? r.email ?? 'this person'}`}
                        onChange={() => toggle(r.id)} />
                    </td>
                    <td>
                      <b>{r.name || <span className="muted">No name</span>}</b>
                      <div className="xs muted">
                        {[r.org, r.email].filter(Boolean).join(' · ') || 'Nothing on file'}
                      </div>
                    </td>
                    <td className="small">
                      {r.role === 'client' ? 'Executive' : 'Talent'}
                      {r.pending && <div className="xs muted">Never signed in</div>}
                    </td>
                    <td className="small">{whatIsOnFile(r)}</td>
                    <td className="small muted">{r.blocker ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* The action bar only exists once something is ticked. An empty screen
          with two dangerous buttons on it invites a click that was never
          meant to happen. */}
      {chosen.length > 0 && (
        <div className="card tight" style={{ marginBottom: 22 }}>
          <div className="card-head" style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 19 }}>{chosen.length} selected</h3>
            <button className="btn sm ghost" disabled={busy} onClick={clear}>Clear</button>
          </div>

          {confirming === null && (
            <>
              <p className="small muted" style={{ maxWidth: 'var(--measure)', marginBottom: 16 }}>
                Archiving takes them out of every list and keeps everything on file.
                Removing erases them, and cannot be undone.
              </p>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <button className="btn sm solid" disabled={busy || archivable.length === 0}
                  onClick={() => setConfirming('archive')}>
                  Archive {archivable.length}
                </button>
                <button className="btn sm ghost danger" disabled={busy || removable.length === 0}
                  onClick={() => { setTyped(''); setConfirming('remove'); }}>
                  Remove {removable.length} permanently
                </button>
              </div>
              {(blocked.length > 0 || archivable.length !== chosen.length) && (
                <ul className="plain" style={{ paddingTop: 14 }}>
                  {blocked.map(r => (
                    <li key={r.id} className="xs muted">
                      <b>{r.name ?? r.email}</b> cannot be removed · {r.blocker}
                    </li>
                  ))}
                  {chosen.some(r => r.pending) && (
                    <li className="xs muted">
                      {chosen.filter(r => r.pending).length === 1
                        ? 'One of these is an invitation with no account behind it.'
                        : `${chosen.filter(r => r.pending).length} of these are invitations with no accounts behind them.`}
                      {' '}There is nothing to archive, only to forget.
                    </li>
                  )}
                </ul>
              )}
            </>
          )}

          {confirming === 'archive' && (
            <>
              <p className="small" style={{ maxWidth: 'var(--measure)', marginBottom: 16 }}>
                Archive <b>{archivable.length}</b>? They leave every list and count.
                Their Signature, placements, invoices and payment history all stay,
                and you can put any of them back from this page.
              </p>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn sm solid" disabled={busy} onClick={() => run('archive')}>
                  {busy ? 'Archiving…' : `Yes, archive ${archivable.length}`}
                </button>
                <button className="btn sm ghost" disabled={busy}
                  onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            </>
          )}

          {confirming === 'remove' && (
            <>
              <p className="small" style={{ maxWidth: 'var(--measure)', marginBottom: 14 }}>
                Permanently remove <b>{removable.length}</b>. This erases their account and
                everything attached to it, including identity documents, and it cannot be
                undone. Type <b>REMOVE</b> to confirm.
              </p>
              {removable.some(r => r.placements || r.invoices || r.payments) && (
                <p className="small" style={{ maxWidth: 'var(--measure)', marginBottom: 14 }}>
                  <b>Some of these have history on file.</b>{' '}
                  {removable.filter(r => r.placements || r.invoices || r.payments)
                    .map(r => r.name ?? r.email).join(', ')}
                  . Archiving keeps all of it and still clears the list.
                </p>
              )}
              <div className="ff" style={{ maxWidth: 220 }}>
                <label htmlFor="cleanup-confirm">Type REMOVE</label>
                <input id="cleanup-confirm" value={typed} autoFocus disabled={busy}
                  placeholder="REMOVE" onChange={e => setTyped(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setConfirming(null);
                    if (e.key === 'Enter' && !busy && typed.trim().toUpperCase() === 'REMOVE') { e.preventDefault(); run('remove'); }
                  }} />
              </div>
              <div className="row" style={{ gap: 10, marginTop: 14 }}>
                <button className="btn sm solid danger"
                  disabled={busy || typed.trim().toUpperCase() !== 'REMOVE'}
                  onClick={() => run('remove')}>
                  {busy ? 'Removing…' : `Yes, remove ${removable.length}`}
                </button>
                <button className="btn sm ghost" disabled={busy}
                  onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Archived people live here and nowhere else. The point of the whole
          screen is that this list is one click from being undone. */}
      <div className="card tight">
        <div className="card-head" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 19 }}>Archived</h3>
          {archived.length > 0 && (
            <span className="pill"><span className="dot" />{archived.length}</span>
          )}
        </div>
        {archived.length === 0 ? (
          <p className="small muted" style={{ maxWidth: 'var(--measure)' }}>
            Nobody archived. Archiving is the gentle way to clear the directory:
            they come off every list, everything on file stays, and they come back
            from here whenever you want them.
          </p>
        ) : (
          <ul className="plain archived-list">
            {archived.map(a => (
              <li key={a.id} className="row between" style={{ gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <b>{a.full_name || a.email || 'Someone'}</b>
                  <div className="xs muted">
                    {[a.role === 'client' ? 'Executive' : 'Talent', a.org_name, a.email]
                      .filter(Boolean).join(' · ')}
                    {a.archive_reason ? ` · ${a.archive_reason}` : ''}
                  </div>
                </div>
                <button className="btn sm ghost" disabled={restoring !== null}
                  onClick={() => restore(a.id, a.full_name || a.email || 'They')}>
                  {restoring === a.id ? 'Putting back…' : 'Put back'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* What this person actually has behind them, in the fewest words that still
   answer "is it safe to remove this row?". */
function whatIsOnFile(r: CleanupRow): React.ReactNode {
  if (r.pending) return <span className="muted">An invitation</span>;
  const bits: string[] = [];
  if (r.placements) bits.push(`${r.placements} placement${r.placements > 1 ? 's' : ''}`);
  if (r.invoices) bits.push(`${r.invoices} invoice${r.invoices > 1 ? 's' : ''}`);
  if (r.payments) bits.push(`${r.payments} payment${r.payments > 1 ? 's' : ''}`);
  if (r.signature) bits.push('Signature');
  if (!bits.length) return <span className="muted">Nothing on file</span>;
  return bits.join(' · ');
}
