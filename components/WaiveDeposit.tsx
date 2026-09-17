'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { money } from '@/lib/money-public';

/* Waive the search deposit from the executive's own row — the deliberate,
   labelled version of the Due/Paid/Waived dropdown that lives on the Money
   page. Waiving settles the deposit without payment, which opens their search
   and moves them straight on, exactly as paying would. Two clicks, so it is
   never a mis-click. Owner/admin only: the API and the database both check. */
export default function WaiveDeposit({ searchId, cents, status }: {
  searchId: string; cents: number; status: 'due' | 'paid' | 'waived';
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === 'waived') return <span className="pill" style={{ opacity: .8 }}>Deposit waived</span>;
  if (status === 'paid') return <span className="pill good"><span className="dot" />Deposit paid</span>;

  async function waive() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/money', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'deposit_status', search_id: searchId, status: 'waived' })
    }), `${money(cents)} deposit waived — their search is open`);
    setBusy(false);
    if (ok) { setArmed(false); router.refresh(); }
  }

  if (!armed) return (
    <button className="btn sm ghost" onClick={() => setArmed(true)}>
      Waive the {money(cents)} deposit
    </button>
  );

  return (
    <span className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="xs muted">Open their search without the {money(cents)}?</span>
      <button className="btn sm solid" disabled={busy} onClick={waive}>
        {busy ? 'Waiving…' : 'Yes, waive it'}
      </button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}
