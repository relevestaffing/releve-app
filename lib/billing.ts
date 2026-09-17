import { createClient } from '@supabase/supabase-js';
import { configured, supabaseServer } from './supabase/server';
import { stripeCall, SITE } from './stripe';
import { invoiceDeposit } from './money';
import type { Invoice } from './money-public';

/* Where the money actually moves.
   ------------------------------
   Everything above this was a record of something that happened elsewhere:
   an invoice was a note that a client owed money, and paid meant somebody had
   ticked a box. This is the part that charges.

   One rule runs through all of it: nothing here marks an invoice paid. Bank
   debit clears days after it is accepted and can still fail afterwards, so
   the only thing allowed to say money arrived is the webhook, which is Stripe
   telling us it landed. The buttons submit; Stripe decides. */

export type { BillingAccount } from './billing-public';
import type { BillingAccount } from './billing-public';

/* billing_accounts has no insert or update policy for a client, on purpose —
   "everything on this row comes from Stripe through the webhook" is the rule
   the schema itself states. Recording the Stripe customer id the first time
   an executive starts a Checkout session is that same rule's setup step, not
   an exception to it: nothing here decides money moved, it only remembers
   which Stripe customer this account is. Built the same way the webhook
   already is, with the service key, rather than the signed-in session. */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.SUPABASE_SECRET_KEY
           ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Server is missing its Supabase service key.');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function billingAccount(clientId: string): Promise<BillingAccount | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('billing_accounts').select('*').eq('client_id', clientId).maybeSingle();
  return (data as BillingAccount) ?? null;
}

/* Stripe needs a customer before it can hold a mandate. Made once, reused for
   the life of the account — a second customer for the same executive would
   split their payment history in two. */
async function customerFor(clientId: string, email: string, name: string | null): Promise<string> {
  const existing = await billingAccount(clientId);
  if (existing?.stripe_customer) return existing.stripe_customer;

  const customer = await stripeCall<{ id: string }>('/customers', {
    email, name: name ?? undefined,
    metadata: { client_id: clientId, source: 'releve' }
  }, { idempotencyKey: `customer:${clientId}` });

  const { error } = await adminClient().from('billing_accounts')
    .upsert({ client_id: clientId, stripe_customer: customer.id, updated_at: new Date().toISOString() },
            { onConflict: 'client_id' });
  if (error) throw new Error(error.message);
  return customer.id;
}

/* The executive links their bank once.
   -----------------------------------
   Checkout in setup mode rather than a form of our own: Stripe handles the
   bank login, the micro-deposit fallback and the mandate wording, all of
   which are regulated and none of which are worth rebuilding. Nothing is
   charged here — this only puts the mandate on file. */
export async function startPaymentSetup(clientId: string, email: string, name: string | null): Promise<string> {
  const customer = await customerFor(clientId, email, name);
  const session = await stripeCall<{ url: string }>('/checkout/sessions', {
    mode: 'setup',
    customer,
    /* Bank debit first. On a $3,500 retainer it costs a few dollars where a
       card costs about a hundred, which over a year is the difference between
       a rounding error and a salary. Card stays available for anyone whose
       bank will not link. */
    payment_method_types: ['us_bank_account', 'card'],
    success_url: `${SITE}/app/billing?setup=done`,
    cancel_url: `${SITE}/app/billing?setup=cancelled`,
    metadata: { client_id: clientId }
  });
  return session.url;
}

/* Whether an executive's open search is waiting on its deposit — read from
   their own session, since "read own search" already lets them see this.
   Null means no open search (nothing to gate on: not hiring, or already
   placed). Paid and waived both read as cleared; only 'due' blocks. */
export async function depositGateFor(clientId: string): Promise<{
  searchId: string; status: 'due' | 'paid' | 'waived'; cents: number;
} | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  /* Newest open search first — two open rows made maybeSingle() error, the
     error was discarded, and the gate fell open. */
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

/* The Checkout session itself, for an executive whose account already
   exists. Shared by the in-app "pay your deposit" button and the emailed
   link, once it lands on someone who has already signed in by the time
   they click it — both know the client id, and both want the same
   invoice, the same saved mandate, the same success page. */
