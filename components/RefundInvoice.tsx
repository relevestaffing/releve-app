'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { money, toCents } from '@/lib/money-public';

/* A refund, by the owner only (the route checks again). Asks how much, and
   once more before Stripe is told. Stripe does the moving; the invoice shows
   it as refunded when Stripe confirms. */
export default function RefundInvoice({ invoiceId, cents }: { invoiceId: string; cents: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((cents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  if (cents <= 0) return <span className="xs muted">Refunded</span>;

  async function refund() {
    const c = toCents(amount);
    if (c == null || c <= 0 || c > cents) { toast.bad(`A refund here can be up to ${money(cents, true)}.`); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/money', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'refund', id: invoiceId, cents: c })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) toast.bad(d.error ?? 'Stripe did not accept that refund.');
      else { toast.saved(`Refund of ${money(c, true)} sent to Stripe. It shows here once confirmed`); setOpen(false); router.refresh(); }
    } catch { toast.bad('No connection. Nothing was refunded.'); }
    setBusy(false);
  }

  if (!open) return <button className="btn sm ghost" onClick={() => setOpen(true)}>Refund</button>;
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span className="ff" style={{ margin: 0, width: 110 }}>
        <input aria-label="Refund amount in US dollars" value={amount} inputMode="decimal" disabled={busy}
          onChange={e => setAmount(e.target.value)} />
      </span>
      <button className="btn sm solid danger" disabled={busy} onClick={refund}>{busy ? 'Refunding…' : 'Yes, refund'}</button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
