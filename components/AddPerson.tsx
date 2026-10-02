'use client';
import { useState, useId } from 'react';
import { toast } from '@/components/Toast';

/* Add talent by hand to the roster. Executives come in through the console's
   onboarding sender instead, so this is talent-only — the old client branch was
   dead and is gone. */
export default function AddPerson() {
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget);
    const body: any = { role: 'talent' };
    f.forEach((v, k) => { if (v !== '') body[k] = k === 'years_exp' || k === 'rate_month' ? Number(v) : v; });
    let r: Response, d: any = {};
    try {
      r = await fetch('/api/admin/people', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      d = await r.json().catch(() => ({}));
    } catch {
      setBusy(false); setErr('No connection, so nothing was saved.');
      toast.bad('No connection, so nothing was saved.'); return;
    }
    setBusy(false);
    if (!r.ok) {
      const why = d.error ?? 'Could not save.';
      setErr(why); toast.bad(`Not saved. ${why}`); return;
    }
    toast.saved(`${body.full_name} added`);
    setMsg(`${body.full_name} added. They join their record the first time they sign in with ${body.email}.`);
    (e.target as HTMLFormElement).reset();
  }

  if (!open) return <button className="btn sm solid" onClick={() => setOpen(true)}>Add talent</button>;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="card-head">
        <h3>Add talent</h3>
        <button type="button" className="x-btn" aria-label="Close" onClick={() => setOpen(false)}>×</button>
      </div>
      <p className="small muted" style={{ marginBottom: 20 }}>
        Creates the record now. When they sign in with this email address the account attaches itself.
        No invitation or password is needed.
      </p>
      <form onSubmit={submit}>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label htmlFor={`${fid}-1`}>Full name</label><input id={`${fid}-1`} name="full_name" required placeholder="Maria Elena Santos" /></div>
          <div className="ff"><label htmlFor={`${fid}-2`}>Email</label><input id={`${fid}-2`} name="email" type="email" required placeholder="name@email.com" /></div>
        </div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label htmlFor={`${fid}-3`}>Role</label><input id={`${fid}-3`} name="headline" placeholder="Executive Assistant" /></div>
          <div className="ff"><label htmlFor={`${fid}-4`}>Location</label><input id={`${fid}-4`} name="location" placeholder="Cebu, Philippines" /></div>
        </div>
        <div className="grid-4" style={{ gap: 14 }}>
          {/* No default value — the talent's actual timezone, not an assumed one, since this
              is also what interview-slot matching uses once they're bookable. */}
          <div className="ff"><label htmlFor={`${fid}-5`}>Timezone</label><input id={`${fid}-5`} name="timezone" placeholder="Asia/Manila" /></div>
          <div className="ff"><label htmlFor={`${fid}-6`}>Years</label><input id={`${fid}-6`} name="years_exp" type="number" min="0" placeholder="9" /></div>
          <div className="ff"><label htmlFor={`${fid}-7`}>English</label>
            <select id={`${fid}-7`} name="english"><option>Native-fluent</option><option>Fluent</option><option>Conversational</option></select></div>
          <div className="ff"><label htmlFor={`${fid}-8`}>Pay (USD/mo)</label><input id={`${fid}-8`} name="rate_month" type="number" min="0" placeholder="1450" /></div>
        </div>
        <div className="ff"><label htmlFor={`${fid}-9`}>Stage</label>
          <select id={`${fid}-9`} name="stage"><option>Applied</option><option>Screening</option><option>Vetted</option></select></div>
        <div className="ff"><label htmlFor={`${fid}-10`}>Documents link (optional)</label>
          <input id={`${fid}-10`} name="docs_url" type="url" placeholder="Paste the DocuSign link once it's out, or leave blank and send it separately" /></div>
        <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Add talent'}</button>
        {msg && <p className="small" style={{ marginTop: 14, color: 'var(--good)' }}>{msg}</p>}
        {err && <div className="err">{err}</div>}
      </form>
    </div>
  );
}
