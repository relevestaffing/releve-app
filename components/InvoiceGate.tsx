'use client';
import { useState } from 'react';
import { toast } from './Toast';
import { money } from '@/lib/money-public';
import { CONTACT_EMAIL } from '@/lib/experience-public';
import { firstName } from '@/lib/words';

/* The fourteen-day line. Before it, an open or failed invoice is a banner
   (BillingBanner); at it, the placement pauses under the terms and this page
   stands in front of the account, with the one action that resumes it.
   Messages and Billing stay open through it (Shell). */
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
      toast.bad('No connection. Nothing was changed.');
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img className="logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="welcome-card">
          <h1>{name?.trim() ? `One step, ${firstName(name)}` : 'One step'}</h1>
          <p className="lede">
            Invoice {number ?? 'on file'} has been open for fourteen days, so your placement is paused for now.
          </p>
          <p className="small muted" style={{ marginTop: 4, marginBottom: 24, maxWidth: 480 }}>
            {failed
              ? 'The last attempt did not go through. Pay it below by card, or by a different bank account, and everything resumes the same day.'
              : `${money(cents)}, by bank or card. Everything resumes the same day it is settled.`}
          </p>
          <button className="btn solid" disabled={busy} onClick={pay}>
            {busy ? 'Opening…' : `Pay ${money(cents)}`}
          </button>
          <p className="xs muted" style={{ marginTop: 16 }}>
            Something not right about this invoice? <a href="/app/messages" style={{ textDecoration: 'underline' }}>Write to your Client Success Manager</a>{' '}
            rather than paying it. We would rather fix it now.
            The invoice itself is on <a href="/app/billing" style={{ textDecoration: 'underline' }}>your billing page</a>.
          </p>

          {/* A full-screen gate still needs a way out and a way to a person. */}
          <div className="gate-foot">
            <a className="gate-link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('A question about my invoice')}`}>
              Write to us
            </a>
            <form action="/api/signout" method="post">
              <button className="gate-link" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