async function checkoutForClaimedDeposit(
  clientId: string, email: string, name: string | null, searchId: string, cents: number
): Promise<string> {
  const invoice = await invoiceDeposit(searchId, clientId, adminClient()) as Invoice | null;
  if (!invoice) throw new Error('Could not prepare that invoice.');
  if (invoice.status === 'paid' || invoice.status === 'processing')
    throw new Error('That deposit is already settled.');

  const customer = await customerFor(clientId, email, name);
  const session = await stripeCall<{ url: string }>('/checkout/sessions', {
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
    success_url: `${SITE}/app?deposit=done`,
    cancel_url: `${SITE}/app?deposit=cancelled`,
    metadata: { client_id: clientId, search_id: searchId }
  });
  return session.url;
}

/* The executive pays their own $500 search deposit, from inside the app.
   ------------------------------------------------------------------
   One Checkout session, mode 'payment', for the exact amount on their
   search. setup_future_usage saves whatever they pay with as the mandate
   for their monthly retainer too — one screen clears the deposit and links
   their bank, rather than making them do both separately. Stripe's webhook
   is still the only thing that marks the invoice paid or the deposit
   cleared; this only opens the page they pay on. */
export async function startDepositPayment(clientId: string, email: string, name: string | null): Promise<string> {
  const gate = await depositGateFor(clientId);
  if (!gate) throw new Error('There is no open search to pay a deposit on.');
  if (gate.status !== 'due') throw new Error('That deposit is already settled.');
  return checkoutForClaimedDeposit(clientId, email, name, gate.searchId, gate.cents);
}

/* The same deposit, paid from the onboarding email — routinely before the
   person has ever signed in. No session to read, so this takes the search
   id straight from a signed link instead and looks everything up with the
   service key: who they are comes from profiles once claimed, or from the
   pending_people record Relève filed after the discovery call if not.

   A pending person has no client_id yet, so there is nowhere to save a
   mandate to — Checkout still collects one (setup_future_usage asks it to),
   it just is not attached to anyone's account until they sign up, at which
   point the retainer flow makes its own when they get there. What must not
   wait is the deposit itself: the webhook marks the search paid the moment
   Stripe confirms it, gate and all, invoice or no invoice yet. */
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
    /* Always, not the default — there is no client_id yet to have already
       created one, so Checkout has to make one from scratch every time. */
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
    success_url: `${SITE}/?deposit=done`,
    cancel_url: `${SITE}/?deposit=cancelled`,
    metadata: { search_id: searchId }
  });
  return session.url;
}

/* Whether this executive has anything asked for and not yet settled —
   checked regardless of hiring/placed stage, so a retainer invoice gates
   the dashboard exactly the same way the opening deposit does. 'processing'
   does not gate: the money is already moving, and blocking someone mid
   clearing would only be annoying, not useful. Oldest due date first, since
   that is the one that has been waiting longest. */
export async function unpaidInvoiceFor(clientId: string): Promise<{
  id: string; number: string | null; amount_cents: number; due_on: string | null; failed: boolean;
} | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  /* The gate closes on the terms' own line, not on the day of sending: an
     invoice is due on receipt, and the placement may be suspended once it is
     fourteen days unpaid. Gating the whole account the morning a retainer
     went out locked a paying client out of their own placement page for
     opening an email — a failed payment gates at once, since the money was
     meant to have moved. */
  const grace = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb.from('invoices')
    .select('id, number, amount_cents, due_on, status')
    .eq('client_id', clientId).in('status', ['sent', 'failed']).gt('amount_cents', 0)
    .or(`status.eq.failed,due_on.lte.${grace}`)
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(1).maybeSingle();
  if (!data) return null;
  return {
    id: (data as any).id, number: (data as any).number, amount_cents: (data as any).amount_cents,
    due_on: (data as any).due_on, failed: (data as any).status === 'failed'
  };
}

/* The Checkout session for one invoice, shared by the in-app "pay this
   invoice" button (InvoiceGate) and the emailed pay-now link — both know
   the invoice id and want the same amount, the same saved mandate, the
   same success page. The same shape as checkoutForClaimedDeposit above. */
async function checkoutForInvoice(clientId: string, email: string, name: string | null, invoiceId: string): Promise<string> {
  const db = adminClient();
  const { data: inv } = await db.from('invoices')
    .select('id, client_id, amount_cents, status, kind, number').eq('id', invoiceId).maybeSingle();
  if (!inv || (inv as any).client_id !== clientId) throw new Error('That invoice could not be found.');
  if (!['sent', 'failed'].includes((inv as any).status)) throw new Error('That invoice is already settled.');
  if ((inv as any).amount_cents <= 0) throw new Error('There is nothing to pay on that invoice.');

  const customer = await customerFor(clientId, email, name);
  const session = await stripeCall<{ url: string }>('/checkout/sessions', {
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
    success_url: `${SITE}/app?paid=done`,
    cancel_url: `${SITE}/app?paid=cancelled`,
    metadata: { client_id: clientId, invoice_id: invoiceId }
  });
  return session.url;
}

