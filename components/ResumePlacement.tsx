'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';

/* Lifting a pause before the invoice clears: the team's judgement, for when
   a payment is promised and trusted. Both sides are told it has resumed. */
export default function ResumePlacement({ placementId }: { placementId: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/money', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'resume_placement', placement_id: placementId })
    }), 'Resumed. Both sides have been told');
    setBusy(false); setAsk(false);
    if (ok) router.refresh();
  }
  if (!ask) return <button className="btn sm ghost" onClick={() => setAsk(true)}>Resume now</button>;
  return (
    <span className="rate-set">
      <span className="xs">Resume before the invoice is paid?</span>
      <button className="btn sm solid" disabled={busy} onClick={go}>Yes, resume</button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setAsk(false)}>Cancel</button>
    </span>
  );
}
