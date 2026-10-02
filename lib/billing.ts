import type { SupabaseClient } from '@supabase/supabase-js';
import { configured, supabaseServer } from './supabase/server';
import { adminClient as serviceClient, hasServiceKey, teamEmailsAdmin } from './supabase/admin';
import { stripeCall, SITE } from './stripe';
import { invoiceDeposit } from './money';
import { money, todayInPacific, addDaysISO } from './money-public';
import type { Invoice } from './money-public';
import { send } from './email';
import { billingTemplates } from './email-billing';

/* Where the money actually moves.
   ------------------------------
   One rule runs through all of it: nothing here marks an invoice paid. Bank
   debit clears days after it is accepted and can still fail afterwards, so
   the only thing allowed to say money arrived is the webhook, which is Stripe
   telling us it landed. The buttons submit; Stripe decides. */

export type { BillingAccount } from './billing-public';
import type { BillingAccount } from './billing-public';

/* The service-role client. Used for the writes no signed-in session may make
   (recording a Stripe customer, claiming an invoice for a charge) and for the
   pay-link pages, which have no session at all. Every caller has already
   decided who is allowed; this only carries it out. */
export function adminClient(): SupabaseClient {
  return serviceClient();
}

/* Every Relève admin's address, read with the service key so it works from a
   webhook or a scheduled job as well as from a signed-in page. */
export async function teamAddresses(): Promise<string[]> {
  return teamEmailsAdmin();
}

export async function tellTeam(build: () => { subject: string; text: string; html: string; kind: string }) {
  try {
    for (const t of await teamAddresses()) await send(t, build());
  } catch (e) { console.error('[billing] team email failed', e); }
}

export async function billingAccount(clientId: string, db?: SupabaseClient): Promise<BillingAccount | null> {
  if (!configured()) return null;
  const sb = db ?? await supabaseServer();
  const { data } = await sb.from('billing_accounts').select('*').eq('client_id', clientId).maybeSingle();
  return (data as BillingAccount) ?? null;
}

/* Stripe needs a customer before it can hold a mandate. Made once, reused for
   the life of the account: a second customer for the same executive splits
   their payment history in two and leaves autopay pointing at a payment
   method the other customer owns. Read with the service key, because the
   pay-link pages have no session and a session-less read always came back
   empty, which is exactly how the duplicates were made (B9). */
async function customerFor(clientId: string, email: string, name: string | null): Promise<string> {
  const db = adminClient();
  const existing = await billingAccount(clientId, db);
  if (existing?.stripe_customer) return existing.stripe_customer;

  const customer = await stripeCall<{ id: string }>('/customers', {
    email, name: name ?? undefined,
    metadata: { client_id: clientId, source: 'releve' }
  }, { idempotencyKey: `customer:${clientId}` });

  const { error } = await db.from('billing_accounts')
    .upsert({ client_id: clientId, stripe_customer: customer.id, updated_at: new Date().toISOString() },
            { onConflict: 'client_id' });
  if (error) throw new Error(error.message);
  return customer.id;
}

/* A Checkout session stays open for this long. Stripe's floor is thirty
   minutes; autopay will not charge an invoice while one is open. */
const CHECKOUT_MINUTES = 31;
const checkoutExpiry = () => Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60;

/* The executive links their bank once. Checkout in setup mode: Stripe handles
   the bank login, the micro-deposit fallback and the mandate wording, all of
   which are regulated. Nothing is charged here. */
export async function startPaymentSetup(clientId: string, email: string, name: string | null): Promise<string> {
  const customer = await customerFor(clientId, email, name);
  const session = await stripeCall<{ url: string }>('/checkout/sessions', {
    mode: 'setup',
    customer,
    /* Bank debit first: on a retainer this size a card costs about a hundred
       dollars a month that neither side gets anything for. */
    payment_method_types: ['us_bank_account', 'card'],
    success_url: `${SITE}/app/billing?setup=done`,
    cancel_url: `${SITE}/app/billing?setup=cancelled`,
    metadata: { client_id: clientId }
  });
  return session.url;
}

/* Whether an executive's open search is waiting on its deposit. Null means no
   open search. Paid and waived read as cleared; processing is money already
   moving, shown as clearing rather than asked for again (B22). */
export async function depositGateFor(clientId: string): Promise<{
  searchId: string; status: 'due' | 'processing' | 'paid' | 'waived'; cents: number;
} | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('searches')
    .select('id, deposit_status, deposit_cents')
    .eq('client_id', clientId).is('closed_at', null)
    .order('opened_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return {
    searchId: (data as any).id,
    status: (data as any).deposit_status ?? 'due',
    cents: (data as any).deposit_cents ?? 50_000
  };
}

