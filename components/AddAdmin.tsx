'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';

/* Owner-only: give someone console access. Rendered only when the viewer is
   an owner (the Team page gates it, and the route checks again).

   A new email is invited: they become an admin the first time they sign in
   with it. An email that already has a Relève account is promoted at once,
   after the owner confirms that is the account they mean. */
export default function AddAdmin() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<{ name: string | null; side: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', team_role: 'manager' });

  function close() {
    setOpen(false); setExisting(null);
    setForm({ name: '', email: '', team_role: 'manager' });
  }

  async function send(confirmExisting: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, confirm_existing: confirmExisting })
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 409 && out?.needsConfirm) {
        setExisting({ name: out.name ?? null, side: out.side ?? 'talent' });
        return;
      }
      if (!res.ok) { toast.bad(out?.error ?? 'That did not save. Please try again.'); return; }
      toast.ok(out?.mode === 'promoted'
        ? 'Console access given. They will see it the next time they open the app.'
        : 'Invitation saved. They become an admin the first time they sign in with that email.');
      close();
      router.refresh();
    } catch {
      toast.bad('That did not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return (
    <button className="btn sm ghost" onClick={() => setOpen(true)}>Add someone to the team</button>
  );

  if (existing) return (
    <div className="stack" style={{ gap: 10, marginTop: 12, maxWidth: 520 }}>
      <p className="small" style={{ margin: 0 }}>
        <b>{form.email}</b> already has a Relève account
        {existing.name ? <> in the name of <b>{existing.name}</b></> : null}, on the {existing.side} side.
        Giving it console access moves it to the Relève team.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm solid" disabled={busy} onClick={() => send(true)}>
          {busy ? 'Working…' : 'Give console access'}
        </button>
        <button type="button" className="btn sm ghost" disabled={busy} onClick={() => setExisting(null)}>Back</button>
      </div>
    </div>
  );

  return (
    <form onSubmit={e => { e.preventDefault(); send(false); }}
      className="stack" style={{ gap: 10, marginTop: 12, maxWidth: 460 }}>
      <div className="ff"><label htmlFor="add-admin-name">Name</label>
        <input id="add-admin-name" value={form.name} placeholder="Their full name"
          onChange={e => setForm({ ...form, name: e.target.value })} /></div>
      <div className="ff"><label htmlFor="add-admin-email">Email</label>
        <input id="add-admin-email" type="email" required value={form.email} placeholder="name@relevestaffing.com"
          onChange={e => setForm({ ...form, email: e.target.value })} /></div>
      <div className="ff"><label htmlFor="add-admin-role">Their role</label>
        <select id="add-admin-role" value={form.team_role}
          onChange={e => setForm({ ...form, team_role: e.target.value })}>
          <option value="manager">Manager</option>
          <option value="client_success">Client Success Manager</option>
          <option value="talent_success">Talent Success Manager</option>
        </select></div>
      <p className="xs muted" style={{ margin: 0 }}>
        They get full console access. If this email already has a Relève account, you will be
        asked to confirm, and access starts straight away. If not, they become an admin the first
        time they sign in at app.relevestaffing.com with this email.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm solid" disabled={busy}>{busy ? 'Adding…' : 'Add to the team'}</button>
        <button type="button" className="btn sm ghost" disabled={busy} onClick={close}>Cancel</button>
      </div>
    </form>
  );
}
