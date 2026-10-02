/* The money layer. Everything the Terms of Service promises, made real.

   Reads go through the signed-in person's session, so row level security
   decides what comes back — a client sees their own invoices and nothing
   else, and talent see none at all. Writes are guarded again in the database
   by is_admin(), so a bug in a route handler cannot become a billing
   incident. */
import { configured, supabaseServer } from './supabase/server';
import type { DepositStatus, Invoice, InvoiceStatus } from './money-public';
import {
  DEPOSIT_CENTS, MANUAL_STATUSES, todayInPacific, daysBetweenISO, monthStartPacific
} from './money-public';

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
    throw new Error('the acceptance did not save, please try again'
);
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
    deposit_paid_on: status === 'paid' ? (paidOn ?? todayInPacific()) : null
  }).eq('id', searchId);
  if (error) throw new Error(error.message);
}

/* The deposit is invoiced once, when the search opens. Returns the invoice
   that now exists, whether this call made it or an earlier one did.

   Takes an optional client: the console calls this as the signed-in admin;
   the executive's own pay button needs the same ensure-it-exists step from a
   session that has no write policy, so that caller passes the service client.
   Either way the amount comes from the search's own deposit_cents. A waived
   deposit is never invoiced. */
export async function invoiceDeposit(searchId: string, clientId: string, sb?: Awaited<ReturnType<typeof supabaseServer>>) {
  if (!configured()) return null;
  const db = sb ?? await supabaseServer();

  const { data: already } = await db.from('invoices')
    .select('*').eq('search_id', searchId).eq('kind', 'deposit').maybeSingle();
  if (already) return already as Invoice;

  const { data: search } = await db.from('searches')
    .select('deposit_cents, deposit_status').eq('id', searchId).maybeSingle();
  if ((search as any)?.deposit_status === 'waived') throw new Error('That deposit was waived, so there is nothing to invoice.');

  const today = todayInPacific();
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

/* Notice recorded from the console: written notice that reached Relève by
   email or letter, optionally on the day it actually arrived. Goes through
   give_notice_admin(), which applies the rule (end of the following billing
   month, never inside the minimum) and stores the end date billing reads.
   Recording only notice_given_on, as this used to, never stopped billing. */
export async function giveNotice(placementId: string, opts?: { on?: string | null; reason?: string | null; note?: string | null }):
  Promise<{ givenOn: string | null; endsOn: string | null }> {
  if (!configured()) return { givenOn: opts?.on ?? todayInPacific(), endsOn: null };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('give_notice_admin', {
    p_placement: placementId,
    p_on: opts?.on || null,
    p_reason: opts?.reason || null,
    p_note: opts?.note || null
  });
  if (error) throw new Error(error.message);
  const { data: t } = await sb.from('placement_terms')
    .select('notice_given_on, notice_ends_on').eq('placement_id', placementId).maybeSingle();
  return { givenOn: (t as any)?.notice_given_on ?? (data as any) ?? null, endsOn: (t as any)?.notice_ends_on ?? null };
}

export async function withdrawNotice(placementId: string) {
  if (!configured()) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc('withdraw_notice', { p_placement: placementId });
  if (error) throw new Error(error.message);
}

/* Fails closed: anything other than a clear yes from the database is a no. */
export async function isOwner(): Promise<boolean> {
  if (!configured()) return true;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('is_owner');
  if (error) return false;
  return data === true;
}

/* ---------- invoices ---------- */

const SHAPE =
  'id, number, client_id, placement_id, search_id, kind, period_start, period_end, ' +
  'amount_cents, issued_on, due_on, status, paid_on, note, subtotal_cents, deposit_credit_cents, ' +
  'days_billed, days_in_period, service_from, service_to, refunded_cents, refunded_on, ' +
  'dispute_status, failure_reason, sent_at';

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
    .select(SHAPE + ', client:client_id(full_name, org_name, email)')
    .order('issued_on', { ascending: false }).limit(400);
  return (data ?? []).map((r: any) => ({
    ...r, client_name: r.client?.full_name ?? 'Client', org_name: r.client?.org_name ?? null,
    client_email: r.client?.email ?? null
  })) as Invoice[];
}

/* A status set by hand. Stripe's states are refused here before the
   database refuses them too, with words the console can show. */
