/* The money layer. Everything the Terms of Service promises, made real.

   Reads go through the signed-in person's session, so row level security
   decides what comes back — a client sees their own invoices and nothing
   else, and talent see none at all. Writes are guarded again in the database
   by is_admin(), so a bug in a route handler cannot become a billing
   incident. */
import { configured, supabaseServer } from './supabase/server';
import type { DepositStatus, Invoice, InvoiceStatus } from './money-public';
import { DEPOSIT_CENTS, todayInPacific } from './money-public';

export * from './money-public';

/* ---------- terms acceptance ---------- */

/* Insert-only, and the database has no update or delete policy on this table.
   Evidence you can quietly rewrite is not evidence. */
export async function recordAcceptance(args: {
  user_id: string; version: string; ip?: string | null; user_agent?: string | null;
  /* What the executive typed as their signature. A tick is enough to form a
     contract in most places and nowhere near enough to enforce one
     comfortably — which matters most for the non-circumvention clause, the one
     protecting the whole business model and the one most likely to be tested.
     Null on the talent side, who sign a separate agreement during vetting, and
     null on the older rows, which is itself the record that they only ticked. */
  signed_name?: string | null;
}) {
  if (!configured()) return;
  const sb = await supabaseServer();

  /* upsert with ignoreDuplicates, not insert: a second click on the same
     version must be a no-op rather than an error. A plain insert would raise
     on the unique index, and swallowing that error is how someone ends up
     stuck on the gate forever — accepted, told it worked, never recorded. */
  const { error } = await sb.from('terms_acceptances')
    .upsert(
      (['terms', 'privacy'] as const).map(document => ({
        user_id: args.user_id, document, version: args.version,
        ip: args.ip ?? null, user_agent: args.user_agent ?? null,
        signed_name: args.signed_name ?? null
      })),
      { onConflict: 'user_id,document,version', ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);

  /* Read it back. This is the only thing that actually matters: if the row is
     not there, the caller must hear about it now, not discover it when the
     gate reappears on the next page. */
  if (!(await hasAccepted(args.user_id, args.version)))
    throw new Error('the acceptance did not save — please try again');
}

export async function hasAccepted(userId: string, version: string): Promise<boolean> {
  if (!configured()) return true;   // never lock anyone out of an unconfigured app
  const sb = await supabaseServer();
  const { data } = await sb.from('terms_acceptances')
    .select('document').eq('user_id', userId).eq('version', version);
  return (data ?? []).some(r => r.document === 'terms');
}

/* ---------- the deposit, which lives on the search ---------- */

export async function setDeposit(searchId: string, status: DepositStatus, paidOn?: string | null) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('searches').update({
    deposit_status: status,
    deposit_paid_on: status === 'paid' ? (paidOn ?? new Date().toISOString().slice(0, 10)) : null
  }).eq('id', searchId);
  if (error) throw new Error(error.message);
}

/* The deposit is invoiced once, when the search opens. Returns the invoice
   that now exists, whether this call made it or an earlier one did.

   Takes an optional client: the console calls this as the signed-in admin,
   who has a write policy on invoices. The executive's own "pay my deposit"
   button needs the same ensure-it-exists step to happen from their own
   session, where they have none — that caller passes an elevated client
   instead, scoped to nothing but this one insert. Either way the amount
   comes from the search's own deposit_cents, never from the caller. */
export async function invoiceDeposit(searchId: string, clientId: string, sb?: Awaited<ReturnType<typeof supabaseServer>>) {
  if (!configured()) return null;
  const db = sb ?? await supabaseServer();

  const { data: already } = await db.from('invoices')
    .select('*').eq('search_id', searchId).eq('kind', 'deposit').maybeSingle();
  if (already) return already as Invoice;

  const { data: search } = await db.from('searches')
    .select('deposit_cents').eq('id', searchId).maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db.from('invoices').insert({
    client_id: clientId, search_id: searchId, kind: 'deposit',
    amount_cents: (search as any)?.deposit_cents ?? DEPOSIT_CENTS, issued_on: today, due_on: today,
    status: 'draft',
    note: 'Search deposit. Non-refundable, credited against the first monthly invoice.'
  }).select().single();
  if (error) throw new Error(error.message);
  return data as Invoice;
}

/* ---------- the agreed rate, which lives on the placement ---------- */

/* The rate lives in placement_terms, not on the placement. Talent can read
   their own placements row; they must never be able to read this number. */
export async function setPlacementRate(placementId: string, cents: number | null, minimumMonths?: number) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const patch: Record<string, unknown> = {
    placement_id: placementId, rate_month_cents: cents, updated_at: new Date().toISOString()
  };
  if (minimumMonths != null) patch.minimum_months = minimumMonths;
  const { error } = await sb.from('placement_terms')
    .upsert(patch, { onConflict: 'placement_id' });
  if (error) throw new Error(error.message);
}

/* Notice under Section 5: thirty days, effective at the end of the following
   billing month. Recording the date is what makes that calculable later. */
