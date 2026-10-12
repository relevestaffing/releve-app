'use client';
import { firstName } from '@/lib/words';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { fmtDate } from '@/lib/words';

const STAGES = ['Sourcing', 'Presented', 'Interviewing', 'Placed', 'On hold'];

export default function RoleBriefEditor({ clientKey, pending, initial, name }:
  { clientKey: string; pending: boolean; initial: any; name: string | null }) {
  const fid = useId();
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
    }), open ? `${firstName(name, 'The executive')} can see candidates again` : 'Search closed');
    setFlipping(false);
    if (ok) router.refresh();
  }

  /* What was just saved, so the read view can render it straight away.
     ---------------------------------------------------------------------
     Two faults lived here and compounded into "I press Save, it lets me keep
     editing, and it doesn't save".

     1. `open` is seeded from `!initial?.role_title` through useState, which
        React evaluates once at mount and never again. A successful save called
        router.refresh() but nothing set `open` back to false, so the form sat
        in edit mode forever — indistinguishable from a save that failed, even
        though the row had been written correctly.
     2. Flipping to the read view alone would not have fixed it: that view
        renders from `initial`, the server prop, which still holds the pre-save
        values until refresh() lands a moment later. The brief would flash
        stale or blank, which reads as a failed save just as badly.

     So the save keeps its own copy of what it sent, and the read view renders
     from that until the server catches up. (12 October.) */
  const [justSaved, setJustSaved] = useState<Record<string, any> | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { client_key: clientKey, pending };
    f.forEach((v, k) => { body[k] = v; });
    const ok = await saving(() => fetch('/api/admin/search', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body) }), 'Brief saved');
    setBusy(false); setSaved(ok);
    if (ok) {
      const { client_key: _ck, pending: _pd, ...fields } = body;
      setJustSaved(fields);
      setOpen(false);
      router.refresh();
    }
  }

  /* Server values, overlaid with anything saved in this session that the
     server has not sent back yet. See the note on justSaved above. */
  const view: any = { ...initial, ...(justSaved ?? {}) };

  if (!open) return (
    <div className="brief-read">
      <div className="row between" style={{ gap: 14, flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)' }}>{view.role_title}</b>
          {view.stage && <span className="pill" style={{ marginLeft: 10 }}>{view.stage}</span>}
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
          ? `${firstName(name, 'The executive')} can see their candidate, interviews and role brief.`
          : `${firstName(name, 'The executive')} sees only the people already working with them. Open a search to put someone new in front of them.`}
      </p>
      <dl className="brief-facts">
        {view.scope && <><dt>Owns</dt><dd>{view.scope}</dd></>}
        {view.hours && <><dt>Hours</dt><dd>{view.hours}</dd></>}
        {view.tools && <><dt>Tools</dt><dd>{view.tools}</dd></>}
        {view.target_at && <><dt>Start</dt><dd>{fmtDate(view.target_at)}</dd></>}
      </dl>
    </div>
  );

  return (
    <form onSubmit={submit} onChange={() => setSaved(false)} className="brief-read">
      <p className="xs muted" style={{ marginBottom: 14 }}>
        From the intro call with {firstName(name, 'the executive')}. Written the way you would say it back to them.
      </p>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="ff"><label htmlFor={`${fid}-1`}>Role</label>
          <input id={`${fid}-1`} name="role_title" defaultValue={initial?.role_title ?? ''} placeholder="Chief of Staff" required /></div>
        <div className="ff"><label htmlFor={`${fid}-2`}>Stage</label>
          <select id={`${fid}-2`} name="stage" defaultValue={initial?.stage ?? 'Sourcing'}>
            {STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div className="ff"><label htmlFor={`${fid}-3`}>What the talent will own</label>
        <textarea id={`${fid}-3`} name="scope" rows={2} defaultValue={initial?.scope ?? ''}
          placeholder="Inbox and calendar, board prep, running the weekly leadership meeting end to end." /></div>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="ff"><label htmlFor={`${fid}-4`}>Hours</label>
          <input id={`${fid}-4`} name="hours" defaultValue={initial?.hours ?? ''} placeholder="40 a week, four overlapping 8am–12pm Pacific" /></div>
        <div className="ff"><label htmlFor={`${fid}-5`}>Tools they must know</label>
          <input id={`${fid}-5`} name="tools" defaultValue={initial?.tools ?? ''} placeholder="Notion, Superhuman, Ramp" /></div>
      </div>
      <div className="ff" style={{ maxWidth: 300 }}><label htmlFor={`${fid}-6`}>Target start</label>
        <input id={`${fid}-6`} type="date" name="target_at" defaultValue={initial?.target_at ?? ''} /></div>
      <div className="row" style={{ gap: 12 }}>
        <button className="btn sm solid" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save brief'}</button>
        {initial?.role_title && <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </form>
  );
}
