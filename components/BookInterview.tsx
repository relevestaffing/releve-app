'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { zoneLabel } from '@/lib/words';

type Slot = { startISO: string; endISO: string; label: string; day: string };

export default function BookInterview({ talentId, talentName, slots, tz, clientId }: {
  talentId: string; talentName: string; slots: Slot[]; tz: string;
  /* Set when Relève is booking on an executive's behalf from the console.
     Left out when the executive books for themselves. */
  clientId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ when: string; url: string | null; warning: string | null } | null>(null);

  const byDay = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    (acc[s.day] = acc[s.day] || []).push(s); return acc;
  }, {});

  async function book(s: Slot) {
    /* One booking at a time. Without this, a second slot could be tapped while
       the first request was still in flight — two interviews for one person. */
    if (busy) return;
    setBusy(s.startISO);
    let r: Response, d: any = {};
    try {
      r = await fetch('/api/interviews', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ talentId, clientId, startISO: s.startISO, durationMin: 45 })
      });
      d = await r.json().catch(() => ({}));
    } catch {
      setBusy(null);
      toast.bad('You appear to be offline. The interview was not booked.');
      return;
    }
    setBusy(null);
    /* Only claim it is booked once the server says so. Showing "Confirmed"
       over a failed request is how someone turns up to a meeting nobody made. */
    if (!r.ok) {
      toast.bad(d.error ? `Not booked. ${d.error}` : 'That time could not be booked. Please choose another.');
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
          <div className="small"><b>{talentName}</b> · {done.when} ({zoneLabel(tz)})</div>
          {done.url
            ? <a className="small" href={done.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Join the call</a>
            : clientId
              /* Relève booking it: say plainly that the link is owed, and why. */
              ? <div className="xs" style={{ marginTop: 6, color: 'var(--warn, #B4762E)' }}>No meeting link was created{done.warning ? `: ${done.warning}` : ''}. Both sides were told one is coming, so please send it.</div>
              : <div className="xs muted" style={{ marginTop: 6 }}>Relève will send the meeting link shortly.</div>}
        </div>
        <span className="pill good"><span className="dot" />Confirmed</span>
      </div>
    </div>
  );

  if (!open) return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="btn solid" onClick={() => setOpen(true)} disabled={!slots.length}>
        {slots.length ? 'Book an interview' : 'No shared availability'}
      </button>
      {!slots.length && (
        <p className="xs muted" style={{ margin: 0 }}>
          Your available hours do not overlap this week. <a href="/app/messages" style={{ textDecoration: 'underline' }}>Message your Client Success Manager</a> with a time that suits you, and we will arrange it.
        </p>
      )}
    </div>
  );

  return (
    <div className="card tight">
      <div className="card-head" style={{ marginBottom: 10 }}>
        <h3>Times you are both free</h3>
        <button type="button" className="x-btn" aria-label="Close" onClick={() => setOpen(false)}>×</button>
      </div>
      <p className="xs muted" style={{ marginBottom: 16 }}>Times in {zoneLabel(tz)}. Each interview is 45 minutes.</p>
      {Object.entries(byDay).slice(0, 5).map(([day, list]) => (
        <div className="slot-day" key={day}>
          <h4>{day}</h4>
          <div className="slot-row">
            {list.map(s => (
              <button key={s.startISO} className="slot-btn" disabled={busy !== null} onClick={() => book(s)}>
                {busy === s.startISO ? 'Booking…' : s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
