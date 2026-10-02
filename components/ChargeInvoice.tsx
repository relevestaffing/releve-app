'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';

/* Taking the money for one invoice.
   --------------------------------
   This button submits a charge. It never marks anything paid, and the copy
   is careful not to imply otherwise: with bank debit the money is days away
   even when everything goes right, and Stripe's webhook is the only thing
   that gets to say it arrived.

   A failure shows Stripe's own wording rather than a paraphrase, because
   "insufficient funds" and "the account was closed" need completely
   different actions from you. */
export default function ChargeInvoice({ invoiceId, amount, who, method }: {
  invoiceId: string;
  amount: string;
  who: string;
  method: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!method) return (
    <span className="xs muted">No payment method on file</span>
  );

  async function charge() {
    setBusy(true);
    try {
      const r = await fetch('/api/billing', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'charge', invoice_id: invoiceId })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) toast.bad(d.error ?? 'That did not go through.');
      else toast.saved(`Submitted: ${amount} from ${who}. It shows as paid once it clears.`);
      router.refresh();
    } catch { toast.bad('No connection. Nothing was charged.'); }
    setBusy(false); setConfirming(false);
  }

  /* Money leaving somebody's account is not a one-tap action. The confirm
     states the amount and the account, because those are the two things you
     would want to have checked afterwards. */
  if (confirming) return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span className="xs">{amount} from {method}?</span>
      <button className="btn sm solid" disabled={busy} onClick={charge}>
        {busy ? 'Submitting…' : 'Yes, charge it'}
      </button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  );

  return (
    <button className="btn sm solid" onClick={() => setConfirming(true)}>Charge {amount}</button>
  );
}
