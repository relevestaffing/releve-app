'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { fmtDate } from '@/lib/words';

const STAGES = ['Sourcing', 'Presented', 'Interviewing', 'Placed', 'On hold'];

export default function RoleBriefEditor({ clientKey, pending, initial, name }:
  { clientKey: string; pending: boolean; initial: any; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(!initial?.role_title);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [flipping, setFlipping] = useState(false);

  /* closed_at, not the stage label, is what the executive's account reads.
     A search with no closed_at means their candidate and interview screens
     exist; with one set they see only the people already working for them. */
  const hiring = !initial?.closed_at;

  /* Opening a search is how an executive who already has an assistant gets
     the hiring screens back. Closing one by hand is for a search called off
     rather than filled — a placement closes its own search automatically. */
  async function flip(open: boolean) {
    setFlipping(true);
    const ok = await saving(() => fetch('/api/admin/search', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_key: clientKey, pending, action: open ? 'open' : 'close', reason: 'withdrawn' })
    }), open ? `${name.split(' ')[0]} can see candidates again` : 'Search closed');
    setFlipping(false);
    if (ok) router.refresh();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { client_key: clientKey, pending };
    f.forEach((v, k) => { body[k] = v; });
    const ok = await saving(() => fetch('/api/admin/search', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body) }), 'Brief saved');
    setBusy(false); setSaved(ok);
    if (ok) router.refresh();
  }

  if (!open) return (
    <div className="brief-read">
      <div className="row between" style={{ gap: 14, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)' }}>{initial.role_title}</b>
          {initial.stage && <span className="pill" style={{ marginLeft: 10 }}>{initial.stage}</span>}
          <span className={`pill ${hiring ? 'good' : ''}`} style={{ marginLeft: 8 }}>
            <span className="dot" />{hiring ? 'Hiring' : 'Not hiring'}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!pending && (
            <button className="btn sm ghost" disabled={flipping} onClick={() => flip(!hiring)}>
              {flipping ? 'One moment…' : hiring ? 'Close the search' : 'Open a new search'}
            </button>
          )}
          <button className="btn sm ghost" onClick={() => { setOpen(true); setSaved(false); }}>Edit brief</button>
        </div>
      </div>
      <p className="xs muted" style={{ marginTop: 8 }}>
        {hiring
          ? `${name.split(' ')[0]} can see their candidate, interviews and role brief.`
          : `${name.split(' ')[0]} sees only the people already working with them. Open a search to put someone new in front of them.`}
      </p>
      <dl className="brief-facts">
        {initial.scope && <><dt>Owns</dt><dd>{initial.scope}</dd></>}
        {initial.hours && <><dt>Hours</dt><dd>{initial.hours}</dd></>}
        {initial.tools && <><dt>Tools</dt><dd>{initial.tools}</dd></>}
        {initial.target_at && <><dt>Start</dt><dd>{fmtDate(initial.target_at)}</dd></>}
      </dl>
    </div>
  );

  return (
    <form onSubmit={submit} onChange={() => setSaved(false)} className="brief-read">
      <p className="xs muted" style={{ marginBottom: 14 }}>
        From the intro call with {name.split(' ')[0]}. Written the way you would say it back to them.
      </p>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="ff"><label>Role</label>
          <input name="role_title" defaultValue={initial?.role_title ?? ''} placeholder="Chief of Staff" required /></div>
        <div className="ff"><label>Stage</label>
          <select name="stage" defaultValue={initial?.stage ?? 'Sourcing'}>
            {STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div className="ff"><label>What the talent will own</label>
        <textarea name="scope" rows={2} defaultValue={initial?.scope ?? ''}
          placeholder="Inbox and calendar, board prep, running the weekly leadership meeting end to end." /></div>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="ff"><label>Hours</label>
          <input name="hours" defaultValue={initial?.hours ?? ''} placeholder="40 a week, four overlapping 8am–12pm Pacific" /></div>
        <div className="ff"><label>Tools they must know</label>
          <input name="tools" defaultValue={initial?.tools ?? ''} placeholder="Notion, Superhuman, Ramp" /></div>
      </div>
      <div className="ff" style={{ maxWidth: 300 }}><label>Target start</label>
        <input type="date" name="target_at" defaultValue={initial?.target_at ?? ''} /></div>
      <div className="row" style={{ gap: 12 }}>
        <button className="btn sm solid" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save brief'}</button>
        {initial?.role_title && <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </form>
  );
}
