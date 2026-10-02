'use client';
import { useState } from 'react';
import { toast } from './Toast';

/* The on-session pay action for one invoice — the same /api/billing
   pay_invoice call InvoiceGate uses when an unpaid invoice blocks the whole
   app, pulled out into a small reusable button so any open invoice can be
   paid directly from wherever it's shown, not only from the hard gate. */
export default function PayInvoiceButton({ invoiceId, label, className }: {
  invoiceId: string; label?: string; className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      const r = await fetch('/api/billing', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'pay_invoice', invoice_id: invoiceId })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { toast.bad(d.error ?? 'That did not open. Please try again.'); setBusy(false); return; }
      window.location.href = d.url;
    } catch {
      toast.bad('No connection. Nothing was changed.');
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className ?? 'btn sm solid'} disabled={busy} onClick={pay}>
      {busy ? 'Opening…' : (label ?? 'Pay now')}
    </button>
  );
}
