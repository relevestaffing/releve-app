import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { listInvoicesFor } from '@/lib/money';
import { money, dayLabel, monthLabel, daysOverdue, INVOICE_STATUS } from '@/lib/money-public';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import PayInvoiceButton from '@/components/PayInvoiceButton';
import { stripeReady } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/* One invoice, in full — looked up inside the client's own list rather than
   fetched by id and checked afterwards, the same idiom as /app/care/[id]:
   an id that is not theirs is simply not found. The billing table used to
   be the only place an invoice existed at all — a number, a status pill,
   nothing to click — so there was no way to see what an invoice actually
   was, or to pay one, without writing in. */
export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'client') redirect('/app');

  const invoices = await listInvoicesFor(profile.id);
  const inv = invoices.find(i => i.id === id);
  if (!inv) notFound();

  const status = INVOICE_STATUS.find(s => s.key === inv.status);
  const late = daysOverdue(inv.due_on);
  const openInv = (inv.status === 'sent' || inv.status === 'failed') && stripeReady();

  return (
    <Shell profile={profile} active="/app/billing"
      title={inv.number ?? 'Invoice'}
      crumb={inv.kind === 'deposit' ? 'Search deposit' : monthLabel(inv.period_start)}
      action={<Link className="btn sm ghost" href="/app/billing">Back to billing</Link>}>

      <div className="card">
        <div className="card-head">
          <h3>{inv.number ?? 'Invoice pending a number'}</h3>
          <span className={`pill ${status?.tone ?? ''}`}>{status?.label ?? inv.status}</span>
        </div>

        <div className="tally-row" style={{ marginBottom: 4 }}>
          <div><b>{money(inv.amount_cents)}</b><span>amount</span></div>
          <div><b>{dayLabel(inv.issued_on)}</b><span>issued</span></div>
          <div><b>{dayLabel(inv.due_on)}</b><span>due</span></div>
        </div>

        {(inv.status === 'draft' || inv.status === 'sent') && late > 0 && (
          <p style={{ marginTop: 16 }}>
            <span className={`pill ${late >= 14 ? 'crit' : 'warn'}`}>
              {late} day{late === 1 ? '' : 's'} late
            </span>
          </p>
        )}

        <div style={{ marginTop: 18 }}>
          <div className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>For</div>
          <p className="small" style={{ marginBottom: 14 }}>
            {inv.kind === 'deposit' ? 'Search deposit — opens the search, credited against the first monthly invoice.'
              : `Monthly retainer, ${monthLabel(inv.period_start)}${inv.talent_name ? ` — ${inv.talent_name}` : ''}.`}
          </p>
          {inv.paid_on && (
            <>
              <div className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Paid</div>
              <p className="small" style={{ marginBottom: 14 }}>{dayLabel(inv.paid_on)}</p>
            </>
          )}
          {inv.note && (
            <>
              <div className="xs muted" style={{ textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Note</div>
              <p className="small">{inv.note}</p>
            </>
          )}
        </div>

        {openInv && (
          <div style={{ marginTop: 20 }}>
            <PayInvoiceButton invoiceId={inv.id} label={`Pay ${money(inv.amount_cents)} now`} />
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <Explain>
            Something not right about this invoice? Message your Client Success Manager
            rather than paying it — we would rather fix it now than sort it out afterwards.
          </Explain>
        </div>
      </div>
    </Shell>
  );
}
