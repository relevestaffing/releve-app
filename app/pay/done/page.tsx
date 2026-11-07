export const dynamic = 'force-dynamic';

export const metadata = { title: 'Payment received' };

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
          <div className="eyebrow" style={{ marginBottom: 10 }}>{cancelled ? 'Search deposit' : 'Step 3 of 4'}</div>
          {cancelled ? (
            <>
              <h2 style={{ fontSize: 24, marginBottom: 12 }}>Nothing was charged</h2>
              <p className="note">Your deposit link still works whenever you are ready. It is in your onboarding email.</p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 24, marginBottom: 12 }}>Your search is open.</h2>
              <p className="note" style={{ marginBottom: 10 }}>
                Thank you for your deposit. A card payment settles in moments and a bank transfer in a few
                business days. Sourcing begins now.
              </p>
              <p className="xs muted">
                Next, open your Relève account with this same email address. Your deposit is already linked to it.
              </p>
            </>
          )}
          <a className="btn solid sm" style={{ marginTop: 20, display: 'inline-block' }} href="/">
            Open your account
          </a>
        </div>
      </div>
    </div>
  );
}
