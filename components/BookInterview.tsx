'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';

type Slot = { startISO: string; endISO: string; label: string; day: string };

export default function BookInterview({ talentId, talentName, slots, tz }: {
  talentId: string; talentName: string; slots: Slot[]; tz: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ when: string; url: string | null; warning: string | null } | null>(null);

  const byDay = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    (acc[s.day] = acc[s.day] || []).push(s); return acc;
  }, {});

  async function book(s: Slot) {
    setBusy(s.startISO);
    let r: Response, d: any = {};
    try {
      r = await fetch('/api/interviews', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ talentId, startISO: s.startISO, durationMin: 45 })
      });
      d = await r.json().catch(() => ({}));
    } catch {
      setBusy(null);
      toast.bad('No connection \u2014 the interview was not booked.');
      return;
    }
    setBusy(null);
    /* Only claim it is booked once the server says so. Showing "Confirmed"
       over a failed request is how someone turns up to a meeting nobody made. */
    if (!r.ok) {
      toast.bad(d.error ? `Not booked \u2014 ${d.error}` : 'That slot could not be booked. Please pick another.');
      router.refresh();
      return;
    }
    toast.saved('Interview booked');
    setDone({ when: s.label, url: d.interview?.meeting_url ?? null, warning: d.warning ?? null });
    router.refresh();
  }

  if (done) return (
    <div className="card tight" style={{ background: 'var(--cream)' }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Interview booked</div>
          <div className="small"><b>{talentName}</b> · {done.when} ({tz.replace('_', ' ')})</div>
          {done.url
            ? <a className="small" href={done.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Join link</a>
            : <div className="xs muted" style={{ marginTop: 6 }}>Relève will send the meeting link shortly.</div>}
        </div>
        <span className="pill good"><span className="dot" />Confirmed</span>
      </div>
    </div>
  );

  if (!open) return (
    <button className="btn solid" onClick={() => setOpen(true)} disabled={!slots.length}>
      {slots.length ? 'Book an interview' : 'No shared availability'}
    </button>
  );

  return (
    <div className="card tight">
      <div className="card-head" style={{ marginBottom: 10 }}>
        <h3>Times you are both free</h3>
        <button className="x-btn" onClick={() => setOpen(false)}>×</button>
      </div>
      <p className="xs muted" style={{ marginBottom: 16 }}>Shown in your time ({tz.replace('_', ' ')}). 45 minutes.</p>
      {Object.entries(byDay).slice(0, 5).map(([day, list]) => (
        <div className="slot-day" key={day}>
          <h4>{day}</h4>
          <div className="slot-row">
            {list.map(s => (
              <button key={s.startISO} className="slot-btn" disabled={busy === s.startISO} onClick={() => book(s)}>
                {busy === s.startISO ? 'Booking…' : s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