/* The executive paying one of their own invoices from inside the app,
   on-session, their own click — what InvoiceGate's button calls. */
export async function startInvoicePayment(
  clientId: string, email: string, name: string | null, invoiceId: string
): Promise<string> {
  return checkoutForInvoice(clientId, email, name, invoiceId);
}

/* The same payment, followed from the invoice email — routinely before the
   person has signed back in. No session to read, so this takes the invoice
   id straight from a signed link and looks the client up with the service
   key, the same shape startDepositPaymentForSearch already uses. */
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
   off_session, because the executive agreed to this when they set the mandate
   up and is not sitting at a screen. The invoice goes to 'processing' and
   stays there: with bank debit, days pass before the money is real. */
export async function chargeInvoice(invoiceId: string): Promise<{ status: string; intent: string }> {
  const sb = await supabaseServer();

  const { data: inv } = await sb.from('invoices')
    .select('id, number, client_id, amount_cents, status, kind')
    .eq('id', invoiceId).maybeSingle();
  if (!inv) throw new Error('That invoice does not exist.');
  if ((inv as any).amount_cents <= 0)
    throw new Error('That is a credit, not a charge.');
  if (['paid', 'processing', 'void'].includes((inv as any).status))
    throw new Error(`That invoice is already ${(inv as any).status}.`);

  const acct = await billingAccount((inv as any).client_id);
  if (!acct?.payment_method || !acct.stripe_customer || !acct.mandate_ok)
    throw new Error('That client has no payment method on file yet. Ask them to set one up from their billing page.');

  /* Claim the invoice before Stripe is ever called — a conditional update
     that only succeeds if nobody has already claimed it. This is what
     closes the gap where autopay is mid-charge and the same invoice is
     still sitting there as 'sent': without this, the executive's own
     "pay now" button (checkoutForInvoice, which only checks that the
     status is still 'sent' or 'failed') could open a second, entirely
     independent Stripe charge in that window. The instant this succeeds,
     that check sees 'processing' and refuses. */
  const { data: claimed, error: claimErr } = await sb.from('invoices')
    .update({ status: 'processing' })
    .eq('id', invoiceId).in('status', ['sent', 'failed'])
    .select('id').maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) throw new Error('That invoice is already being paid.');

  let intent: { id: string; status: string };
  try {
    intent = await stripeCall<{ id: string; status: string }>('/payment_intents', {
      amount: (inv as any).amount_cents,
      currency: 'usd',
      customer: acct.stripe_customer,
      payment_method: acct.payment_method,
      payment_method_types: [acct.method_kind ?? 'us_bank_account'],
      off_session: true,
      confirm: true,
      description: `Relève ${(inv as any).kind} · ${(inv as any).number ?? invoiceId}`,
      metadata: { invoice_id: invoiceId, client_id: (inv as any).client_id }
    }, {
      /* The invoice id is the key, so a double-clicked Charge button, a retried
         request or a second tab all resolve to the same single payment. */
      idempotencyKey: `invoice:${invoiceId}`
    });
  } catch (e: any) {
    /* Record the failed attempt as 'failed' with the reason, rather than
       reverting to 'sent' where it would look like an invoice nobody had tried
       to charge (M2). A retry still works — the claim above accepts 'sent' or
       'failed' — and the client's own "pay now" link still works, because
       checkoutForInvoice also accepts 'failed'. The money view now shows a
       failed autopay as Failed, with the reason, instead of hiding it. */
    await sb.from('invoices')
      .update({ status: 'failed', failure_reason: String(e?.message ?? 'The charge did not go through.').slice(0, 300) })
      .eq('id', invoiceId).eq('status', 'processing');
    throw e;
  }

  /* Still 'processing', never 'paid' — Stripe's webhook is the only thing
     that gets to say the money actually landed. */
  const { error } = await sb.from('invoices').update({
    status: 'processing',
    stripe_payment_intent: intent.id,
    charged_at: new Date().toISOString(),
    failure_reason: null
  }).eq('id', invoiceId);
  if (error) throw new Error(error.message);

  return { status: intent.status, intent: intent.id };
}
