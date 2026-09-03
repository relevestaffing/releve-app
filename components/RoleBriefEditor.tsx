'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';

const STAGES = ['Sourcing', 'Shortlisted', 'Interviewing', 'Placed', 'On hold'];

export default function RoleBriefEditor({ clientKey, pending, initial, name }:
  { clientKey: string; pending: boolean; initial: any; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(!initial?.role_title);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

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
        </div>
        <button className="btn sm ghost" onClick={() => { setOpen(true); setSaved(false); }}>Edit brief</button>
      </div>
      <dl className="brief-facts">
        {initial.scope && <><dt>Owns</dt><dd>{initial.scope}</dd></>}
        {initial.hours && <><dt>Hours</dt><dd>{initial.hours}</dd></>}
        {initial.tools && <><dt>Tools</dt><dd>{initial.tools}</dd></>}
        {initial.target_at && <><dt>Start</dt><dd>{initial.target_at}</dd></>}
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
        <input name="target_at" defaultValue={initial?.target_at ?? ''} placeholder="Within six weeks" /></div>
      <div className="row" style={{ gap: 12 }}>
        <button className="btn sm solid" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save brief'}</button>
        {initial?.role_title && <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </form>
  );
}
