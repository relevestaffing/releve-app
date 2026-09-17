import DepositGate from '@/components/DepositGate';

/* The executive's dashboard before the deposit is in. The three screens play
   on first sign-in, so this is not the place to re-run them — it is just the
   one action that opens the search. If no search is open yet there is nothing
   to pay against, so it says the search is being set up instead. A placed
   executive never lands here. */
export default function ExecOnboarding({ deposit, stripeOn }: {
  deposit: { cents: number; status: 'due' | 'paid' | 'waived' } | null;
  stripeOn: boolean;
}) {
  if (deposit) return <DepositGate cents={deposit.cents} stripeOn={stripeOn} />;

  return (
    <div className="card">
      <div className="card-head"><h3>Open your search</h3></div>
      <p className="small muted" style={{ maxWidth: 560 }}>
        Your Client Success Manager is setting up your search now. The moment it&rsquo;s ready,
        your $500 deposit link appears right here, and paying it starts the sourcing. If
        you&rsquo;ve already arranged the deposit on your call, nothing more is needed.
      </p>
    </div>
  );
}
