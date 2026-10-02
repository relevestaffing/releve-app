export const dynamic = 'force-dynamic';

/* Where Stripe sends someone after paying the deposit from the onboarding
   email, before they have an account. Their part is done; the rest is
   ours, and their account is the next step. */
export default async function DepositDone({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { cancelled } = await searchParams;
  return (
    <div className="auth">
      <div>
        <img className="auth-logo" src="/logo-fern.png" alt="Relève Executive Staffing" />
        <div className="auth-card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Search deposit</div>
          {cancelled ? (
            <>
              <h2 style={{ fontSize: 24, marginBottom: 12 }}>Nothing was charged</h2>
              <p className="note">Your deposit link still works whenever you are ready. It is in your onboarding email.</p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 24, marginBottom: 12 }}>Thank you. Your search is open.</h2>
              <p className="note" style={{ marginBottom: 10 }}>
                Your deposit is with Stripe. A card settles in moments; a bank transfer takes a few business
                days. Either way, your Client Success Manager begins sourcing now.
              </p>
              <p className="xs muted">
                Next, set up your Relève account with the same email address. Your deposit and payment method are
                already attached to it.
              </p>
            </>
          )}
          <a className="btn solid sm" style={{ marginTop: 20, display: 'inline-block' }} href="/">
            {cancelled ? 'Go to Relève' : 'Set up your account'}
          </a>
        </div>
      </div>
    </div>
  );
}
