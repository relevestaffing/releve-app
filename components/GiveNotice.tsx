'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';

/* Thirty days' written notice, given by the executive from their own account.
   ----------------------------------------------------------------------------
   The terms promise it, the billing page quotes it, and until now only the
   console could record it. Effective at the end of the following billing
   month, which is the boundary the retainers already run on. Deliberately a
   two-step: nobody ends a working relationship on a mis-click. */
export default function GiveNotice({ placementId, talentName, noticeGivenOn }: {
  placementId: string; talentName: string; noticeGivenOn: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (noticeGivenOn) return (
    <div className="card tight">
      <p className="small" style={{ margin: 0 }}>
        <b>Notice given {new Date(noticeGivenOn + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}.</b>{' '}
        The placement runs to the end of next month, and billing stops there. Your Client Success
        Manager will be in touch about the handover.
      </p>
    </div>
  );

  async function give() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/care', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'give_notice', placement_id: placementId })
    }), 'Notice recorded — we will be in touch about the handover');
    setBusy(false); setConfirming(false);
    if (ok) router.refresh();
  }

  return (
    <div className="card tight">
      <div className="card-head" style={{ marginBottom: 8 }}><h3>Ending the placement</h3></div>
      {!confirming ? (
        <>
          <p className="small muted" style={{ marginBottom: 12, maxWidth: 620 }}>
            Either side can end this with thirty days' written notice, effective at the end of the
            following month. If something is not working, talk to your Client Success Manager
            first — a replacement is often the better answer, and it is covered.
          </p>
          <button className="btn sm ghost" onClick={() => setConfirming(true)}>Give notice</button>
        </>
      ) : (
        <>
          <p className="small" style={{ marginBottom: 12, maxWidth: 620 }}>
            You are giving thirty days' notice on your placement with <b>{talentName}</b>. It runs to
            the end of next month and is billed to then, as the terms say. This is recorded and
            your Client Success Manager is told straight away.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm solid" disabled={busy} onClick={give}>{busy ? 'Recording…' : 'Yes, give notice'}</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => setConfirming(false)}>Not now</button>
          </div>
        </>
      )}
    </div>
  );
}
