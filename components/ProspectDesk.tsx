'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { toast, saving } from './Toast';
import type { Prospect } from '@/lib/prospects-public';
import { PROSPECT_SOURCES, stageLabel } from '@/lib/prospects-public';
import { firstName } from '@/lib/words';

/* The front of the funnel, on one card (25 October 2026). A prospect is a
   person from the moment a discovery call is booked. Four moves, each one
   button: the call happened, they are deciding, they passed, or send the
   onboarding email, which is what makes them an executive. */

function when(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function AddProspect({ calendarOn }: { calendarOn: boolean }) {
  const fid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/prospects', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: f.get('full_name'), email: f.get('email'), org_name: f.get('org_name'),
        source: f.get('source'), call_at: f.get('call_at') ? new Date(String(f.get('call_at'))).toISOString() : null,
        note: f.get('note')
      })
    }), 'Added');
    setBusy(false);
    if (ok) { (e.target as HTMLFormElement).reset(); setOpen(false); router.refresh(); }
  }

  async function pull() {
    setBusy(true);
    let r: Response, d: any = {};
    try {
      r = await fetch('/api/admin/prospects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'import' }) });
      d = await r.json().catch(() => ({}));
    } catch { setBusy(false); toast.bad('No connection.'); return; }
    setBusy(false);
    if (!r.ok) { toast.bad(d.error ?? 'Could not read the calendar.'); return; }
    if (d.reason) { toast.bad(d.reason); return; }
    toast.saved(d.added ? `${d.added} added from the calendar` : 'Nothing new on the calendar');
    router.refresh();
  }

  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      {!open && <button className="btn solid" onClick={() => setOpen(true)}>Add a prospect</button>}
      {calendarOn && <button className="btn ghost" disabled={busy} onClick={pull}>
        {busy ? 'Reading…' : 'Pull calls from the calendar'}</button>}
      {open && (
        <form onSubmit={submit} className="card" style={{ flex: '1 1 100%', marginTop: 8 }}>
          <div className="card-head"><h3>New prospect</h3>
            <button type="button" className="x-btn" aria-label="Close" onClick={() => setOpen(false)}>×</button></div>
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="ff"><label htmlFor={`${fid}-n`}>Full name</label><input id={`${fid}-n`} name="full_name" required /></div>
            <div className="ff"><label htmlFor={`${fid}-e`}>Email</label><input id={`${fid}-e`} name="email" type="email" required /></div>
            <div className="ff"><label htmlFor={`${fid}-o`}>Company</label><input id={`${fid}-o`} name="org_name" /></div>
            <div className="ff"><label htmlFor={`${fid}-c`}>Discovery call</label><input id={`${fid}-c`} name="call_at" type="datetime-local" /></div>
            <div className="ff"><label htmlFor={`${fid}-s`}>How they found us</label>
              <select id={`${fid}-s`} name="source" defaultValue="calendly">
                {PROSPECT_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select></div>
          </div>
          <div className="ff"><label htmlFor={`${fid}-t`}>Notes</label><textarea id={`${fid}-t`} name="note" rows={2} /></div>
          <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
        </form>
      )}
    </div>
  );
}

export function ProspectRow({ p }: { p: Prospect }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [losing, setLosing] = useState(false);
  const [note, setNote] = useState(p.note ?? '');
  const fid = useId();

  async function move(stage: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/prospects', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: p.id, stage, note, ...extra })
    }), stageLabel(stage));
    setBusy(false);
    if (ok) { setLosing(false); router.refresh(); }
  }

  const done = p.stage === 'won' || p.stage === 'lost';
  const onboardHref = `/console/people?onboard=${encodeURIComponent(p.email)}&name=${encodeURIComponent(p.full_name)}`;

  return (
    <div className="client-row">
      <div className="row between" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <b>{p.full_name}</b>
          <div className="small muted">{[p.org_name, p.email].filter(Boolean).join(' · ')}</div>
          {p.call_at && <div className="small muted">Call {when(p.call_at)}</div>}
        </div>
        <span className={`pill ${p.stage === 'won' ? 'good' : p.stage === 'lost' ? '' : 'warn'}`}>
          <span className="dot" />{stageLabel(p.stage)}
        </span>
      </div>

      {!done && (
        <>
          <div className="ff" style={{ marginTop: 12 }}>
            <label htmlFor={`${fid}-note`} className="xs muted">Notes from the call</label>
            <textarea id={`${fid}-note`} rows={2} value={note} onChange={e => setNote(e.target.value)}
              onBlur={() => note !== (p.note ?? '') && move(p.stage)} />
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {p.stage === 'booked' && <button className="btn sm ghost" disabled={busy} onClick={() => move('held')}>Call held</button>}
            {p.stage === 'held' && <button className="btn sm ghost" disabled={busy} onClick={() => move('proposal')}>They are deciding</button>}
            <a className="btn sm solid" href={onboardHref}>Send onboarding</a>
            {!losing
              ? <button className="btn sm ghost" disabled={busy} onClick={() => setLosing(true)}>Passed</button>
              : <form className="row" style={{ gap: 8 }} onSubmit={e => { e.preventDefault(); move('lost', { lost_reason: new FormData(e.currentTarget).get('why') }); }}>
                  <input name="why" placeholder="Why, in a few words" style={{ maxWidth: 260 }} />
                  <button className="btn sm" disabled={busy}>Mark passed</button>
                  <button type="button" className="btn sm ghost" onClick={() => setLosing(false)}>Keep</button>
                </form>}
          </div>
        </>
      )}
      {p.stage === 'lost' && p.lost_reason && <p className="small muted" style={{ marginTop: 8 }}>{p.lost_reason}</p>}
      {p.stage === 'won' && <p className="small muted" style={{ marginTop: 8 }}>Onboarding sent. They are in the Executives tab now{p.pending_id ? '' : ', under their email'}.</p>}
      {p.note && done && <p className="small" style={{ marginTop: 8 }}>{p.note}</p>}
      <span className="xs muted" style={{ display: 'block', marginTop: 6 }}>{firstName(p.full_name)} · {PROSPECT_SOURCES.find(s => s.key === p.source)?.label}</span>
    </div>
  );
}
