'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import type { JobApplication } from '@/lib/jobs-public';

/* Booking a call with somebody who does not exist in the system yet.
   ------------------------------------------------------------------
   No account, no availability, no shared calendar — just a person who applied
   and an email address. So this is deliberately plain: pick a time, we make
   the Zoom link and write to them in their own timezone. If it does not suit,
   they reply and you move it. */
const SOON = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In two days', days: 2 },
  { label: 'In three days', days: 3 }
];

function atHour(days: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}
const localValue = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function CallBooker({ app, onDone }: { app: JobApplication; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState(localValue(atHour(1, 10)));
  const [minutes, setMinutes] = useState(30);
  const moving = app.call_state === 'invited';

  const theirTime = (() => {
    if (!app.timezone || !when) return null;
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: app.timezone, weekday: 'long', day: 'numeric', month: 'long',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      }).format(new Date(when));
    } catch { return null; }
  })();

  async function book() {
    if (!when) { toast.bad('Pick a time first.'); return; }
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/applications', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: app.id, action: moving ? 'move_call' : 'book_call',
        startISO: new Date(when).toISOString(), minutes
      })
    }), moving ? 'Moved — they have been told' : `${app.full_name.split(' ')[0]} has the invitation`);
    setBusy(false);
    if (ok) { onDone(); router.refresh(); }
  }

  return (
    <div className="decide-form" style={{ marginTop: 16 }}>
      <p className="small" style={{ margin: '0 0 14px' }}>
        {moving ? <>Move the call with <b>{app.full_name}</b>. The old meeting is cancelled and they are told the new time.</>
                : <>A conversation before anything else. Nothing about Relève reaches them
                    until this has happened — no account, no assessment, no roster.</>}
      </p>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {SOON.map(s => (
          <button key={s.label} type="button" className="btn sm ghost"
            onClick={() => setWhen(localValue(atHour(s.days, 10)))}>
            {s.label}, 10am
          </button>
        ))}
      </div>

      <div className="grid-2" style={{ gap: 14 }}>
        <div className="ff"><label>When, your time</label>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></div>
        <div className="ff"><label>How long</label>
          <select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
            <option value={20}>20 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
          </select></div>
      </div>

      <p className="xs muted" style={{ marginBottom: 14 }}>
        {theirTime
          ? <>For {app.full_name.split(' ')[0]} in {app.timezone!.replace(/_/g, ' ')} that is <b>{theirTime}</b>. That is what the email will say.</>
          : <>They did not give a timezone, so the email will state the time in yours and name the zone.</>}
      </p>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <button className="btn solid" disabled={busy} onClick={book}>
          {busy ? 'Sending…' : moving ? 'Move it and tell them' : 'Book it and send the invitation'}
        </button>
        <button type="button" className="btn ghost sm" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