/* Records that a Checkout session is open for this invoice, so autopay leaves
   it alone until the session is used or lapses. */
async function holdForCheckout(invoiceId: string, sessionId: string, expiresAt: number) {
  const { error } = await adminClient().from('invoices').update({
    checkout_session: sessionId,
    checkout_expires_at: new Date(expiresAt * 1000).toISOString()
  }).eq('id', invoiceId);
  if (error) console.error('[billing] could not record the open checkout', invoiceId, error.message);
}

async function checkoutForClaimedDeposit(
  clientId: string, email: string, name: string | null, searchId: string, cents: number
): Promise<string> {
  const invoice = await invoiceDeposit(searchId, clientId, adminClient() as any) as Invoice | null;
  if (!invoice) throw new Error('Could not prepare that invoice.');
  if (['paid', 'processing', 'void', 'refunded', 'disputed'].includes(invoice.status))
    throw new Error('That deposit is already settled.');

  const customer = await customerFor(clientId, email, name);
  const expires = checkoutExpiry();
  const session = await stripeCall<{ id: string; url: string }>('/checkout/sessions', {
    mode: 'payment',
    customer,
    payment_method_types: ['us_bank_account', 'card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: invoice.amount_cents ?? cents,
        product_data: { name: 'Relève search deposit' }
      },
      quantity: 1
    }],
    payment_intent_data: {
      setup_future_usage: 'off_session',
      metadata: { invoice_id: invoice.id, client_id: clientId, search_id: searchId }
    },
    expires_at: expires,
    success_url: `${SITE}/app?deposit=done`,
    cancel_url: `${SITE}/app?deposit=cancelled`,
    metadata: { client_id: clientId, search_id: searchId, invoice_id: invoice.id }
  });
  await holdForCheckout(invoice.id, session.id, expires);
  return session.url;
}

/* The executive pays their own $500 search deposit, from inside the app. The
   same Checkout keeps the payment method on file for the monthly retainer. */
export async function startDepositPayment(clientId: string, email: string, name: string | null): Promise<string> {
  const gate = await depositGateFor(clientId);
  if (!gate) throw new Error('There is no open search to pay a deposit on.');
  if (gate.status !== 'due') throw new Error('That deposit is already settled.');
  return checkoutForClaimedDeposit(clientId, email, name, gate.searchId, gate.cents);
}

/* What the deposit pay-link page shows before anyone presses a button. Read
   only: no Stripe call happens on a page load, so a link scanner opening the
   email creates nothing (B24). */
export async function depositLinkSummary(searchId: string): Promise<{
  ok: boolean; cents: number; who: string | null; settled: boolean; reason?: string;
}> {
  if (!hasServiceKey()) return { ok: false, cents: 0, who: null, settled: false, reason: 'unavailable' };
  const db = adminClient();
  const { data: s } = await db.from('searches')
    .select('id, closed_at, deposit_status, deposit_cents, client:client_id(full_name, org_name), pending:pending_id(full_name, org_name)')
    .eq('id', searchId).maybeSingle();
  if (!s) return { ok: false, cents: 0, who: null, settled: false, reason: 'missing' };
  const who = (s as any).client?.org_name ?? (s as any).client?.full_name
           ?? (s as any).pending?.org_name ?? (s as any).pending?.full_name ?? null;
  const cents = (s as any).deposit_cents ?? 50_000;
  if ((s as any).closed_at) return { ok: false, cents, who, settled: false, reason: 'closed' };
  if ((s as any).deposit_status !== 'due') return { ok: false, cents, who, settled: true };
  return { ok: true, cents, who, settled: false };
}

/* The same deposit, paid from the onboarding email, routinely before the
   person has ever signed in. Looked up with the service key from the signed
   link. A pending person has no client_id yet, so Checkout creates the Stripe
   customer; the webhook keeps it on the search, and claiming the account
   turns it into their mandate (schema PART 39, backfill_deposit_invoice). */
