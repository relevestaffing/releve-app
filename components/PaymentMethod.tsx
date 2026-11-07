'use client';
import { useState } from 'react';
import { toast } from '@/components/Toast';
import type { BillingAccount } from '@/lib/billing-public';

/* How an executive puts a bank on file.
   ------------------------------------
   One button, and Stripe's own screens do the rest — bank login, the
   micro-deposit fallback for banks that will not link, and the mandate
   wording, all of which are regulated and none of which are worth
   rebuilding here.

   The copy is deliberate about bank over card. It is not a preference: on a
   monthly retainer at this level the difference is about a hundred dollars a
   month, and an executive who understands that will choose it. */
export default function PaymentMethod({ account, ready }: {
  account: BillingAccount | null;
  ready: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const onFile = Boolean(account?.payment_method && account?.mandate_ok);

  async function start() {
    setBusy(true);
    try {
      const r = await fetch('/api/billing', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'setup' })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { toast.bad(d.error ?? 'The payment page did not open. Please try again.'); setBusy(false); return; }
      window.location.href = d.url;
    } catch {
      toast.bad('You appear to be offline. Nothing was changed.');
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h3>How you pay</h3>
        {onFile && <span className="pill good"><span className="dot" />On file</span>}
      </div>

      {onFile ? (
        <>
          <p className="small" style={{ marginBottom: 14 }}>
            {account?.method_kind === 'card'
              ? <>Card ending <b>{account?.last4}</b>{account?.bank_name ? ` · ${account.bank_name}` : ''}.</>
              : <><b>{account?.bank_name ?? 'Your bank'}</b> account ending <b>{account?.last4}</b>.</>}
            {' '}Invoices are paid from it automatically when due.
          </p>
          <p className="xs muted" style={{ marginBottom: 16, maxWidth: 620 }}>
            We keep only the last four digits. Your full details are held securely by
            Stripe, our payment processor.
          </p>
          <button className="btn sm ghost" disabled={busy} onClick={start}>
            {busy ? 'One moment…' : 'Use a different account'}
          </button>
        </>
      ) : (
        <>
          <p className="small" style={{ marginBottom: 14, maxWidth: 620 }}>
            Link a bank account once and your monthly retainer is paid automatically,
            with nothing to approve each month.
          </p>
          <p className="xs muted" style={{ marginBottom: 18, maxWidth: 620 }}>
            We recommend bank debit: card fees on a retainer this size come to roughly
            a hundred dollars a month. You can use a card if your bank will not link.
          </p>
          <button className="btn solid" disabled={busy} onClick={start}>
            {busy ? 'Opening…' : 'Set up payment'}
          </button>
        </>
      )}
    </div>
  );
}
