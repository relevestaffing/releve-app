'use client';
import { useEffect, useState } from 'react';
import { WEEKDAYS, minutesToLabel, type Window } from '@/lib/scheduling';
import { saving } from './Toast';

const HOURS = Array.from({ length: 15 }, (_, i) => (i + 6) * 60);   // 6am – 8pm

export default function AvailabilityEditor({ who }: { who: 'client' | 'talent' }) {
  const [tz, setTz] = useState('UTC');
  const [windows, setWindows] = useState<Window[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/availability'); const d = await r.json();
      setTz(d.timezone && d.timezone !== 'UTC' ? d.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone);
      setWindows(d.windows ?? []); setLoaded(true);
    })();
  }, []);

  const isOn = (weekday: number, min: number) =>
    windows.some(w => w.weekday === weekday && min >= w.start_min && min < w.end_min);

  function toggle(weekday: number, min: number) {
    const on = isOn(weekday, min);
    let next = windows.filter(w => w.weekday !== weekday);
    const hours = HOURS.filter(h => (h === min ? !on : isOn(weekday, h)));
    /* rebuild the day as contiguous runs */
    let run: Window | null = null;
    hours.forEach(h => {
      if (run && run.end_min === h) run.end_min = h + 60;
      else { run = { weekday, start_min: h, end_min: h + 60 }; next.push(run); }
    });
    setWindows(next); setSaved(false);
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    const ok = await saving(() => fetch('/api/availability', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: tz, windows })
    }), 'Availability saved');
    setBusy(false); setSaved(ok);
  }
  if (!loaded) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;

  return (
    <div className="card">
      <div className="card-head">
        <h3>When you are free</h3>
        <span className="pill">{tz.replace('_', ' ')}</span>
      </div>
      <p className="small muted" style={{ marginBottom: 20 }}>
        {who === 'talent'
          ? 'Set the hours you can genuinely take a call, in your own time. Executives only ever see the overlap with their own hours, converted to theirs.'
          : 'Set the hours you are open to meeting candidates, in your own time. We only offer people slots inside these.'}
        {' '}You set this once; it repeats every week.
      </p>
      <div className="avail-scroll">
      <div className="avail-grid">
        <div />
        {HOURS.map(h => <div className="avail-hd" key={h}>{minutesToLabel(h)}</div>)}
        {[1, 2, 3, 4, 5, 6, 0].map(d => (
          <div key={d} style={{ display: 'contents' }}>
            <div className="avail-day">{WEEKDAYS[d].slice(0, 3)}</div>
            {HOURS.map(h => (
              <button key={h} className={`avail-cell ${isOn(d, h) ? 'on' : ''}`}
                onClick={() => toggle(d, h)} aria-label={`${WEEKDAYS[d]} ${minutesToLabel(h)}`} />
            ))}
          </div>
        ))}
      </div>
      </div>
      <div className="row" style={{ marginTop: 22, gap: 14 }}>
        <button className="btn solid" disabled={busy} onClick={save}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save availability'}</button>
        <span className="small muted">{windows.length ? `${windows.length} window${windows.length > 1 ? 's' : ''} set` : 'Nothing set — you will not be offered any interviews'}</span>
      </div>
    </div>
  );
}
