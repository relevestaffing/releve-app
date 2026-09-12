'use client';
import { useState } from 'react';
import { toast } from './Toast';
import { money } from '@/lib/money-public';

/* What stands in front of everything else once something asked-for sits
   unpaid — the same full-page pattern as TermsGate, for the same reason: an
   invoice nobody had to look at is not much of an invoice. Mounted in Shell
   itself, so it holds no matter which page under /app a client lands on or
   links to directly, not only the dashboard. */
export default function InvoiceGate({ invoiceId, cents, number, failed, name }: {
  invoiceId: string; cents: number; number: string | null; failed: boolean; name?: string | null;
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
      toast.bad('No connection — nothing was changed.');
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img className="logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="welcome-card">
          <h1>{name ? `One moment, ${name.split(' ')[0]}` : 'One moment'}</h1>
          <p className="lede">
            {failed
              ? <>The last attempt on invoice {number ?? 'on file'} did not clear.</>
              : <>Invoice {number ?? 'on file'} is due before anything else here.</>}
          </p>
          <p className="small muted" style={{ marginTop: 4, marginBottom: 24, maxWidth: 480 }}>
            {failed
              ? 'Pay it directly below — a card, or a different bank if the first one was the problem. Everything else opens again the moment it clears.'
              : `${money(cents)}, due now. Pay it directly below and everything else opens again the moment it clears — no separate sign-in step.`}
          </p>
          <button className="btn solid" disabled={busy} onClick={pay}>
            {busy ? 'Opening…' : `Pay ${money(cents)} now`}
          </button>
          <p className="xs muted" style={{ marginTop: 16 }}>
            Something not right about this invoice? <a href="/app/messages" style={{ textDecoration: 'underline' }}>Write to your Client Success Manager</a>{' '}
            rather than paying it — we would rather fix it than have you chase us afterwards.
            The invoice itself is on <a href="/app/billing" style={{ textDecoration: 'underline' }}>your billing page</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