export async function startDepositPaymentForSearch(searchId: string): Promise<string> {
  const db = adminClient();
  const { data: search } = await db.from('searches')
    .select('id, client_id, pending_id, closed_at, deposit_status, deposit_cents')
    .eq('id', searchId).maybeSingle();
  if (!search) throw new Error('That search no longer exists.');
  if ((search as any).closed_at) throw new Error('That search is not open.');
  if ((search as any).deposit_status !== 'due') throw new Error('That deposit is already settled.');

  const cents = (search as any).deposit_cents ?? 50_000;
  const clientId = (search as any).client_id as string | null;

  if (clientId) {
    const { data: profile } = await db.from('profiles')
      .select('email, full_name').eq('id', clientId).maybeSingle();
    if (!profile) throw new Error('Could not find that account.');
    return checkoutForClaimedDeposit(
      clientId, (profile as any).email, (profile as any).full_name ?? null, searchId, cents
    );
  }

  const pendingId = (search as any).pending_id as string | null;
  if (!pendingId) throw new Error('That search has nobody to bill yet.');
  const { data: pending } = await db.from('pending_people')
    .select('email, full_name').eq('id', pendingId).maybeSingle();
  if (!pending) throw new Error('Could not find that record.');

  const session = await stripeCall<{ url: string }>('/checkout/sessions', {
    mode: 'payment',
    customer_email: (pending as any).email,
    customer_creation: 'always',
    payment_method_types: ['us_bank_account', 'card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: cents,
        product_data: { name: 'Relève search deposit' }
      },
      quantity: 1
    }],
    payment_intent_data: {
      setup_future_usage: 'off_session',
      metadata: { search_id: searchId }
    },
    expires_at: checkoutExpiry(),
    success_url: `${SITE}/pay/done`,
    cancel_url: `${SITE}/pay/done?cancelled=1`,
    metadata: { search_id: searchId }
  });
  return session.url;
}

/* The full-page lock. Only at fourteen days unpaid, which is the line the
   terms draw for suspending a placement. Before that, a failed charge or a
   late invoice is a banner (billingNoticeFor), not a locked door (B23). */
export async function unpaidInvoiceFor(clientId: string): Promise<{
  id: string; number: string | null; amount_cents: number; due_on: string | null; failed: boolean;
} | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const lockFrom = addDaysISO(todayInPacific(), -14);
  const { data } = await sb.from('invoices')
    .select('id, number, amount_cents, due_on, status')
    .eq('client_id', clientId).in('status', ['sent', 'failed']).gt('amount_cents', 0)
    .lte('due_on', lockFrom).not('sent_at', 'is', null)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(1).maybeSingle();
  if (!data) return null;
  return {
    id: (data as any).id, number: (data as any).number, amount_cents: (data as any).amount_cents,
    due_on: (data as any).due_on, failed: (data as any).status === 'failed'
  };
}

/* The grace banner: something is open and not yet at the fourteen-day line.
   A failed autopay shows here first, with the days left to settle it. */
export async function billingNoticeFor(clientId: string): Promise<{
  id: string; number: string | null; amount_cents: number; failed: boolean; daysLate: number; daysLeft: number;
} | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const today = todayInPacific();
  const { data } = await sb.from('invoices')
    .select('id, number, amount_cents, due_on, status')
    .eq('client_id', clientId).in('status', ['sent', 'failed']).gt('amount_cents', 0)
    .order('due_on', { ascending: true, nullsFirst: false });
  const rows = ((data ?? []) as any[]).filter(r => r.status === 'failed' || (r.due_on && r.due_on < today));
  if (!rows.length) return null;
  const r = rows[0];
  const late = r.due_on ? Math.max(0, Math.round((Date.parse(today) - Date.parse(r.due_on)) / 86_400_000)) : 0;
  return {
    id: r.id, number: r.number, amount_cents: r.amount_cents, failed: r.status === 'failed',
    daysLate: late, daysLeft: Math.max(0, 14 - late)
  };
}

/* The Checkout session for one invoice, shared by the in-app pay button and
   the emailed pay link. The open session is recorded on the invoice, so
   autopay cannot charge it a second time while the client is paying (B11). */
async function checkoutForInvoice(clientId: string, email: string, name: string | null, invoiceId: string): Promise<string> {
  const db = adminClient();
  const { data: inv } = await db.from('invoices')
    .select('id, client_id, amount_cents, status, kind, number').eq('id', invoiceId).maybeSingle();
  if (!inv || (inv as any).client_id !== clientId) throw new Error('That invoice could not be found.');
  if (!['sent', 'failed'].includes((inv as any).status)) throw new Error('That invoice is already settled.');
  if ((inv as any).amount_cents <= 0) throw new Error('There is nothing to pay on that invoice.');

  const customer = await customerFor(clientId, email, name);
  const expires = checkoutExpiry();
  const session = await stripeCall<{ id: string; url: string }>('/checkout/sessions', {
    mode: 'payment',
    customer,
    payment_method_types: ['us_bank_account', 'card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: (inv as any).amount_cents,
        product_data: {
          name: `Relève ${(inv as any).kind === 'deposit' ? 'search deposit' : 'monthly retainer'}` +
                `${(inv as any).number ? ` · ${(inv as any).number}` : ''}`
        }
      },
      quantity: 1
    }],
    payment_intent_data: {
      setup_future_usage: 'off_session',
      metadata: { invoice_id: invoiceId, client_id: clientId }
    },
    expires_at: expires,
    success_url: `${SITE}/app/billing?paid=done`,
    cancel_url: `${SITE}/app/billing?paid=cancelled`,
    metadata: { client_id: clientId, invoice_id: invoiceId }
  });
  await holdForCheckout(invoiceId, session.id, expires);
  return session.url;
}

