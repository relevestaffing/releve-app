import { NextResponse } from 'next/server';
import { verifyDepositLink } from '@/lib/deposit-link';
import { startDepositPaymentForSearch } from '@/lib/billing';
import { SITE } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/* The deposit pay link's button. Only a deliberate POST creates the Stripe
   session, then sends the browser straight to it. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (code: string) =>
    NextResponse.redirect(`${SITE}/pay/${encodeURIComponent(token)}?e=${code}`, 303);
  const verified = verifyDepositLink(token);
  if (!verified) return back('failed');
  try {
    const url = await startDepositPaymentForSearch(verified.searchId);
    return NextResponse.redirect(url, 303);
  } catch (e: any) {
    const m = String(e?.message ?? '');
    if (m === 'That deposit is already settled.') return back('settled');
    if (m.includes('Stripe is not configured')) return back('stripe');
    console.error('[pay] deposit checkout did not open', m);
    return back('failed');
  }
}
