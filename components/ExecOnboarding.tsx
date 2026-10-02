import DepositGate from '@/components/DepositGate';
import { money } from '@/lib/money-public';

/* The executive's dashboard before the deposit is in. One action opens the
   search; if no search is open yet, it says what happens next and when. A
   deposit already paid by bank shows as clearing, never as asked for again.
   A placed executive never lands here. */
export default function ExecOnboarding({ deposit, stripeOn }: {
  deposit: { cents: number; status: 'due' | 'processing' | 'paid' | 'waived' } | null;
  stripeOn: boolean;
}) {
  if (deposit?.status === 'processing') return (
    <div className="card">
      <div className="card-head">
        <h3>Your deposit is clearing</h3>
        <span className="pill"><span className="dot" />Clearing</span>
      </div>
      <p className="small" style={{ marginBottom: 12, maxWidth: 560 }}>
        Thank you. Your <b>{money(deposit.cents)}</b> deposit is on its way through the bank, and your
        search is already open. Bank transfers take a few business days to settle; nothing more is
        needed from you.
      </p>
      <p className="xs muted" style={{ maxWidth: 560 }}>
        It is credited in full against your first month once you are placed. This page updates on its own
        the moment it settles.
      </p>
    </div>
  );

  if (deposit) return <DepositGate cents={deposit.cents} stripeOn={stripeOn} />;

  return (
    <div className="card">
      <div className="card-head"><h3>Your search is being prepared</h3></div>
      <p className="small" style={{ marginBottom: 14, maxWidth: 560 }}>
        Your Client Success Manager is setting up your search from our conversation. Here is what
        happens next.
      </p>
      <ol className="plain" style={{ maxWidth: 560, marginBottom: 14 }}>
        <li><b>Within one business day.</b> Your search opens here, with your $500 deposit link.</li>
        <li><b>The day the deposit is in.</b> Sourcing begins.</li>
        <li><b>Within fourteen days of the search opening.</b> Your first qualified candidate.</li>
      </ol>
      <p className="xs muted" style={{ maxWidth: 560 }}>
        If you already arranged the deposit on your call, nothing more is needed. Questions any time: write to
        your Client Success Manager from Messages.
      </p>
    </div>
  );
}