export async function giveNotice(placementId: string, on?: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.from('placement_terms')
    .upsert({
      placement_id: placementId,
      notice_given_on: on ?? todayInPacific(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'placement_id' });
  if (error) throw new Error(error.message);
}

/* ---------- invoices ---------- */

const SHAPE =
  'id, number, client_id, placement_id, search_id, kind, period_start, period_end, ' +
  'amount_cents, issued_on, due_on, status, paid_on, note';

/* The executive's own invoices — everything that has actually been issued
   to them. A draft has not: it is Relève's working copy, and showing it
   (with a Pay button that Stripe then refused) told a client they owed
   money nobody had asked for. */
export async function listInvoicesFor(clientId: string): Promise<Invoice[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('invoices').select(SHAPE)
    .eq('client_id', clientId).neq('status', 'draft').order('issued_on', { ascending: false });
  /* The column list is a shared constant, so the client cannot infer the row
     shape from it. The shape is asserted here and guaranteed by SHAPE above. */
  return (data ?? []) as unknown as Invoice[];
}

export async function allInvoices(): Promise<Invoice[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('invoices')
    .select(SHAPE + ', client:client_id(full_name, org_name)')
    .order('issued_on', { ascending: false }).limit(400);
  return (data ?? []).map((r: any) => ({
    ...r, client_name: r.client?.full_name ?? 'Client', org_name: r.client?.org_name ?? null
  })) as Invoice[];
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus, paidOn?: string | null) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const patch: Record<string, unknown> = { status };
  /* Leave paid_on to the database trigger when marking paid without a date,
     and clear it when a payment is walked back. */
  if (status === 'paid' && paidOn) patch.paid_on = paidOn;
  if (status !== 'paid') patch.paid_on = null;
  const { error } = await sb.from('invoices').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function editInvoice(id: string, patch: { amount_cents?: number; note?: string; due_on?: string | null }) {
  if (!configured()) return;
  const sb = await supabaseServer();
  /* Only an invoice that has not already moved money can be edited. Once it
     is processing, paid or void, the amount on the row either matches a real
     Stripe charge already made or is settled for good — changing it here
     would leave the invoice saying something different from what actually
     happened, with nothing to reconcile the two. */
  const { data, error } = await sb.from('invoices').update(patch)
    .eq('id', id).in('status', ['draft', 'sent', 'failed'])
    .select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That invoice has already moved money and can no longer be edited.');
}

/* The monthly run. All the arithmetic lives in the database function, which
   is idempotent — running it twice in a month creates nothing the second
   time. Returns how many drafts it actually made. */
export async function getInvoice(id: string): Promise<Invoice | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('invoices').select('*').eq('id', id).maybeSingle();
  return (data as Invoice) ?? null;
}

/** Records that the invoice genuinely left the building, which is a different
    fact from somebody having set its status to "sent". */
export async function markInvoiceSent(id: string) {
  const sb = await supabaseServer();
  await sb.from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', id);
}

export async function issueMonthlyRetainers(forMonth?: string): Promise<number> {
  if (!configured()) return 0;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('issue_monthly_retainers', {
    for_month: forMonth ?? new Date().toISOString().slice(0, 10)
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/* ---------- the one number she actually wants ---------- */

export type MoneySummary = {
  outstandingCents: number;
  overdueCents: number;
  monthlyRunRateCents: number;
  unpaidCount: number;
  overdueCount: number;
  suspendableCount: number;
  placementsWithoutRate: number;
  /* Issued but never delivered. Kept apart from everything above, because
     money you have not asked for is not money anybody owes you yet. */
  draftCount: number;
  draftCents: number;
};

export async function moneySummary(): Promise<MoneySummary> {
  const empty: MoneySummary = {
    outstandingCents: 0, overdueCents: 0, monthlyRunRateCents: 0,
    unpaidCount: 0, overdueCount: 0, suspendableCount: 0, placementsWithoutRate: 0,
    draftCount: 0, draftCents: 0
  };
  if (!configured()) return empty;
  const sb = await supabaseServer();

  const { data: open } = await sb.from('invoices')
    .select('amount_cents, due_on, status, sent_at').in('status', ['draft', 'sent', 'failed']);

  const today = new Date().toISOString().slice(0, 10);
  const out = { ...empty };
  for (const i of (open ?? []) as any[]) {
    /* A draft is money you have not asked for. Counting drafts as outstanding
       meant pressing "Issue this month" and doing nothing else produced, two
       weeks later, a top-ranked alert saying invoices were unpaid and the
       placement could be suspended — for invoices the client had never seen. */
    if (i.status === 'draft') { out.draftCount++; out.draftCents += i.amount_cents; continue; }
    out.outstandingCents += i.amount_cents;
    out.unpaidCount++;
    if (i.due_on && i.due_on < today) {
      out.overdueCents += i.amount_cents;
      out.overdueCount++;
      const late = Math.floor((Date.parse(today) - Date.parse(i.due_on)) / 86_400_000);
      if (late >= 14) out.suspendableCount++;
    }
  }

  /* Run rate counts live placements only. A placement inside its minimum term
     is still owed, but it is not recurring revenue. */
  const { data: live } = await sb.from('placements')
    .select('id, terms:placement_terms(rate_month_cents)').is('ended_on', null);
  for (const p of (live ?? []) as any[]) {
    const cents = Array.isArray(p.terms) ? p.terms[0]?.rate_month_cents : p.terms?.rate_month_cents;
    if (cents == null) out.placementsWithoutRate++;
    else out.monthlyRunRateCents += cents;
  }
  return out;
}