export async function startInvoicePayment(
  clientId: string, email: string, name: string | null, invoiceId: string
): Promise<string> {
  return checkoutForInvoice(clientId, email, name, invoiceId);
}

/* What the invoice pay-link page shows before anyone presses a button. */
export async function invoiceLinkSummary(invoiceId: string): Promise<{
  ok: boolean; settled: boolean; number: string | null; cents: number; kind: string | null; who: string | null;
}> {
  const none = { ok: false, settled: false, number: null, cents: 0, kind: null, who: null };
  if (!hasServiceKey()) return none;
  const { data: inv } = await adminClient().from('invoices')
    .select('id, number, amount_cents, status, kind, client:client_id(full_name, org_name)')
    .eq('id', invoiceId).maybeSingle();
  if (!inv) return none;
  const base = {
    number: (inv as any).number ?? null, cents: (inv as any).amount_cents ?? 0, kind: (inv as any).kind ?? null,
    who: (inv as any).client?.org_name ?? (inv as any).client?.full_name ?? null
  };
  const open = ['sent', 'failed'].includes((inv as any).status) && (inv as any).amount_cents > 0;
  return { ...base, ok: open, settled: !open };
}

export async function startInvoicePaymentForInvoice(invoiceId: string): Promise<string> {
  const db = adminClient();
  const { data: inv } = await db.from('invoices').select('client_id').eq('id', invoiceId).maybeSingle();
  if (!inv) throw new Error('That invoice no longer exists.');
  const clientId = (inv as any).client_id as string;
  const { data: profile } = await db.from('profiles').select('email, full_name').eq('id', clientId).maybeSingle();
  if (!profile) throw new Error('Could not find that account.');
  return checkoutForInvoice(clientId, (profile as any).email, (profile as any).full_name ?? null, invoiceId);
}

/* Charge an issued invoice against the mandate already on file.
   ------------------------------------------------------------
   off_session, because the executive agreed to this when they set the
   mandate up. The invoice goes to 'processing' and stays there until the
   webhook says otherwise. The caller has already checked this is the team:
   the claim itself runs with the service key, because the database lets only
   Stripe's side move an invoice into or out of 'processing'. */
export async function chargeInvoice(invoiceId: string): Promise<{ status: string; intent: string }> {
  const db = adminClient();

  const { data: inv } = await db.from('invoices')
    .select('id, number, client_id, amount_cents, status, kind, charge_attempts, checkout_expires_at')
    .eq('id', invoiceId).maybeSingle();
  if (!inv) throw new Error('That invoice does not exist.');
  const row = inv as any;
  if (row.amount_cents <= 0) throw new Error('There is nothing to collect on that invoice.');
  if (row.status === 'draft') throw new Error('Send the invoice first. A draft is never charged.');
  if (!['sent', 'failed'].includes(row.status))
    throw new Error(`That invoice is already ${row.status}.`);
  if (row.checkout_expires_at && Date.parse(row.checkout_expires_at) > Date.now())
    throw new Error('The client has the payment page for this invoice open right now. Try again in half an hour.');

  const acct = await billingAccount(row.client_id, db);
  if (!acct?.payment_method || !acct.stripe_customer || !acct.mandate_ok)
    throw new Error('That client has no payment method on file yet. Ask them to set one up from their billing page.');

  /* Claim before Stripe is called: a conditional update that only one caller
     can win, so autopay and the client's own pay button cannot both charge. */
  const attempt = (row.charge_attempts ?? 0) + 1;
  const { data: claimed, error: claimErr } = await db.from('invoices')
    .update({ status: 'processing', charge_attempts: attempt })
    .eq('id', invoiceId).in('status', ['sent', 'failed']).eq('charge_attempts', row.charge_attempts ?? 0)
    .select('id').maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) throw new Error('That invoice is already being paid.');

  let intent: { id: string; status: string };
  try {
    intent = await stripeCall<{ id: string; status: string }>('/payment_intents', {
      amount: row.amount_cents,
      currency: 'usd',
      customer: acct.stripe_customer,
      payment_method: acct.payment_method,
      payment_method_types: [acct.method_kind ?? 'us_bank_account'],
      off_session: true,
      confirm: true,
      description: `Relève ${row.kind} · ${row.number ?? invoiceId}`,
      metadata: { invoice_id: invoiceId, client_id: row.client_id, attempt: String(attempt) }
    }, {
      /* One key per attempt, amount and payment method: a double click or a
         retried request inside one attempt is still a single charge, and a
         genuine retry after a failure is not blocked for a day (B12). */
      idempotencyKey: `invoice:${invoiceId}:a${attempt}:${row.amount_cents}:${acct.payment_method}`
    });
  } catch (e: any) {
    await db.from('invoices')
      .update({ status: 'failed', failure_reason: String(e?.message ?? 'The charge did not go through.').slice(0, 300) })
      .eq('id', invoiceId).eq('status', 'processing');
    throw e;
  }

  const { error } = await db.from('invoices').update({
    stripe_payment_intent: intent.id,
    charged_at: new Date().toISOString(),
    failure_reason: null
  }).eq('id', invoiceId);
  if (error) throw new Error(error.message);

  return { status: intent.status, intent: intent.id };
}

