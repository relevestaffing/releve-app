'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { NOTICE_TERMS, NOTICE_REASONS, dayLabel, noticeEndsOn, todayInPacific } from '@/lib/money-public';

/* Written notice, given by the executive from their own account.
   ------------------------------------------------------------
   Two steps, because nobody ends a working relationship on a mis-click, and
   one question asked once (why), because the answer is the most useful
   thing Relève can learn. The end date is shown before they confirm and
   after, from the same rule the database applies. The state is read on
   mount from the client-safe terms view, so it is right even when the page
   around it could not see the notice. */
export default function GiveNotice({ placementId, talentName, noticeGivenOn, noticeEndsOn: endsProp, minimumEnds: minProp }: {
  placementId: string; talentName: string; noticeGivenOn: string | null;
  noticeEndsOn?: string | null; minimumEnds?: string | null;
}) {
  const router = useRouter();
  const [given, setGiven] = useState<string | null>(noticeGivenOn);
  const [ends, setEnds] = useState<string | null>(endsProp ?? null);
  const [minEnds, setMinEnds] = useState<string | null>(minProp ?? null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/billing?placement=${encodeURIComponent(placementId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!live || !d) return;
        if (d.notice_given_on) setGiven(d.notice_given_on);
        if (d.notice_ends_on) setEnds(d.notice_ends_on);
        if (d.minimum_ends) setMinEnds(d.minimum_ends);
      })
      .catch(() => { /* the props stand */ });
    return () => { live = false; };
  }, [placementId]);

  if (given) return (
    <div className="card tight">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <h3>Notice given</h3>
        <span className="pill">{dayLabel(given)}</span>
      </div>
      <p className="small" style={{ marginBottom: 8, maxWidth: 620 }}>
        Your placement with <b>{talentName}</b> runs to <b>{ends ? dayLabel(ends) : 'the end of next month'}</b>,
        and billing continues through that date. Your Client Success Manager will be in touch about a smooth
        handover.
      </p>
      <p className="xs muted" style={{ margin: 0, maxWidth: 620 }}>{NOTICE_TERMS}</p>
    </div>
  );

  const previewEnds = noticeEndsOn(todayInPacific(), minEnds);

  async function give() {
    if (!reason) { toast.bad('Choose the closest reason first. It stays between you and Relève.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/billing', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'give_notice', placement_id: placementId, reason, note })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ?? 'That did not record. Please try again.'); setBusy(false); return; }
      setGiven(d.notice_given_on ?? todayInPacific());
      setEnds(d.notice_ends_on ?? previewEnds);
      toast.saved(`Notice recorded. The placement runs to ${d.ends_on ?? dayLabel(previewEnds)}`);
      router.refresh();
    } catch { toast.bad('No connection. Nothing was recorded.'); }
    setBusy(false); setConfirming(false);
  }

  return (
    <div className="card tight">
      <div className="card-head" style={{ marginBottom: 8 }}><h3>Ending the placement</h3></div>
      {!confirming ? (
        <>
          <p className="small muted" style={{ marginBottom: 8, maxWidth: 620 }}>{NOTICE_TERMS}</p>
          <p className="small muted" style={{ marginBottom: 12, maxWidth: 620 }}>
            If something is not working, talk to your Client Success Manager first. A replacement is often the
            better answer, and it is covered.
          </p>
          <button className="btn sm ghost" onClick={() => setConfirming(true)}>Give notice</button>
        </>
      ) : (
        <>
          <p className="small" style={{ marginBottom: 12, maxWidth: 620 }}>
            You are giving notice on your placement with <b>{talentName}</b>. Given today, it runs to{' '}
            <b>{dayLabel(previewEnds)}</b> and is billed through that date.
          </p>
          <div className="ff" style={{ maxWidth: 420 }}>
            <label htmlFor="notice-reason">What is the main reason?</label>
            <select id="notice-reason" value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">Choose one…</option>
              {NOTICE_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          {reason === 'fit' && (
            <p className="xs muted" style={{ margin: '-6px 0 12px', maxWidth: 560 }}>
              A replacement is covered by your guarantee and keeps everything you have built. Your Client Success
              Manager can set one in motion today instead, if you would prefer.
            </p>
          )}
          <div className="ff" style={{ maxWidth: 560 }}>
            <label htmlFor="notice-note">Anything you would like us to know <span className="muted">(optional)</span></label>
            <textarea id="notice-note" rows={3} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm solid" disabled={busy} onClick={give}>{busy ? 'Recording…' : 'Yes, give notice'}</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => setConfirming(false)}>Not now</button>
          </div>
          <p className="xs muted" style={{ marginTop: 12, maxWidth: 620 }}>{NOTICE_TERMS}</p>
        </>
      )}
    </div>
  );
}
