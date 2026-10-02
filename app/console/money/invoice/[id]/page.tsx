import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { invoiceDocument } from '@/lib/money';
import { monthLabel } from '@/lib/money-public';
import Shell from '@/components/Shell';
import InvoiceDocument from '@/components/InvoiceDocument';

export const dynamic = 'force-dynamic';

/* The same document the executive sees, for the team: to print, to attach
   to an email, or to check before sending. Drafts show as drafts. */
export default async function ConsoleInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const inv = await invoiceDocument(id);
  if (!inv) notFound();

  return (
    <Shell profile={profile} active="/console/money"
      title={inv.number ?? 'Draft invoice'}
      crumb={`${inv.org_name ?? inv.client_name} · ${inv.kind === 'deposit' ? 'Search deposit' : monthLabel(inv.period_start)}`}
      action={<Link className="btn sm ghost" href="/console/money#invoices">Back to Billing</Link>}>
      <InvoiceDocument inv={inv} />
      {inv.status === 'failed' && inv.failure_reason && (
        <p className="xs muted no-print" style={{ marginTop: 16 }}>Last attempt: {inv.failure_reason}</p>
      )}
    </Shell>
  );
}
