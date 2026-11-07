'use client';
import React, { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zoneLabel, ZONES } from '@/lib/words';
import { saving } from './Toast';
import type { BookingSettings, Booking, Range } from '@/lib/booking';

/* The console's booking page: Nona's hours, the rules, the words on
   relevestaffing.com/book, and the calls booked through it (2 Nov 2026). */

const DAYS = [
  { k: '1', n: 'Monday' }, { k: '2', n: 'Tuesday' }, { k: '3', n: 'Wednesday' }, { k: '4', n: 'Thursday' },
  { k: '5', n: 'Friday' }, { k: '6', n: 'Saturday' }, { k: '0', n: 'Sunday' }
];
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4), m = (i % 4) * 15;
  const v = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return { v, label };
});
const LINK = 'https://relevestaffing.com/book/';
const SEL: React.CSSProperties = { width: 136, padding: '9px 10px', fontSize: 14.5, border: '1px solid rgba(53,68,58,.25)', borderRadius: 2, background: '#fff', color: 'inherit', font: 'inherit' };

function RangeRow({ r, onChange, onRemove, id }: { r: Range; onChange: (r: Range) => void; onRemove: () => void; id: string }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select aria-label="From" id={id} value={r.start} onChange={e => onChange({ ...r, start: e.target.value })} style={SEL}>
        {TIMES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
      </select>
      <span className="small muted">to</span>
      <select aria-label="To" value={r.end} onChange={e => onChange({ ...r, end: e.target.value })} style={SEL}>
        {TIMES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        <option value="23:59">Midnight</option>
      </select>
      <button className="btn sm ghost" onClick={onRemove} aria-label="Remove these hours">Remove</button>
    </div>
  );
}

export default function BookingSettingsEditor({ initial, bookings, calendarOk, zoomOk }: {
  initial: BookingSettings; bookings: Booking[]; calendarOk: boolean; zoomOk: boolean;
}) {
  const fid = useId();
  const router = useRouter();
  const [s, setS] = useState<BookingSettings>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const set = (patch: Partial<BookingSettings>) => { setS(prev => ({ ...prev, ...patch })); setDirty(true); };
  const setDay = (k: string, ranges: Range[]) => set({ weekly: { ...s.weekly, [k]: ranges } });
  const bad = useMemo(() => {
    const all = [...Object.values(s.weekly), ...s.overrides.map(o => o.ranges)];
    return all.some(rs => rs.some(r => r.start >= r.end));
  }, [s]);

  async function save() {
    if (busy || bad) return;
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/booking', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: s })
    }), 'Booking page saved');
    setBusy(false);
    if (ok) { setDirty(false); router.refresh(); }
  }

  async function cancel(b: Booking, quietly: boolean) {
    setNote('');
    const r = await fetch('/api/admin/booking', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id: b.id, quietly })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setNote(j.error || 'That did not cancel.'); return; }
    setCancelling(null);
    setNote(quietly ? `${b.name}'s call is cancelled. They were not emailed.` : `${b.name}'s call is cancelled and they have been emailed.`);
    router.refresh();
  }

  const pt = (iso: string) => new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: s.timezone, timeZoneName: 'short'
  });

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* The link */}
      <div className="card">
        <div className="card-head"><h3>Your booking link</h3></div>
        <p className="small muted" style={{ marginTop: 0 }}>
          Send this to anyone you want on a discovery call. It is a page on the website, so no sign-in is needed.
          The website's Book a Call buttons use the same hours.
        </p>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ fontSize: 15 }}>{LINK.replace('https://', '')}</code>
          <button className="btn sm solid" onClick={async () => {
            try { await navigator.clipboard.writeText(LINK); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
          }}>{copied ? 'Copied' : 'Copy link'}</button>
          <a className="btn sm ghost" href={LINK} target="_blank" rel="noopener">Open the page</a>
        </div>
        <label className="row" style={{ gap: 10, marginTop: 16, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={s.enabled} onChange={e => set({ enabled: e.target.checked })} />
          <span className="small">{s.enabled ? 'Taking bookings' : 'Paused: the page shows no times'}</span>
        </label>
        {(!calendarOk || !zoomOk) && (
          <p className="small" style={{ marginBottom: 0 }}>
            {!calendarOk ? 'The hello@ calendar is not connected, so no times can be offered. ' : ''}
            {!zoomOk ? 'Zoom is not connected, so calls are booked without a Zoom link.' : ''}
          </p>
        )}
      </div>

      {/* Weekly hours */}
      <div data-save-scope style={{ display: 'grid', gap: 18 }}>
      <div className="card">
        <div className="card-head"><h3>Weekly hours</h3></div>
        <div className="ff" style={{ maxWidth: 340 }}>
          <label htmlFor={`${fid}-tz`}>Your time zone</label>
          <select id={`${fid}-tz`} value={ZONES.includes(s.timezone) ? s.timezone : ''} onChange={e => set({ timezone: e.target.value })}>
            {!ZONES.includes(s.timezone) && <option value="">{zoneLabel(s.timezone)}</option>}
            {ZONES.map(z => <option key={z} value={z}>{zoneLabel(z)}</option>)}
          </select>
          <span className="xs muted">Guests always see times in their own time zone.</span>
        </div>
        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          {DAYS.map(d => {
            const rs = s.weekly[d.k] ?? [];
            return (
              <div key={d.k} className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid var(--rule, rgba(53,68,58,.12))' }}>
                <label className="row" style={{ gap: 8, width: 140, alignItems: 'center', cursor: 'pointer', paddingTop: 6 }}>
                  <input type="checkbox" checked={rs.length > 0}
                    onChange={e => setDay(d.k, e.target.checked ? [{ start: '09:00', end: '13:00' }] : [])} />
                  <span>{d.n}</span>
                </label>
                <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 260 }}>
                  {rs.length === 0 && <span className="small muted" style={{ paddingTop: 6 }}>Unavailable</span>}
                  {rs.map((r, i) => (
                    <RangeRow key={i} id={`${fid}-${d.k}-${i}`} r={r}
                      onChange={nr => setDay(d.k, rs.map((x, j) => j === i ? nr : x))}
                      onRemove={() => setDay(d.k, rs.filter((_, j) => j !== i))} />
                  ))}
                  {rs.length > 0 && (
                    <div><button className="btn sm ghost" onClick={() => setDay(d.k, [...rs, { start: rs[rs.length - 1].end < '17:00' ? '14:00' : '18:00', end: rs[rs.length - 1].end < '17:00' ? '17:00' : '20:00' }])}>
                      Add hours
                    </button></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Date-specific */}
      <div className="card">
        <div className="card-head"><h3>Specific dates</h3></div>
        <p className="small muted" style={{ marginTop: 0 }}>Block a day you are away, or set different hours for one date. These replace the weekly hours for that day only.</p>
        <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="ff" style={{ margin: 0 }}>
            <label htmlFor={`${fid}-date`}>Date</label>
            <input id={`${fid}-date`} type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
          </div>
          <button className="btn sm ghost" disabled={!newDate || s.overrides.some(o => o.date === newDate)}
            onClick={() => { set({ overrides: [...s.overrides, { date: newDate, ranges: [] }].sort((a, b) => a.date.localeCompare(b.date)) }); setNewDate(''); }}>
            Block this day
          </button>
          <button className="btn sm ghost" disabled={!newDate || s.overrides.some(o => o.date === newDate)}
            onClick={() => { set({ overrides: [...s.overrides, { date: newDate, ranges: [{ start: '09:00', end: '13:00' }] }].sort((a, b) => a.date.localeCompare(b.date)) }); setNewDate(''); }}>
            Set hours for this day
          </button>
        </div>
        {s.overrides.length === 0 && <p className="small muted" style={{ margin: 0 }}>No dates set.</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {s.overrides.map((o, oi) => {
            const label = new Date(o.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            const setO = (ranges: Range[]) => set({ overrides: s.overrides.map((x, j) => j === oi ? { ...x, ranges } : x) });
            return (
              <div key={o.date} className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ width: 140, paddingTop: 6 }}>{label}</span>
                <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 260 }}>
                  {o.ranges.length === 0 && <span className="small muted" style={{ paddingTop: 6 }}>Unavailable all day</span>}
                  {o.ranges.map((r, i) => (
                    <RangeRow key={i} id={`${fid}-o${oi}-${i}`} r={r}
                      onChange={nr => setO(o.ranges.map((x, j) => j === i ? nr : x))}
                      onRemove={() => setO(o.ranges.filter((_, j) => j !== i))} />
                  ))}
                </div>
                <button className="btn sm ghost" onClick={() => set({ overrides: s.overrides.filter((_, j) => j !== oi) })}>Remove date</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rules */}
      <div className="card">
        <div className="card-head"><h3>Rules</h3></div>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {([
            ['durationMin', 'Call length (minutes)', 10, 240],
            ['incrementMin', 'Start times every (minutes)', 5, 120],
            ['bufferBeforeMin', 'Buffer before each call (minutes)', 0, 240],
            ['bufferAfterMin', 'Buffer after each call (minutes)', 0, 240],
            ['maxPerDay', 'Maximum calls a day (0 = no limit)', 0, 50],
            ['minNoticeHours', 'Minimum notice (hours)', 0, 720],
            ['daysAhead', 'How far ahead people can book (days)', 1, 120]
          ] as const).map(([k, label, lo, hi]) => (
            <div className="ff" key={k} style={{ margin: 0 }}>
              <label htmlFor={`${fid}-${k}`}>{label}</label>
              <input id={`${fid}-${k}`} type="number" min={lo} max={hi} value={s[k] as number}
                onChange={e => set({ [k]: Number(e.target.value) } as any)} />
            </div>
          ))}
        </div>
      </div>

      {/* Page wording */}
      <div className="card">
        <div className="card-head"><h3>The booking page</h3></div>
        <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
          <div className="ff" style={{ margin: 0 }}>
            <label htmlFor={`${fid}-title`}>Headline</label>
            <input id={`${fid}-title`} value={s.page.title} maxLength={120} onChange={e => set({ page: { ...s.page, title: e.target.value } })} />
          </div>
          <div className="ff" style={{ margin: 0 }}>
            <label htmlFor={`${fid}-intro`}>Introduction</label>
            <textarea id={`${fid}-intro`} rows={4} value={s.page.intro} maxLength={600} onChange={e => set({ page: { ...s.page, intro: e.target.value } })} />
          </div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="ff" style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <label htmlFor={`${fid}-host`}>Who they meet</label>
              <input id={`${fid}-host`} value={s.page.host} maxLength={80} onChange={e => set({ page: { ...s.page, host: e.target.value } })} />
            </div>
            <div className="ff" style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <label htmlFor={`${fid}-btn`}>Button</label>
              <input id={`${fid}-btn`} value={s.page.button} maxLength={40} onChange={e => set({ page: { ...s.page, button: e.target.value } })} />
            </div>
          </div>
        </div>
      </div>

      <div className="card tight row" data-save-bar style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 12, zIndex: 5 }}>
        <button className="btn solid" disabled={busy || !dirty || bad} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        {bad && <span className="small">Each set of hours must end after it starts.</span>}
        {dirty && !bad && <span className="small muted">Changes show on the website within a minute of saving.</span>}
      </div>
      </div>

      {/* Calls */}
      <div className="card">
        <div className="card-head"><h3>Booked calls</h3></div>
        {note && <p className="small">{note}</p>}
        {bookings.length === 0 && <p className="small muted" style={{ margin: 0 }}>No upcoming calls booked through the page.</p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {bookings.map(b => (
            <div key={b.id} className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 240 }}>
                <div><b>{b.name}</b>{b.org ? <span className="muted"> · {b.org}</span> : null}</div>
                <div className="small">{pt(b.start)}</div>
                <div className="small muted">{b.email}{b.phone ? ` · ${b.phone}` : ''}</div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {b.joinUrl && <a className="btn sm ghost" href={b.joinUrl} target="_blank" rel="noopener">Zoom</a>}
                {cancelling === b.id ? (
                  <>
                    <button className="btn sm solid" onClick={() => cancel(b, false)}>Cancel and email them</button>
                    <button className="btn sm ghost" onClick={() => cancel(b, true)}>Cancel without emailing</button>
                    <button className="btn sm ghost" onClick={() => setCancelling(null)}>Keep the call</button>
                  </>
                ) : <button className="btn sm ghost" onClick={() => setCancelling(b.id)}>Cancel call</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
