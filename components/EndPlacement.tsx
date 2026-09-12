'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { ENDED_REASONS, owesReplacement, type EndedReason } from '@/lib/care-public';

/* Notice and ending, on the placement file itself — the page the founder is
   on when the conversation happens. Same two actions PlacementMaker already
   has on the Placements list, same routes, so ending it here is ending it
   there. */
export default function EndPlacement({ placementId, noticeGivenOn, endedOn }: {
  placementId: string; noticeGivenOn: string | null; endedOn: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  if (endedOn) return null;

  async function notice() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/money', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'notice', placement_id: placementId })
    }), 'Notice recorded — billing runs to the end of next month');
    setBusy(false);
    if (ok) router.refresh();
  }

  async function end(reason: EndedReason) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/placements', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: placementId, reason })
    }), owesReplacement(reason)
        ? 'Ended — a replacement is now owed, and it is on the Care page'
        : 'Placement ended');
    setBusy(false); setEnding(false);
    if (ok) router.refresh();
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Notice and ending</h3>
        {noticeGivenOn && <span className="pill warn">Notice given</span>}</div>
      <p className="xs muted" style={{ marginBottom: 12, maxWidth: 560 }}>
        Notice is thirty days, effective at the end of the following billing month. Ending asks
        why, because the answer decides whether the replacement guarantee is owed.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {!noticeGivenOn && (
          <button className="btn sm ghost" disabled={busy} onClick={notice}
            title="Thirty days, ending at the close of the following billing month">Notice given</button>
        )}
        <button className="btn sm ghost" disabled={busy} onClick={() => setEnding(e => !e)}>
          {ending ? 'Cancel' : 'End placement'}
        </button>
      </div>
      {ending && (
        <div className="end-why" style={{ marginTop: 12 }}>
          <div className="xs muted" style={{ marginBottom: 8 }}>Why is it ending?</div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {ENDED_REASONS.map(r => (
              <button key={r.key} className="btn sm ghost" disabled={busy} onClick={() => end(r.key)}>
                {r.label}{r.guaranteed && ' *'}
              </button>
            ))}
          </div>
          <div className="xs muted" style={{ marginTop: 8 }}>* owes the client a free replacement</div>
        </div>
      )}
    </div>
  );
}