export async function setInvoiceStatus(id: string, status: InvoiceStatus, paidOn?: string | null) {
  if (!configured()) return;
  if (!MANUAL_STATUSES.includes(status)) throw new Error('That status is set by Stripe, not by hand.');
  const sb = await supabaseServer();
  const { data: cur } = await sb.from('invoices').select('status').eq('id', id).maybeSingle();
  if (!cur) throw new Error('That invoice does not exist.');
  if (['processing', 'refunded', 'disputed'].includes((cur as any).status) && (cur as any).status !== status)
    throw new Error('That invoice is with the bank right now. Its status changes when Stripe reports back.');
  const patch: Record<string, unknown> = { status };
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

/* A fully credited invoice has nothing to collect. Once sent it is settled. */
export async function settleZeroInvoice(id: string) {
  const sb = await supabaseServer();
  const { error } = await sb.from('invoices').update({ status: 'paid', paid_on: todayInPacific() })
    .eq('id', id).eq('amount_cents', 0).eq('status', 'sent');
  if (error) throw new Error(error.message);
}

export async function issueMonthlyRetainers(forMonth?: string): Promise<number> {
  if (!configured()) return 0;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('issue_monthly_retainers', {
    for_month: forMonth ?? todayInPacific()
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
  failedCount: number;
  disputedCount: number;
  suspendedCount: number;
};

export async function moneySummary(): Promise<MoneySummary> {
  const empty: MoneySummary = {
    outstandingCents: 0, overdueCents: 0, monthlyRunRateCents: 0,
    unpaidCount: 0, overdueCount: 0, suspendableCount: 0, placementsWithoutRate: 0,
    draftCount: 0, draftCents: 0, failedCount: 0, disputedCount: 0, suspendedCount: 0
  };
  if (!configured()) return empty;
  const sb = await supabaseServer();

  const { data: open } = await sb.from('invoices')
    .select('amount_cents, due_on, status, sent_at').in('status', ['draft', 'sent', 'failed', 'disputed']);

  const today = todayInPacific();
  const out = { ...empty };
  for (const i of (open ?? []) as any[]) {
    if (i.status === 'disputed') { out.disputedCount++; continue; }
    if (i.status === 'draft') { out.draftCount++; out.draftCents += i.amount_cents; continue; }
    if (i.amount_cents <= 0) continue;
    if (i.status === 'failed') out.failedCount++;
    out.outstandingCents += i.amount_cents;
    out.unpaidCount++;
    if (i.due_on && i.due_on < today) {
      out.overdueCents += i.amount_cents;
      out.overdueCount++;
      if (daysBetweenISO(i.due_on, today) >= 14) out.suspendableCount++;
    }
  }

  /* Run rate counts live placements only. */
  const { data: live } = await sb.from('placements')
    .select('id, terms:placement_terms(rate_month_cents)').is('ended_on', null);
  for (const p of (live ?? []) as any[]) {
    const cents = Array.isArray(p.terms) ? p.terms[0]?.rate_month_cents : p.terms?.rate_month_cents;
    if (cents == null) out.placementsWithoutRate++;
    else out.monthlyRunRateCents += cents;
  }
  /* Its own query, so a database one migration behind still shows the rest. */
  const { count } = await sb.from('placements')
    .select('id', { count: 'exact', head: true }).is('ended_on', null).not('suspended_at', 'is', null);
  out.suspendedCount = count ?? 0;
  return out;
}

/* ---------- the invoice as a document ---------- */

export type InvoiceDocument = Invoice & {
  client_email: string | null;
  talent_name?: string;
};

/* One invoice with everything the printable document shows. For a client,
   scoped to their own issued invoices (row level security does the same; this
   also hides drafts). For the team, any invoice. */
export async function invoiceDocument(id: string, asClient?: string): Promise<InvoiceDocument | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  let q = sb.from('invoices')
    .select(SHAPE + ', client:client_id(full_name, org_name, email), placement:placement_id(talent:talent_id(full_name))')
    .eq('id', id);
  if (asClient) q = q.eq('client_id', asClient).neq('status', 'draft');
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const r = data as any;
  return {
    ...r,
    client_name: r.client?.full_name ?? 'Client',
    org_name: r.client?.org_name ?? null,
    client_email: r.client?.email ?? null,
    talent_name: r.placement?.talent?.full_name ?? undefined
  } as InvoiceDocument;
}

/* ---------- reports: what actually happened, not what was contracted ---------- */

export type MoneyReports = {
  cashByMonth: { month: string; cents: number; count: number }[];
  mrrByMonth: { month: string; cents: number; placements: number }[];
  aging: { current: number; d1_14: number; d15_30: number; d30plus: number; currentCount: number; d1_14Count: number; d15_30Count: number; d30plusCount: number };
  retention: { seats: number; churned: number; awaitingReplacement: number; replacements: number; pct: number | null };
  us1099: { talent_id: string; name: string; cents: number; w9: boolean }[];
};

function lastMonths(n: number): string[] {
  const start = monthStartPacific();
  const out: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 10));
  }
  return out;
}

