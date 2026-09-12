import { redirect } from 'next/navigation';
import { verifyInvoiceLink } from '@/lib/invoice-link';
import { startInvoicePaymentForInvoice } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/* Where the invoice email's "pay now" button lands. The same shape as
   app/pay/[token]/page.tsx for the deposit: no session to read, the token is
   the only credential it has, and the happy path never renders — a valid,
   still-due link sends the person straight on to Stripe. Only a link that
   cannot be honoured stops here to say which of the small number of reasons
   that is. */
export default async function PayInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyInvoiceLink(token);

  let message = 'This link is not valid — check that you copied the whole thing from the email.';
  if (verified) {
    try {
      const url = await startInvoicePaymentForInvoice(verified.invoiceId);
      redirect(url);
    } catch (e: any) {
      if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
      message = e?.message === 'That invoice is already settled.'
        ? 'This invoice is already settled — nothing more to do here.'
        : 'This link has expired. Ask your Client Success Manager to send a fresh one.';
    }
  } else {
    message = 'This link has expired. Ask your Client Success Manager to send a fresh one.';
  }

  return (
    <div className="auth">
      <div>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Invoice payment</div>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>That link didn't work</h2>
          <p className="note">{message}</p>
          <a className="btn ghost sm" style={{ marginTop: 22, display: 'inline-block' }} href="/">
            Go to Relève
          </a>
        </div>
      </div>
    </div>
  );
}
