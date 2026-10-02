'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';

/* Taking console access away, or withdrawing an invitation nobody has used.
   Asks once more before it goes. Removing access keeps the account and its
   history; the person simply no longer reaches the console. */
export default function TeamMemberRemove({ userId, inviteId, name, self }: {
  userId?: string; inviteId?: string; name: string; self?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const invite = Boolean(inviteId);

  async function go() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/team', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(invite ? { invite_id: inviteId } : { user_id: userId })
    }), invite ? 'Invitation withdrawn' : `${name} no longer has console access`);
    setBusy(false);
    if (!ok) return;
    setOpen(false);
    if (self) window.location.href = '/app';
    else router.refresh();
  }

  if (!open) return (
    <button className="btn sm ghost danger" onClick={() => setOpen(true)}>
      {invite ? 'Withdraw' : 'Remove access'}
    </button>
  );

  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="xs muted">
        {invite
          ? `Withdraw the invitation for ${name}?`
          : self
            ? 'Remove your own console access? You will leave the console straight away.'
            : `Remove console access for ${name}? Their history stays on record.`}
      </span>
      <button className="btn sm solid danger" disabled={busy} onClick={go}>
        {busy ? 'Working…' : 'Confirm'}
      </button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