function monthEnd(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export async function moneyReports(): Promise<MoneyReports> {
  const months = lastMonths(12);
  const empty: MoneyReports = {
    cashByMonth: months.map(m => ({ month: m, cents: 0, count: 0 })),
    mrrByMonth: months.map(m => ({ month: m, cents: 0, placements: 0 })),
    aging: { current: 0, d1_14: 0, d15_30: 0, d30plus: 0, currentCount: 0, d1_14Count: 0, d15_30Count: 0, d30plusCount: 0 },
    retention: { seats: 0, churned: 0, awaitingReplacement: 0, replacements: 0, pct: null },
    us1099: []
  };
  if (!configured()) return empty;
  const sb = await supabaseServer();
  const out: MoneyReports = JSON.parse(JSON.stringify(empty));
  const today = todayInPacific();

  const [{ data: paid }, { data: open }, { data: places }, { data: pays }, { data: payout }] = await Promise.all([
    sb.from('invoices').select('amount_cents, refunded_cents, paid_on, status')
      .in('status', ['paid', 'refunded', 'disputed']).gte('paid_on', months[0]),
    sb.from('invoices').select('amount_cents, due_on, status').in('status', ['sent', 'failed']).gt('amount_cents', 0),
    sb.from('placements').select('id, started_on, ended_on, ended_reason, replaces_id, terms:placement_terms(rate_month_cents)'),
    sb.from('talent_payments').select('talent_id, amount_cents, sent_cents, sent_on, state, talent:talent_id(full_name)')
      .eq('state', 'sent').gte('sent_on', today.slice(0, 4) + '-01-01'),
    sb.from('talent_payout').select('talent_id, us_person, tax_form_on_file')
  ]);

  /* Cash collected, by the month it landed, net of anything refunded. */
  const cash = new Map(out.cashByMonth.map(c => [c.month, c]));
  for (const i of (paid ?? []) as any[]) {
    if (!i.paid_on) continue;
    const row = cash.get(i.paid_on.slice(0, 8) + '01');
    if (!row) continue;
    row.cents += Math.max(0, i.amount_cents - (i.refunded_cents ?? 0));
    row.count++;
  }

  /* Receivables aging, in Pacific days past the due date. */
  for (const i of (open ?? []) as any[]) {
    const late = i.due_on ? daysBetweenISO(i.due_on, today) : 0;
    if (late <= 0) { out.aging.current += i.amount_cents; out.aging.currentCount++; }
    else if (late <= 14) { out.aging.d1_14 += i.amount_cents; out.aging.d1_14Count++; }
    else if (late <= 30) { out.aging.d15_30 += i.amount_cents; out.aging.d15_30Count++; }
    else { out.aging.d30plus += i.amount_cents; out.aging.d30plusCount++; }
  }

  /* Contracted monthly revenue at the end of each month (today, for this one),
     at each placement's current rate. */
  const rows = (places ?? []) as any[];
  for (const m of out.mrrByMonth) {
    const end = m.month === months[months.length - 1] ? today : monthEnd(m.month);
    for (const p of rows) {
      const rate = Array.isArray(p.terms) ? p.terms[0]?.rate_month_cents : p.terms?.rate_month_cents;
      if (rate == null) continue;
      if (p.started_on > end) continue;
      if (p.ended_on && p.ended_on < end) continue;
      m.cents += rate; m.placements++;
    }
  }

  /* Retention by seat, not by person. A guaranteed ending that has been
     replaced is the same seat carrying on; one awaiting its replacement is
     not churn yet. */
  const replacedIds = new Set(rows.filter(p => p.replaces_id).map(p => p.replaces_id));
  const guaranteed = (r: string | null) => r === 'talent_left' || r === 'not_working';
  out.retention.seats = rows.filter(p => !p.replaces_id).length;
  out.retention.replacements = rows.filter(p => p.replaces_id).length;
  for (const p of rows) {
    if (!p.ended_on || replacedIds.has(p.id)) continue;
    if (guaranteed(p.ended_reason)) out.retention.awaitingReplacement++;
    else out.retention.churned++;
  }
  out.retention.pct = out.retention.seats
    ? Math.round(((out.retention.seats - out.retention.churned) / out.retention.seats) * 100) : null;

  /* Form 1099-NEC: US persons paid $600 or more this calendar year. */
  const us = new Map(((payout ?? []) as any[]).filter(p => p.us_person === true)
    .map(p => [p.talent_id, Boolean(p.tax_form_on_file)]));
  const byTalent = new Map<string, { name: string; cents: number }>();
  for (const p of (pays ?? []) as any[]) {
    if (!us.has(p.talent_id)) continue;
    const cur = byTalent.get(p.talent_id) ?? { name: p.talent?.full_name ?? 'Talent', cents: 0 };
    cur.cents += p.sent_cents ?? p.amount_cents ?? 0;
    byTalent.set(p.talent_id, cur);
  }
  out.us1099 = [...byTalent.entries()]
    .filter(([, v]) => v.cents >= 60_000)
    .map(([id, v]) => ({ talent_id: id, name: v.name, cents: v.cents, w9: us.get(id) ?? false }))
    .sort((a, b) => b.cents - a.cents);
  return out;
}
