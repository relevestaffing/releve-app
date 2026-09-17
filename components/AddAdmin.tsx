'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from './Toast';

/* Owner-only: add a second Relève admin. Rendered only when the viewer is the
   owner (the Team page gates it). The person is added as a pending admin and
   becomes one the first time they sign in with this email. */
export default function AddAdmin() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/team', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: f.get('name'), email: f.get('email'), team_role: f.get('team_role')
      })
    }), 'Admin added — they can sign in with that email now');
    setBusy(false);
    if (ok) { setOpen(false); router.refresh(); }
  }

  if (!open) return (
    <button className="btn sm ghost" onClick={() => setOpen(true)}>Add an admin</button>
  );

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 10, marginTop: 12, maxWidth: 460 }}>
      <div className="ff"><label>Name</label>
        <input name="name" required placeholder="Their full name" /></div>
      <div className="ff"><label>Email</label>
        <input name="email" type="email" required placeholder="name@relevestaffing.com" /></div>
      <div className="ff"><label>Their role</label>
        <select name="team_role" defaultValue="manager">
          <option value="manager">Manager</option>
          <option value="client_success">Client Success</option>
          <option value="talent_success">Talent Success</option>
        </select></div>
      <p className="xs muted" style={{ margin: 0 }}>
        They get full console access. Tell them to sign in at app.relevestaffing.com with
        this email — they become an admin automatically on first sign-in.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm solid" disabled={busy}>{busy ? 'Adding…' : 'Add admin'}</button>
        <button type="button" className="btn sm ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
