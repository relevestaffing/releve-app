'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { TIME_OFF_STATE, nights, type TimeOff } from '@/lib/care-public';

function label(iso: string) {
  return new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function TimeOffForm({ placementId, existing }: {
  placementId: string; existing: TimeOff[];
}) {
  const fid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);

  const bad = from && to && to < from;

  async function submit() {
    if (!from || !to || bad) return;
    setBusy(true);
    const ok = await saving(() => fetch('/api/care', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'time_off_request', placement_id: placementId,
        starts_on: from, ends_on: to, reason: why
      })
    }), 'Asked for. Relève will come back to you');
    setBusy(false);
    if (ok) { setOpen(false); setFrom(''); setTo(''); setWhy(''); router.refresh(); }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Time off</h3>
        {!open && <button className="btn sm solid" onClick={() => setOpen(true)}>Ask for time off</button>}
      </div>

      {open && (
        <div style={{ marginBottom: 22 }}>
          <p className="small muted" style={{ marginBottom: 16 }}>
            Ask as far ahead as you can. Relève arranges cover with your executive,
            so nobody is caught out on the morning.
          </p>
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="ff"><label htmlFor={`${fid}-1`}>First day away</label>
              <input id={`${fid}-1`} type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div className="ff"><label htmlFor={`${fid}-2`}>Last day away</label>
              <input id={`${fid}-2`} type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          </div>
          {bad && <div className="err">The last day cannot be before the first.</div>}
          {from && to && !bad &&
            <p className="xs muted">{nights(from, to)} day{nights(from, to) === 1 ? '' : 's'}.</p>}
          <div className="ff"><label htmlFor={`${fid}-3`}>Anything Relève should know (optional)</label>
            <input id={`${fid}-3`} value={why} onChange={e => setWhy(e.target.value)}
              placeholder="Family wedding, booked a while ago" /></div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn sm solid" disabled={!from || !to || !!bad || busy} onClick={submit}>
              {busy ? 'Sending…' : 'Send the request'}
            </button>
            <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!existing.length ? (
        <p className="small muted">Nothing booked.</p>
      ) : existing.map(t => {
        const s = TIME_OFF_STATE.find(x => x.key === t.state);
        return (
          <div key={t.id} className="row between" style={{ padding: '11px 0', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <b className="small">{label(t.starts_on)} – {label(t.ends_on)}</b>
              <div className="xs muted">{nights(t.starts_on, t.ends_on)} days{t.reason ? ` · ${t.reason}` : ''}</div>
              {t.cover_note && <div className="xs muted">Cover: {t.cover_note}</div>}
            </div>
            <span className={`pill ${s?.tone ?? ''}`}>{s?.label ?? t.state}</span>
          </div>
        );
      })}
    </div>
  );
}
