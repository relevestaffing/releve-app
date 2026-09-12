'use client';
import { useState } from 'react';
import { toast } from '@/components/Toast';

export default function AddPerson({ role }: { role: 'client' | 'talent' }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget);
    const body: any = { role };
    f.forEach((v, k) => { if (v !== '') body[k] = k === 'years_exp' || k === 'rate_month' ? Number(v) : v; });
    let r: Response, d: any = {};
    try {
      r = await fetch('/api/admin/people', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      d = await r.json().catch(() => ({}));
    } catch {
      setBusy(false); setErr('No connection \u2014 nothing was saved.');
      toast.bad('No connection \u2014 nothing was saved.'); return;
    }
    setBusy(false);
    if (!r.ok) {
      const why = d.error ?? 'Could not save.';
      setErr(why); toast.bad(`Not saved \u2014 ${why}`); return;
    }
    toast.saved(`${body.full_name} added`);
    setMsg(`${body.full_name} added. They join their record the first time they sign in with ${body.email}.`);
    (e.target as HTMLFormElement).reset();
  }

  if (!open) return <button className="btn sm solid" onClick={() => setOpen(true)}>Add {role === 'client' ? 'a client' : 'talent'}</button>;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="card-head">
        <h3>Add {role === 'client' ? 'a client' : 'talent'}</h3>
        <button className="x-btn" onClick={() => setOpen(false)}>×</button>
      </div>
      <p className="small muted" style={{ marginBottom: 20 }}>
        Creates the record now. When they sign in with this email address the account attaches itself —
        no invitation or password needed.
      </p>
      <form onSubmit={submit}>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label>Full name</label><input name="full_name" required placeholder="Maria Elena Santos" /></div>
          <div className="ff"><label>Email</label><input name="email" type="email" required placeholder="name@email.com" /></div>
        </div>
        {role === 'client' ? (
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="ff"><label>Company</label><input name="org_name" placeholder="Marsh &amp; Co." /></div>
            <div className="ff"><label>Timezone</label><input name="timezone" placeholder="America/Los_Angeles" defaultValue="America/Los_Angeles" /></div>
          </div>
        ) : (
          <>
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label>Role</label><input name="headline" placeholder="Executive Assistant" /></div>
              <div className="ff"><label>Location</label><input name="location" placeholder="Cebu, Philippines" /></div>
            </div>
            <div className="grid-4" style={{ gap: 14 }}>
              <div className="ff"><label>Timezone</label><input name="timezone" placeholder="Asia/Manila" defaultValue="Asia/Manila" /></div>
              <div className="ff"><label>Years</label><input name="years_exp" type="number" min="0" placeholder="9" /></div>
              <div className="ff"><label>English</label>
                <select name="english"><option>Native-fluent</option><option>Fluent</option><option>Conversational</option></select></div>
              <div className="ff"><label>Pay (USD/mo)</label><input name="rate_month" type="number" min="0" placeholder="1450" /></div>
            </div>
            <div className="ff"><label>Stage</label>
              <select name="stage"><option>Applied</option><option>Screening</option><option>Vetted</option></select></div>
          </>
        )}
        <div className="ff"><label>Documents link — optional</label>
          <input name="docs_url" type="url" placeholder="Paste the DocuSign link once it's out, or leave blank and send it separately" /></div>
        <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : `Add ${role === 'client' ? 'client' : 'talent'}`}</button>
        {msg && <p className="small" style={{ marginTop: 14, color: 'var(--good)' }}>{msg}</p>}
        {err && <div className="err">{err}</div>}
      </form>
    </div>
  );
}
