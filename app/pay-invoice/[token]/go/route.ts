import { NextResponse } from 'next/server';
import { verifyInvoiceLink } from '@/lib/invoice-link';
import { startInvoicePaymentForInvoice } from '@/lib/billing';
import { SITE } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/* The invoice pay link's button. Only a deliberate POST creates the Stripe
   session, then sends the browser straight to it. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (code: string) =>
    NextResponse.redirect(`${SITE}/pay-invoice/${encodeURIComponent(token)}?e=${code}`, 303);
  const verified = verifyInvoiceLink(token);
  if (!verified) return back('failed');
  try {
    const url = await startInvoicePaymentForInvoice(verified.invoiceId);
    return NextResponse.redirect(url, 303);
  } catch (e: any) {
    const m = String(e?.message ?? '');
    if (m === 'That invoice is already settled.') return back('settled');
    console.error('[pay-invoice] checkout did not open', m);
    return back('failed');
  }
}
