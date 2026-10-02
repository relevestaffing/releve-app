'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { addDays, type DailyLog } from '@/lib/experience-public';
import './experience.css';

/* The end-of-day note. Quick on purpose: what got done, anything in
   the way. One line can be shared with the executive as a highlight; the
   rest stays between the talent and Relève. Picking an earlier day loads
   what was written then, so a missed evening can be filled in next morning. */
export default function DailyLogForm({ placementId, executive, today, logs }: {
  placementId: string; executive: string; today: string; logs: DailyLog[];
}) {
  const router = useRouter();
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const existing = useMemo(() => logs.find(l => l.placement_id === placementId && l.log_date === day) ?? null,
    [logs, placementId, day]);
  const [share, setShare] = useState<boolean>(existing?.share_highlight ?? false);
  const key = `${placementId}-${day}-${existing?.updated_at ?? 'new'}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/log', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        placement_id: placementId, log_date: day,
        done_text: f.get('done_text'), blockers: f.get('blockers'),
        highlight: f.get('highlight'), share_highlight: share
      })
    }), existing ? 'Log updated' : 'Logged');
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <form key={key} onSubmit={submit} className="card">
      <div className="card-head">
        <h3>{day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : 'Earlier day'}</h3>
        <span className={`pill ${existing ? 'good' : ''}`}>{existing ? <><span className="dot" />Logged</> : 'Not logged yet'}</span>
      </div>
      <div className="ff" style={{ maxWidth: 240 }}>
        <label htmlFor={`lg-day-${placementId}`}>Day</label>
        <input id={`lg-day-${placementId}`} type="date" value={day} max={today} min={addDays(today, -30)}
          onChange={e => { setDay(e.target.value || today); setShare(false); }} />
      </div>
      <div className="ff">
        <label htmlFor={`lg-done-${placementId}`}>What got done</label>
        <textarea id={`lg-done-${placementId}`} name="done_text" rows={4} maxLength={4000}
          defaultValue={existing?.done_text ?? ''}
          placeholder="Inbox to zero, Thursday's board pack drafted, three supplier calls booked." />
      </div>
      <div>
        <div className="ff">
          <label htmlFor={`lg-block-${placementId}`}>Anything in the way <span className="muted">(private)</span></label>
          <input id={`lg-block-${placementId}`} name="blockers" maxLength={2000}
            defaultValue={existing?.blockers ?? ''} placeholder="Waiting on access to the finance drive" />
        </div>
      </div>
      <div className="ff">
        <label htmlFor={`lg-hl-${placementId}`}>One highlight <span className="muted">(optional)</span></label>
        <input id={`lg-hl-${placementId}`} name="highlight" maxLength={600}
          defaultValue={existing?.highlight ?? ''} placeholder="Rebooked the Lisbon trip and saved $1,200" />
      </div>
      <label className="log-share">
        <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} />
        <span>Share this highlight with {executive}. It appears in their monthly report. Everything else here stays between you and Relève.</span>
      </label>
      <button className="btn solid" disabled={busy} style={{ marginTop: 14 }}>
        {busy ? 'Saving…' : existing ? 'Update the log' : 'Save the log'}
      </button>
    </form>
  );
}
