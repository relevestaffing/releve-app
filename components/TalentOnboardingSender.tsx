'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';

/* The whole intake for talent Sage sources herself, right after a call.
   --------------------------------------------------------------
   Name, email, send — it opens their record behind the scenes and emails
   them the account link with the assessment inside it, the same invite an
   inbound applicant gets. Everything else about them — location, years,
   pay — can be filled in afterwards with Add talent; nothing here waits
   on it. Mirrors OnboardingSender on the executive side. */
export default function TalentOnboardingSender() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') ?? '');
    let r: Response, d: any = {};
    try {
      r = await fetch('/api/admin/talent-onboarding', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email: f.get('email'), role: f.get('role'), docs_url: f.get('docs_url') })
      });
      d = await r.json().catch(() => ({}));
    } catch {
      setBusy(false); setErr('No connection — nothing was sent.');
      toast.bad('No connection — nothing was sent.'); return;
    }
    setBusy(false);
    if (!r.ok) {
      const why = d.error ?? 'Could not send.';
      setErr(why); toast.bad(why); return;
    }
    /* emailed:false in real mode means the mail host refused — not preview
       mode. The record stands either way; the words have to say which. */
    if (d.emailed === false && d.note) toast.saved(`${name.split(' ')[0]} added — nothing emailed in preview mode`);
    else if (d.emailed === false) toast.bad(`${name.split(' ')[0]} added, but the email did not send — check Email on the Team page and resend`);
    else toast.saved(`Onboarding sent to ${name.split(' ')[0]}`);
    if (d.warning) toast.ok(d.warning);
    (e.target as HTMLFormElement).reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) return (
    <button className="btn solid" onClick={() => setOpen(true)}>Send onboarding email</button>
  );

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="card-head">
        <h3>Send onboarding email</h3>
        <button className="x-btn" onClick={() => setOpen(false)}>×</button>
      </div>
      <p className="small muted" style={{ marginBottom: 20, maxWidth: 560 }}>
        For someone you have already talked to. Opens their record and emails
        them the account link with the assessment inside it — no separate add
        step. The rest of their profile can wait until you write it below.
      </p>
      <form onSubmit={submit}>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label>Full name</label><input name="name" required placeholder="Maria Elena Santos" /></div>
          <div className="ff"><label>Email</label><input name="email" type="email" required placeholder="maria@email.com" /></div>
        </div>
        <div className="ff"><label>Role — optional</label>
          <input name="role" placeholder="Executive Assistant" /></div>
        <div className="ff"><label>Documents link — optional</label>
          <input name="docs_url" type="url" placeholder="Paste the DocuSign link for their NDA + contractor agreement, or leave blank" /></div>
        <button className="btn solid" disabled={busy}>{busy ? 'Sending…' : 'Send onboarding email'}</button>
        {err && <div className="err">{err}</div>}
      </form>
    </div>
  );
}