/* A refund, started by the owner. Stripe does the moving; the webhook
   (charge.refunded) records it on the invoice when it is done. */
export async function refundInvoice(invoiceId: string, cents?: number | null): Promise<{ refund: string; cents: number }> {
  const db = adminClient();
  const { data: inv } = await db.from('invoices')
    .select('id, amount_cents, refunded_cents, status, stripe_payment_intent').eq('id', invoiceId).maybeSingle();
  if (!inv) throw new Error('That invoice does not exist.');
  const row = inv as any;
  if (!['paid', 'disputed'].includes(row.status)) throw new Error('Only a paid invoice can be refunded.');
  if (row.status === 'disputed') throw new Error('That payment is disputed. Stripe settles it through the dispute instead.');
  if (!row.stripe_payment_intent)
    throw new Error('That invoice was paid outside Stripe. Return the money the way it came, then void the invoice.');
  const left = row.amount_cents - (row.refunded_cents ?? 0);
  const amount = cents == null ? left : Math.round(cents);
  if (!Number.isInteger(amount) || amount <= 0 || amount > left)
    throw new Error(`A refund here can be up to ${money(left, true)}.`);

  const refund = await stripeCall<{ id: string }>('/refunds', {
    payment_intent: row.stripe_payment_intent,
    amount,
    metadata: { invoice_id: invoiceId }
  }, { idempotencyKey: `refund:${invoiceId}:${row.refunded_cents ?? 0}:${amount}` });
  return { refund: refund.id, cents: amount };
}

/* ---------- the fourteen-day pause ---------- */

/* Lifts any pause on this client's placements once nothing of theirs is
   fourteen days unpaid. Tells both sides, warmly. Safe to call any time. */
export async function liftSuspensionIfClear(db: SupabaseClient, clientId: string): Promise<number> {
  const lockFrom = addDaysISO(todayInPacific(), -14);
  const { data: stillLate } = await db.from('invoices')
    .select('id').eq('client_id', clientId).in('status', ['sent', 'failed'])
    .gt('amount_cents', 0).lte('due_on', lockFrom).limit(1);
  if ((stillLate ?? []).length) return 0;

  const { data: lifted, error } = await db.from('placements')
    .update({ suspended_at: null, suspended_reason: null, resumed_at: new Date().toISOString() })
    .eq('client_id', clientId).not('suspended_at', 'is', null)
    .select('id, client:client_id(full_name, email), talent:talent_id(full_name, email)');
  if (error) { console.error('[billing] could not lift the pause', clientId, error.message); return 0; }

  for (const p of (lifted ?? []) as any[]) {
    const exec = p.client, talent = p.talent;
    const first = (s: string | null | undefined) => String(s ?? '').trim().split(/\s+/)[0] || 'there';
    if (exec?.email) await send(exec.email, billingTemplates.placementResumed({
      name: first(exec.full_name), withWhom: talent?.full_name ?? 'your placement', side: 'client' }));
    if (talent?.email) await send(talent.email, billingTemplates.placementResumed({
      name: first(talent.full_name), withWhom: exec?.full_name ?? 'your executive', side: 'talent' }));
  }
  return (lifted ?? []).length;
}
