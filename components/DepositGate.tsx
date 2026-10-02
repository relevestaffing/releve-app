'use client';
import { useEffect, useState } from 'react';
import { toast } from './Toast';
import { money } from '@/lib/money-public';

/* What stands between "Signature done" and "search under way".
   ---------------------------------------------------------
   One Checkout page, Stripe's, takes the deposit and keeps the payment method
   on file for the retainer later. Coming back from Stripe (?deposit=done),
   the page thanks them and stops asking, even if the bank has not reported
   back yet: asking someone to pay twice is the worst thing this card can do. */
export default function DepositGate({ cents, stripeOn = true }: { cents: number; stripeOn?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [returned, setReturned] = useState<'done' | 'cancelled' | null>(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('deposit');
      if (q === 'done' || q === 'cancelled') {
        setReturned(q);
        const url = new URL(window.location.href);
        url.searchParams.delete('deposit');
        window.history.replaceState(null, '', url.toString());
      }
    } catch { /* nothing to read */ }
  }, []);

  if (returned === 'done') return (
    <div className="card">
      <div className="card-head">
        <h3>Thank you. Your search is open.</h3>
        <span className="pill good"><span className="dot" />Received</span>
      </div>
      <p className="small" style={{ marginBottom: 12, maxWidth: 560 }}>
        Your <b>{money(cents)}</b> deposit is with Stripe. A card settles in moments; a bank transfer
        takes a few business days, and either way your Client Success Manager starts sourcing now.
      </p>
      <p className="xs muted" style={{ maxWidth: 560 }}>
        A receipt is on its way to your inbox. It is credited in full against your first month once you
        are placed.
      </p>
    </div>
  );

  /* Payments not switched on yet: the deposit is still owed and still
     gates the search; it is paid the way Relève says and marked from the
     console. */
  if (!stripeOn) return (
    <div className="card">
      <div className="card-head"><h3>Open your search</h3></div>
      <p className="small" style={{ marginBottom: 14, maxWidth: 560 }}>
        The <b>{money(cents)}</b> search deposit is what opens your search. Once it is in, your
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
      toast.bad('No connection. Nothing was changed.');
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Start your search</h3></div>
      {returned === 'cancelled' && (
        <p className="small" style={{ marginBottom: 12 }}>
          Nothing was charged. Whenever you are ready, it is one step.
        </p>
      )}
      <p className="small" style={{ marginBottom: 14, maxWidth: 560 }}>
        The <b>{money(cents)}</b> search deposit is what opens your search. Put it down and
        your Client Success Manager begins sourcing. You build your Signature next, so we can
        match you.
      </p>
      <p className="xs muted" style={{ marginBottom: 20, maxWidth: 560 }}>
        Non-refundable, and credited in full against your first month once
        you are placed. Stripe handles the payment itself, bank or card, and
        whatever you use here is also what your monthly retainer is collected
        from later, so there is no separate step to link one.
      </p>
      <button className="btn solid" disabled={busy} onClick={pay}>
        {busy ? 'Opening…' : `Pay your ${money(cents)} deposit`}
      </button>
    </div>
  );
}
