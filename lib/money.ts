/* The money layer. Everything the Terms of Service promises, made real.

   Reads go through the signed-in person's session, so row level security
   decides what comes back — a client sees their own invoices and nothing
   else, and talent see none at all. Writes are guarded again in the database
   by is_admin(), so a bug in a route handler cannot become a billing
   incident. */
import { configured, supabaseServer } from './supabase/server';
import type { DepositStatus, Invoice, InvoiceStatus } from './money-public';
import { DEPOSIT_CENTS } from './money-public';

export * from './money-public';

/* ---------- terms acceptance ---------- */

/* Insert-only, and the database has no update or delete policy on this table.
   Evidence you can quietly rewrite is not evidence. */
export async function recordAcceptance(args: {
  user_id: string; version: string; ip?: string | null; user_agent?: string | null;
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
        ip: args.ip ?? null, user_agent: args.user_agent ?? null
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
   that now exists, whether this call made it or an earlier one did. */
export async function invoiceDeposit(searchId: string, clientId: string) {
  if (!configured()) return null;
  const sb = await supabaseServer();

  const { data: already } = await sb.from('invoices')
    .select('*').eq('search_id', searchId).eq('kind', 'deposit').maybeSingle();
  if (already) return already as Invoice;

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from('invoices').insert({
    client_id: clientId, search_id: searchId, kind: 'deposit',
    amount_cents: DEPOSIT_CENTS, issued_on: today, due_on: today,
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
      notice_given_on: on ?? new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString()
    }, { onConflict: 'placement_id' });
  if (error) throw new Error(error.message);
}

/* ---------- invoices ---------- */

const SHAPE =
  'id, number, client_id, placement_id, search_id, kind, period_start, period_end, ' +
  'amount_cents, issued_on, due_on, status, paid_on, note';

export async function listInvoicesFor(clientId: string): Promise<Invoice[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('invoices').select(SHAPE)
    .eq('client_id', clientId).order('issued_on', { ascending: false });
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
  const { error } = await sb.from('invoices').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/* The monthly run. All the arithmetic lives in the database function, which
   is idempotent — running it twice in a month creates nothing the second
   time. Returns how many drafts it actually made. */
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
};

export async function moneySummary(): Promise<MoneySummary> {
  const empty: MoneySummary = {
    outstandingCents: 0, overdueCents: 0, monthlyRunRateCents: 0,
    unpaidCount: 0, overdueCount: 0, suspendableCount: 0, placementsWithoutRate: 0
  };
  if (!configured()) return empty;
  const sb = await supabaseServer();

  const { data: open } = await sb.from('invoices')
    .select('amount_cents, due_on, status').in('status', ['draft', 'sent']);

  const today = new Date().toISOString().slice(0, 10);
  const out = { ...empty };
  for (const i of (open ?? []) as any[]) {
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
