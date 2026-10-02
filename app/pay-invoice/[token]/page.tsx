import { verifyInvoiceLink } from '@/lib/invoice-link';
import { invoiceLinkSummary } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { money } from '@/lib/money-public';

export const dynamic = 'force-dynamic';

/* Where the invoice email's pay button lands. The same shape as the deposit
   link: no session, the token names one invoice, and nothing is created at
   Stripe until the button below is pressed (B24). */
const ERRORS: Record<string, string> = {
  settled: 'This invoice is already settled. Nothing more to do here.',
  failed: 'The payment page did not open. Please try once more, or reply to the invoice email and we will help.',
  busy: 'This invoice is being collected right now. Give it half an hour, or check your billing page.'
};

export default async function PayInvoicePage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }>;
}) {
  const { token } = await params;
  const { e } = await searchParams;
  const verified = verifyInvoiceLink(token);
  const summary = verified ? await invoiceLinkSummary(verified.invoiceId) : null;

  let heading = 'Pay your invoice';
  let message: string | null = null;
  let canPay = false;
  if (!verified || !summary || (!summary.ok && !summary.settled)) {
    heading = 'That link has expired';
    message = 'The invoice is always in your account under Billing, or ask your Client Success Manager for a fresh link.';
  } else if (summary.settled) {
    heading = 'Already settled';
    message = ERRORS.settled;
  } else if (!stripeReady()) {
    message = 'Card and bank payment is not switched on yet. Your Client Success Manager will arrange this directly.';
  } else {
    canPay = true;
    if (e && ERRORS[e]) message = ERRORS[e];
  }

  return (
    <div className="auth">
      <div>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Invoice{summary?.number ? ` ${summary.number}` : ''}</div>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>{heading}</h2>
          {canPay && summary && (
            <>
              <p className="note" style={{ marginBottom: 6 }}>
                <b>{money(summary.cents, true)}</b>{summary.who ? <> for {summary.who}</> : null}
                {summary.kind === 'deposit' ? ', search deposit' : ', monthly retainer'}. Due on receipt.
              </p>
              <p className="xs muted" style={{ marginBottom: 20 }}>By bank or card, on Stripe&rsquo;s secure page.</p>
            </>
          )}
          {message && <p className="note" style={{ marginBottom: 16 }}>{message}</p>}
          {canPay ? (
            <form method="post" action={`/pay-invoice/${encodeURIComponent(token)}/go`}>
              <button className="btn solid" type="submit">Continue to secure payment</button>
            </form>
          ) : (
            <a className="btn ghost sm" style={{ marginTop: 10, display: 'inline-block' }} href="/app/billing">Open Billing</a>
          )}
        </div>
      </div>
    </div>
  );
}
