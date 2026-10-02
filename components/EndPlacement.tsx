'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from './Toast';
import { ENDED_REASONS, owesReplacement, type EndedReason } from '@/lib/care-public';
import {
  NOTICE_TERMS, NOTICE_REASONS, addDaysISO, dayLabel, noticeEndsOn, noticeReasonLabel, todayInPacific
} from '@/lib/money-public';

/* Notice and ending, on the placement file itself. Every action here asks
   once before it happens and says what it will do to billing, because both
   are hard to walk back once the client has been told (X12). */
export default function EndPlacement({
  placementId, noticeGivenOn, endedOn, noticeEndsOn: endsOn, noticeReason, minimumEnds, startedOn
}: {
  placementId: string; noticeGivenOn: string | null; endedOn: string | null;
  noticeEndsOn?: string | null; noticeReason?: string | null; minimumEnds?: string | null; startedOn?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'idle' | 'notice' | 'withdraw' | 'end'>('idle');
  const [on, setOn] = useState(todayInPacific());
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [tellClient, setTellClient] = useState(true);
  const [endReason, setEndReason] = useState<EndedReason | null>(null);
  if (endedOn) return null;

  const preview = noticeEndsOn(on || todayInPacific(), minimumEnds ?? null);

  async function notice() {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/money', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'notice', placement_id: placementId, on, reason: reason || null, note, tell_client: tellClient })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) toast.bad(d.error ?? 'That did not record.');
      else { toast.saved(`Notice recorded. Runs and bills to ${d.ends_on ?? dayLabel(preview)}`); setMode('idle'); router.refresh(); }
    } catch { toast.bad('No connection. Nothing was recorded.'); }
    setBusy(false);
  }

  async function withdraw() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/money', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'withdraw_notice', placement_id: placementId })
    }), 'Notice withdrawn. The placement continues month to month');
    setBusy(false); setMode('idle');
    if (ok) router.refresh();
  }

  async function end(r: EndedReason) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/placements', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: placementId, reason: r })
    }), owesReplacement(r)
        ? 'Ended. A replacement is now owed, and it is on the Placements page'
        : 'Placement ended');
    setBusy(false); setMode('idle'); setEndReason(null);
    if (ok) router.refresh();
  }

  return (
    <div className="card" id="notice">
      <div className="card-head"><h3>Notice and ending</h3>
        {noticeGivenOn && <span className="pill warn">Notice given</span>}</div>

      {noticeGivenOn ? (
        <p className="small" style={{ marginBottom: 8, maxWidth: 620 }}>
          Notice given <b>{dayLabel(noticeGivenOn)}</b>. The placement runs and is billed to{' '}
          <b>{endsOn ? dayLabel(endsOn) : 'the end of the following month'}</b>, then ends on its own.
          {noticeReason ? <> Reason: {noticeReasonLabel(noticeReason)}.</> : null}
        </p>
      ) : (
        <p className="xs muted" style={{ marginBottom: 8, maxWidth: 620 }}>{NOTICE_TERMS}</p>
      )}
      {minimumEnds && (
        <p className="xs muted" style={{ marginBottom: 12 }}>
          Minimum term runs through {dayLabel(addDaysISO(minimumEnds, -1))}.
        </p>
      )}

      {mode === 'idle' && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {!noticeGivenOn && <button className="btn sm ghost" disabled={busy} onClick={() => setMode('notice')}>Record notice</button>}
          {noticeGivenOn && <button className="btn sm ghost" disabled={busy} onClick={() => setMode('withdraw')}>Withdraw notice</button>}
          <button className="btn sm ghost" disabled={busy} onClick={() => setMode('end')}>End placement now</button>
        </div>
      )}

      {mode === 'notice' && (
        <div style={{ marginTop: 8 }}>
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="ff"><label htmlFor="n-on">Date the written notice arrived</label>
              <input id="n-on" type="date" value={on} max={todayInPacific()} min={startedOn ?? undefined}
                onChange={e => setOn(e.target.value)} /></div>
            <div className="ff"><label htmlFor="n-why">Their reason</label>
              <select id="n-why" value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">Not given</option>
                {NOTICE_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select></div>
          </div>
          <div className="ff"><label htmlFor="n-note">In their words <span className="muted">(optional)</span></label>
            <textarea id="n-note" rows={2} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></div>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input type="checkbox" checked={tellClient} onChange={e => setTellClient(e.target.checked)} />
            Email the executive a confirmation
          </label>
          <p className="small" style={{ marginBottom: 12 }}>
            Recorded on {dayLabel(on)}, the placement runs and is billed to <b>{dayLabel(preview)}</b>.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm solid" disabled={busy || !on} onClick={notice}>{busy ? 'Recording…' : 'Yes, record notice'}</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => setMode('idle')}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'withdraw' && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="small">Withdraw the notice? Billing continues month to month.</span>
          <button className="btn sm solid" disabled={busy} onClick={withdraw}>Yes, withdraw</button>
          <button className="btn sm ghost" disabled={busy} onClick={() => setMode('idle')}>Cancel</button>
        </div>
      )}

      {mode === 'end' && (
        <div className="end-why" style={{ marginTop: 12 }}>
          {!endReason ? (
            <>
              <div className="xs muted" style={{ marginBottom: 8 }}>Why is it ending? The answer decides what is still billed.</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {ENDED_REASONS.map(r => (
                  <button key={r.key} className="btn sm ghost" disabled={busy} onClick={() => setEndReason(r.key)}>
                    {r.label}{r.guaranteed && ' *'}
                  </button>
                ))}
                <button className="btn sm ghost" disabled={busy} onClick={() => setMode('idle')}>Cancel</button>
              </div>
              <div className="xs muted" style={{ marginTop: 8 }}>* owes the client a free replacement</div>
            </>
          ) : (
            <>
              <p className="small" style={{ marginBottom: 10, maxWidth: 620 }}>
                End it today, {dayLabel(todayInPacific())}, as <b>{ENDED_REASONS.find(r => r.key === endReason)?.label}</b>?{' '}
                {owesReplacement(endReason)
                  ? 'Billing stops today, and the replacement carries the rest of the minimum term.'
                  : 'The minimum term and any notice period are still billed, as the terms set out.'}{' '}
                Both sides are emailed.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn sm solid danger" disabled={busy} onClick={() => end(endReason)}>{busy ? 'Ending…' : 'Yes, end it'}</button>
                <button className="btn sm ghost" disabled={busy} onClick={() => setEndReason(null)}>Back</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
