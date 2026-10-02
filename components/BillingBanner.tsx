import { billingNoticeFor } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { money } from '@/lib/money-public';
import PayInvoiceButton from './PayInvoiceButton';

/* The grace banner. Something is open past its due date, or an autopay did
   not go through, and it is not yet at the fourteen-day line where the
   placement pauses. Calm, specific, one action. Renders nothing otherwise.
   Server component: mount it anywhere a client's page is built. */
export default async function BillingBanner({ clientId }: { clientId: string }) {
  const n = await billingNoticeFor(clientId);
  if (!n) return null;
  const pay = stripeReady();
  return (
    <div className="card tight" role="status" style={{ borderLeft: '3px solid var(--warn)', marginBottom: 20 }}>
      <div className="row between" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <p className="small" style={{ margin: 0, maxWidth: 620 }}>
          {n.failed
            ? <>The last payment on invoice <b>{n.number ?? 'on file'}</b> did not go through. Most often the bank clears it on a second try, or a card works where a bank did not.</>
            : <>Invoice <b>{n.number ?? 'on file'}</b> for <b>{money(n.amount_cents, true)}</b> is open.</>}
          {' '}{n.daysLeft > 0
            ? <>Settle it within {n.daysLeft} day{n.daysLeft === 1 ? '' : 's'} and nothing changes.</>
            : <>Settle it today and nothing changes.</>}
        </p>
        {pay
          ? <PayInvoiceButton invoiceId={n.id} label={`Pay ${money(n.amount_cents, true)}`} className="btn sm solid" />
          : <a className="btn sm ghost" href="/app/messages">Ask about paying</a>}
      </div>
    </div>
  );
}
