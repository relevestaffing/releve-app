'use client';
import { zoneLabel, ZONES } from '@/lib/words';
import { useEffect, useState, useId } from 'react';
import { WEEKDAYS, minutesToLabel, type Window } from '@/lib/scheduling';
import { saving } from './Toast';

const HOURS = Array.from({ length: 15 }, (_, i) => (i + 6) * 60);   // 6am – 8pm

export default function AvailabilityEditor({ who }: { who: 'client' | 'talent' }) {
  const fid = useId();
  const [tz, setTz] = useState('UTC');
  const [windows, setWindows] = useState<Window[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  async function load() {
    setLoadFailed(false);
    try {
      const r = await fetch('/api/availability');
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setTz(d.timezone && d.timezone !== 'UTC' ? d.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone);
      setWindows(d.windows ?? []); setLoaded(true);
    } catch {
      setLoadFailed(true);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

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
  if (loadFailed) return (
    <div className="card">
      <div className="empty"><span className="tick" />
        <p className="small">Could not load your availability.</p>
        <button className="btn sm ghost" onClick={load}>Try again</button>
      </div>
    </div>
  );
  if (!loaded) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;

  return (
    <div className="card">
      <div className="card-head">
        <h3>When you are free</h3>
      </div>
      <div className="ff" style={{ maxWidth: 340 }}>
        <label htmlFor={`${fid}-1`}>Your timezone</label>
        <select id={`${fid}-1`} value={ZONES.includes(tz) ? tz : ''} onChange={e => { setTz(e.target.value); setSaved(false); }}>
          {!ZONES.includes(tz) && <option value="">{zoneLabel(tz)} (detected)</option>}
          {ZONES.map(z => <option key={z} value={z}>{zoneLabel(z)}</option>)}
        </select>
        <span className="xs muted">
          Detected from your device. Change it if that is wrong.
        </span>
      </div>
      <p className="small muted" style={{ marginBottom: 20 }}>
        {who === 'talent'
          ? 'The hours you can take a call. Executives see only the overlap with their own.'
          : 'The hours you are open to meeting candidates. Nobody is offered a slot outside these.'}
        {' '}Set once, repeats weekly.
      </p>
      <div className="avail-scroll">
      <div className="avail-grid">
        <div />
        {HOURS.map(h => <div className="avail-hd" key={h}>{minutesToLabel(h)}</div>)}
        {[1, 2, 3, 4, 5, 6, 0].map(d => (
          <div key={d} style={{ display: 'contents' }}>
            <div className="avail-day">{WEEKDAYS[d].slice(0, 3)}</div>
            {HOURS.map(h => (
              <button key={h} className={`avail-cell ${isOn(d, h) ? 'on' : ''}`} aria-pressed={isOn(d, h)}
                onClick={() => toggle(d, h)} aria-label={`${WEEKDAYS[d]} ${minutesToLabel(h)}`} />
            ))}
          </div>
        ))}
      </div>
      </div>
      {/* Fifteen hours do not fit a phone; the grid scrolls, and this says so. */}
      <p className="xs muted avail-cue" aria-hidden="true">Scroll sideways for later hours</p>
      {/* Forty individual taps for a normal working week was the whole job. */}
      <div className="row" style={{ marginTop: 18, gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm ghost" onClick={() => { setWindows(
          [1, 2, 3, 4, 5].map(d => ({ weekday: d, start_min: 9 * 60, end_min: 17 * 60 }))); setSaved(false); }}>
          Weekdays, 9 to 5
        </button>
        <button className="btn sm ghost" onClick={() => { setWindows(
          [1, 2, 3, 4, 5].map(d => ({ weekday: d, start_min: 9 * 60, end_min: 12 * 60 }))); setSaved(false); }}>
          Weekday mornings
        </button>
        <button className="btn sm ghost" onClick={() => { setWindows(
          [1, 2, 3, 4, 5].map(d => ({ weekday: d, start_min: 13 * 60, end_min: 18 * 60 }))); setSaved(false); }}>
          Weekday afternoons
        </button>
        {windows.length > 0 &&
          <button className="btn sm ghost" onClick={() => { setWindows([]); setSaved(false); }}>Clear</button>}
      </div>

      <div className="row" style={{ marginTop: 22, gap: 14, flexWrap: 'wrap' }}>
        <button className="btn solid" disabled={busy} onClick={save}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save availability'}</button>
        {/* "windows" is what the table calls them. What the person set is
            blocks of time, so that is what the line says. */}
        <span className="small muted">{windows.length ? `${windows.length} block${windows.length > 1 ? 's' : ''} of time set` : 'Nothing set. You will not be offered any interviews'}</span>
      </div>
    </div>
  );
}
