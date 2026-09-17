'use client';
import { useState } from 'react';
import { toast } from './Toast';
import { money } from '@/lib/money-public';

/* What stands between "Signature done" and "search under way".
   ---------------------------------------------------------
   Relève opens the search after the discovery call; the executive still has
   to put the $500 down before anyone starts working it. One Checkout page —
   Stripe's, not ours — takes the deposit and keeps the payment method on
   file for the retainer later, so this is the only screen that asks. */
export default function DepositGate({ cents, stripeOn = true }: { cents: number; stripeOn?: boolean }) {
  const [busy, setBusy] = useState(false);

  /* Payments not switched on yet: the deposit is still owed and still
     gates the search — it just gets paid the way Relève says, and marked
     from the console. Without this the ask disappeared entirely. */
  if (!stripeOn) return (
    <div className="card">
      <div className="card-head"><h3>Open your search</h3></div>
      <p className="small" style={{ marginBottom: 14, maxWidth: 560 }}>
        The <b>{money(cents)}</b> search deposit is what opens your search — once it is in, your
        Client Success Manager begins sourcing, and you build your Signature next so we can
        match you.
      </p>
      <p className="xs muted" style={{ marginBottom: 20, maxWidth: 560 }}>
        Non-refundable, and credited in full against your first month once you are placed.
        Your Client Success Manager sends the payment details directly; this page updates the
        moment the deposit is recorded. If you have already paid, nothing more is needed.
      </p>
      <a className="btn solid" href="/app/messages">Ask for the payment details</a>
    </div>
  );

  async function pay() {
    setBusy(true);
    try {
      const r = await fetch('/api/billing', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'deposit' })
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
    <div className="card">
      <div className="card-head"><h3>Start your search</h3></div>
      <p className="small" style={{ marginBottom: 14, maxWidth: 560 }}>
        The <b>{money(cents)}</b> search deposit is what opens your search — put it down and
        your Client Success Manager begins sourcing. You build your Signature next, so we can
        match you.
      </p>
      <p className="xs muted" style={{ marginBottom: 20, maxWidth: 560 }}>
        Non-refundable, and credited in full against your first month once
        you are placed. Stripe handles the payment itself — bank or card —
        and whatever you use here is also what your monthly retainer is
        collected from later, so there is no separate step to link one.
      </p>
      <button className="btn solid" disabled={busy} onClick={pay}>
        {busy ? 'Opening…' : `Pay your ${money(cents)} deposit`}
      </button>
    </div>
  );
}
