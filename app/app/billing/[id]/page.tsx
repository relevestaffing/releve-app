import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { invoiceDocument } from '@/lib/money';
import { money, monthLabel } from '@/lib/money-public';
import Shell from '@/components/Shell';
import InvoiceDocument from '@/components/InvoiceDocument';
import PayInvoiceButton from '@/components/PayInvoiceButton';
import { stripeReady } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/* One invoice, as a document the executive can print or save as a PDF. Read
   scoped to their own issued invoices: an id that is not theirs, or a draft,
   is simply not found. */
export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect(`/console/money/invoice/${id}`);
  if (profile.role !== 'client') redirect('/app');

  const inv = await invoiceDocument(id, profile.id);
  if (!inv) notFound();

  const payable = (inv.status === 'sent' || inv.status === 'failed') && inv.amount_cents > 0 && stripeReady();

  return (
    <Shell profile={profile} active="/app/billing"
      title={inv.number ?? 'Invoice'}
      crumb={inv.kind === 'deposit' ? 'Search deposit' : monthLabel(inv.period_start)}
      action={<Link className="btn sm ghost" href="/app/billing">Back to billing</Link>}>
      <InvoiceDocument inv={inv}
        actions={payable
          ? <PayInvoiceButton invoiceId={inv.id} label={`Pay ${money(inv.amount_cents, true)}`} className="btn sm ghost" />
          : null} />
      <p className="xs muted no-print" style={{ marginTop: 16, maxWidth: 620 }}>
        Something not right about this invoice? Write to your Client Success Manager from Messages rather than
        paying it. We would rather fix it now.
      </p>
    </Shell>
  );
}
