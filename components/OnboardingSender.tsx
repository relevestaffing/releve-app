'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { firstName } from '@/lib/words';
import Overlay from './Overlay';

/* The whole intake for an executive, right after the discovery call.
   --------------------------------------------------------------
   Name, email, send — it opens their search behind the scenes and emails
   them the deposit link along with the account link, in one motion. The
   role brief and everything else can be filled in afterwards, from their
   row below; nothing here waits on it. */
export default function OnboardingSender({ prefill }: { prefill?: { name: string; email: string } | null } = {}) {
  const fid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(prefill));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') ?? '');
    let r: Response, d: any = {};
    try {
      r = await fetch('/api/admin/onboarding', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email: f.get('email') })
      });
      d = await r.json().catch(() => ({}));
    } catch {
      setBusy(false); setErr('No connection, so nothing was sent.');
      toast.bad('No connection, so nothing was sent.'); return;
    }
    setBusy(false);
    if (!r.ok) {
      const why = d.error ?? 'Could not send.';
      setErr(why); toast.bad(why); return;
    }
    /* emailed:false in real mode means the mail host refused — not preview
       mode. The record stands either way; the words have to say which. */
    if (d.emailed === false && d.note) toast.saved(`${firstName(name)} added. Nothing was emailed in preview mode`);
    else if (d.emailed === false) toast.bad(`${firstName(name)} added, but the email did not send. Check the email settings under The business, Team, then resend`);
    else toast.saved(`Onboarding sent to ${firstName(name)}`);
    if (d.warning) toast.ok(d.warning);
    (e.target as HTMLFormElement).reset();
    setOpen(false);
    router.refresh();
  }

  /* A small button in the card head of the list it adds to; the form itself
     opens over the page. The trigger used to be a full-size solid button
     floating between the tabs and the card, the one object on the page with
     no container, and the form unfolded in that gap. */
  if (!open) return (
    <button className="btn sm solid" onClick={() => setOpen(true)}>Send onboarding email</button>
  );

  return (
    <Overlay onClose={() => setOpen(false)} label="Send executive onboarding">
      <div className="card-head">
        <h3>Send onboarding email</h3>
        <button type="button" className="x-btn" aria-label="Close" onClick={() => setOpen(false)}>×</button>
      </div>
      <p className="small muted" style={{ marginBottom: 20, maxWidth: 560 }}>
        Send this after the discovery call. It opens their search and emails the
        deposit link (no account needed first), with account and invoicing setup.
        Add the role brief later from their row below.
      </p>
      <form onSubmit={submit}>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label htmlFor={`${fid}-1`}>Full name</label><input id={`${fid}-1`} name="name" required placeholder="Elena Marsh" defaultValue={prefill?.name ?? ''} /></div>
          <div className="ff"><label htmlFor={`${fid}-2`}>Email</label><input id={`${fid}-2`} name="email" type="email" required placeholder="elena@marshco.com" defaultValue={prefill?.email ?? ''} /></div>
        </div>
        <button className="btn solid" disabled={busy}>{busy ? 'Sending…' : 'Send onboarding email'}</button>
        {err && <div className="err">{err}</div>}
      </form>
    </Overlay>
  );
}
