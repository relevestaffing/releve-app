import { redirect } from 'next/navigation';
import { verifyDepositLink } from '@/lib/deposit-link';
import { startDepositPaymentForSearch } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/* Where the onboarding email's deposit button actually lands.
   ------------------------------------------------------------
   No session to read — this is routinely the first thing a discovery-call
   lead ever clicks from Relève, before they have ever signed in. The token
   is the only credential it has, and it is enough: it names one search and
   nothing else, the same way any other one-purpose link would.

   The happy path never renders — a valid, still-due link sends the person
   straight on to Stripe. Only a link that cannot be honoured stops here to
   say which of the small number of reasons that is. */
export default async function PayDeposit({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyDepositLink(token);

  let message = 'This link is not valid — check that you copied the whole thing from the email.';
  if (verified) {
    try {
      const url = await startDepositPaymentForSearch(verified.searchId);
      redirect(url);
    } catch (e: any) {
      /* redirect() throws internally to unwind the render — never treat
         that as "the payment failed" and swallow the navigation. */
      if (e?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
      message = e?.message === 'That deposit is already settled.'
        ? 'This deposit is already settled — nothing more to do here.'
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
          <div className="eyebrow" style={{ marginBottom: 10 }}>Search deposit</div>
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
