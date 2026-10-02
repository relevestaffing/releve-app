import { verifyDepositLink } from '@/lib/deposit-link';
import { depositLinkSummary } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { money } from '@/lib/money-public';

export const dynamic = 'force-dynamic';

/* Where the onboarding email's deposit button lands.
   ------------------------------------------------
   No session: often the first thing a new client ever clicks from Relève.
   The token names one search and nothing else. Opening this page creates
   nothing at Stripe (mail scanners open links too); the button below does,
   by posting to ./go, which sends the person on to the payment page. */
const ERRORS: Record<string, string> = {
  settled: 'This deposit is already settled. Nothing more to do here.',
  stripe: 'Card and bank payment is not switched on yet. Your Client Success Manager will take this deposit directly. Nothing is wrong with your link.',
  failed: 'The payment page did not open. Please try once more, or reply to your onboarding email and we will help.'
};

export default async function PayDeposit({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }>;
}) {
  const { token } = await params;
  const { e } = await searchParams;
  const verified = verifyDepositLink(token);
  const summary = verified ? await depositLinkSummary(verified.searchId) : null;

  let heading = 'Your search deposit';
  let message: string | null = null;
  let canPay = false;
  if (!verified) {
    heading = 'That link has expired';
    message = 'Ask your Client Success Manager to send a fresh one. It takes a minute.';
  } else if (!summary?.ok) {
    heading = summary?.settled ? 'Already settled' : 'That link has expired';
    message = summary?.settled ? ERRORS.settled : 'Ask your Client Success Manager to send a fresh one. It takes a minute.';
  } else if (!stripeReady()) {
    message = ERRORS.stripe;
  } else {
    canPay = true;
    if (e && ERRORS[e]) message = ERRORS[e];
  }

  return (
    <div className="auth">
      <div>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Search deposit</div>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>{heading}</h2>
          {canPay && summary && (
            <>
              <p className="note" style={{ marginBottom: 6 }}>
                <b>{money(summary.cents)}</b>{summary.who ? <> for {summary.who}</> : null}. This opens your search.
              </p>
              <p className="xs muted" style={{ marginBottom: 20 }}>
                Non-refundable, and credited in full against your first month once you are placed. By bank or card,
                on Stripe&rsquo;s secure page.
              </p>
            </>
          )}
          {message && <p className="note" style={{ marginBottom: 16 }}>{message}</p>}
          {canPay ? (
            <form method="post" action={`/pay/${encodeURIComponent(token)}/go`}>
              <button className="btn solid" type="submit">Continue to secure payment</button>
            </form>
          ) : (
            <a className="btn ghost sm" style={{ marginTop: 10, display: 'inline-block' }} href="/">Go to Relève</a>
          )}
        </div>
      </div>
    </div>
  );
}
