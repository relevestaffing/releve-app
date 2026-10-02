import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyWebhook, webhookReady, stripeCall } from '@/lib/stripe';
import { send, templates } from '@/lib/email';
import { billingTemplates } from '@/lib/email-billing';
import { adminClient, liftSuspensionIfClear, tellTeam } from '@/lib/billing';
import { hasServiceKey } from '@/lib/supabase/admin';
import { money, todayInPacific } from '@/lib/money-public';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* The only thing in this platform allowed to say money arrived.
   ------------------------------------------------------------
   Runs with the service role because Stripe is not signed in as anybody. That
   is safe only because the signature is checked first: an unsigned request
   never reaches a single database call.

   Every write is guarded by the status it expects to find, so an event that
   arrives late or out of order can never undo a later truth: a processing
   event cannot turn a paid invoice back into clearing, a failure cannot flip
   a paid invoice to failed, and a success cannot revive a void one (B14).
   Every write's error is checked and thrown, so Stripe retries rather than
   the event being marked handled with nothing recorded. */

type DB = SupabaseClient;

const first = (s: unknown) => String(s ?? '').trim().split(/\s+/)[0] || 'there';

function must<T extends { error: any }>(r: T, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message ?? r.error}`);
  return r;
}

async function invoiceById(db: DB, id: string) {
  const r = must(await db.from('invoices')
    .select('id, number, amount_cents, refunded_cents, status, kind, client_id, search_id, stripe_payment_intent, client:client_id(full_name, email, org_name)')
    .eq('id', id).maybeSingle(), 'read invoice');
  return r.data as any;
}

async function invoiceByIntent(db: DB, intent: string) {
  const r = must(await db.from('invoices')
    .select('id, number, amount_cents, refunded_cents, status, kind, client_id, client:client_id(full_name, email, org_name)')
    .eq('stripe_payment_intent', intent).maybeSingle(), 'read invoice by intent');
  return r.data as any;
}

/* A saved payment method, described for the client without ever holding an
   account number: the brand or bank, and the last four. */
async function describeMethod(pmId: string) {
  const pm: any = await stripeCall(`/payment_methods/${pmId}`);
  const kind = pm.type === 'card' ? 'card' : 'us_bank_account';
  const detail = pm.type === 'card' ? pm.card : pm.us_bank_account;
  return {
    id: pm.id as string,
    kind,
    bank: pm.type === 'card' ? (detail?.brand ?? null) : (detail?.bank_name ?? null),
    last4: detail?.last4 ?? null
  };
}

async function saveMandate(db: DB, clientId: string, customer: string | null, pmId: string) {
  const m = await describeMethod(pmId);
  must(await db.from('billing_accounts').upsert({
    client_id: clientId,
    ...(customer ? { stripe_customer: customer } : {}),
    payment_method: m.id,
    method_kind: m.kind,
    bank_name: m.bank,
    last4: m.last4,
    mandate_ok: true,
    set_up_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'client_id' }), 'save payment method');
}

const customerId = (c: any): string | null => (typeof c === 'string' ? c : c?.id ?? null);

export async function POST(req: Request) {
  if (!webhookReady())
    return NextResponse.json({ error: 'no webhook secret configured' }, { status: 503 });

  const raw = await req.text();

  let event: any;
  try {
    event = verifyWebhook(raw, req.headers.get('stripe-signature'));
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }

  if (!hasServiceKey()) return NextResponse.json({ error: 'server not configured' }, { status: 500 });
  const sb = adminClient();

  /* Stripe retries until it gets a 200. The primary key is the idempotency:
     a repeat insert fails, and we stop before doing anything twice. */
  const { error: seen } = await sb.from('stripe_events')
    .insert({ id: event.id, type: event.type, summary: null });
  if (seen) return NextResponse.json({ ok: true, note: 'already handled' });

  const obj = event.data?.object ?? {};
  let summary = 'handled';

  try {
    switch (event.type) {
      /* ---------- Checkout finished ---------- */
      case 'checkout.session.completed': {
        const clientId: string | null = obj.metadata?.client_id ?? null;
        const searchId: string | null = obj.metadata?.search_id ?? null;
        const invoiceId: string | null = obj.metadata?.invoice_id ?? null;
        const customer = customerId(obj.customer);

        if (obj.mode === 'setup' && obj.setup_intent) {
          const si: any = await stripeCall(`/setup_intents/${obj.setup_intent}`);
          const owner = clientId ?? si.metadata?.client_id ?? null;
          const pm = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
          if (owner && pm) await saveMandate(sb, owner, customerId(si.customer) ?? customer, pm);
          else summary = 'setup with no client to attach it to';
          break;
        }

        /* A payment Checkout. The Stripe customer Checkout created (or used)
           is kept, so the mandate it saves is never orphaned (B16). */
        if (clientId && customer) {
          must(await sb.from('billing_accounts').upsert({
            client_id: clientId, stripe_customer: customer, updated_at: new Date().toISOString()
          }, { onConflict: 'client_id', ignoreDuplicates: true }), 'keep checkout customer');
        } else if (searchId && customer) {
          must(await sb.from('searches').update({ deposit_stripe_customer: customer })
            .eq('id', searchId).is('client_id', null), 'keep pre-signup customer');
        }
        /* The session is used: autopay may charge this invoice again if the
           payment itself later fails. */
        if (invoiceId) must(await sb.from('invoices')
          .update({ checkout_session: null, checkout_expires_at: null })
          .eq('id', invoiceId).eq('checkout_session', obj.id), 'release checkout hold');
        break;
      }

      case 'checkout.session.expired': {
        const invoiceId = obj.metadata?.invoice_id;
        if (invoiceId) must(await sb.from('invoices')
          .update({ checkout_session: null, checkout_expires_at: null })
          .eq('id', invoiceId).eq('checkout_session', obj.id), 'release expired checkout');
        break;
      }

      /* A setup completed outside Checkout's own event (kept for older flows). */
      case 'setup_intent.succeeded': {
        const owner = obj.metadata?.client_id ?? null;
        const pm = typeof obj.payment_method === 'string' ? obj.payment_method : obj.payment_method?.id;
        if (owner && pm) await saveMandate(sb, owner, customerId(obj.customer), pm);
        break;
      }

      /* ---------- money in flight ---------- */
      case 'payment_intent.processing': {
        const id = obj.metadata?.invoice_id;
        if (id) {
          must(await sb.from('invoices').update({
            status: 'processing', stripe_payment_intent: obj.id, failure_reason: null,
            checkout_session: null, checkout_expires_at: null
          }).eq('id', id).in('status', ['draft', 'sent', 'failed', 'processing']), 'mark clearing');
          const inv = await invoiceById(sb, id);
          if (inv?.client_id) await liftSuspensionIfClear(sb, inv.client_id);
        }
        const searchId = obj.metadata?.search_id;
        if (searchId) must(await sb.from('searches').update({
          deposit_status: 'processing', deposit_payment_intent: obj.id
        }).eq('id', searchId).eq('deposit_status', 'due'), 'mark deposit clearing');
        break;
      }

      /* ---------- the money is real ---------- */
      case 'payment_intent.succeeded': {
        const id = obj.metadata?.invoice_id;
        const on = todayInPacific();
        if (id) {
          const res = must(await sb.from('invoices').update({
            status: 'paid', paid_on: on, stripe_payment_intent: obj.id, failure_reason: null,
            checkout_session: null, checkout_expires_at: null
          }).eq('id', id).in('status', ['draft', 'sent', 'failed', 'processing'])
            .select('id'), 'mark paid');
          const inv = await invoiceById(sb, id);
          const who: any = inv?.client;

          if ((res.data ?? []).length) {
            if (who?.email) await send(who.email, templates.paymentReceived({
              name: first(who.full_name), number: inv?.number ?? '', amount: money(inv?.amount_cents ?? obj.amount)
            }));
            if (inv?.client_id) await liftSuspensionIfClear(sb, inv.client_id);
          } else if (inv && inv.stripe_payment_intent !== obj.id) {
            /* Already paid by another payment, or void: money arrived that the
               ledger cannot place. Say so the same minute. */
            summary = `unplaced payment on a ${inv.status} invoice`;
            await tellTeam(() => billingTemplates.moneyNeedsALook({
              headline: inv.status === 'paid' ? 'An invoice was paid twice' : `A payment arrived on a ${inv.status} invoice`,
              detail: `${who?.org_name ?? who?.full_name ?? 'A client'} paid ${money(obj.amount)} against invoice ${inv.number ?? id}, which is already ${inv.status}. Refund the extra payment from Billing, or apply it as the client prefers. Stripe payment ${obj.id}.`
            }));
          }
        }

        /* A search deposit opens the search, from here rather than the browser. */
        const searchId = obj.metadata?.search_id;
        if (searchId) {
          must(await sb.from('searches').update({
            deposit_status: 'paid', deposit_paid_on: on, deposit_payment_intent: obj.id
          }).eq('id', searchId).in('deposit_status', ['due', 'processing']), 'mark deposit paid');
        }

        /* The payment method used is the account's mandate from now on. */
        const pmId = typeof obj.payment_method === 'string' ? obj.payment_method : obj.payment_method?.id;
        const customer = customerId(obj.customer);
        if (pmId && obj.metadata?.client_id) {
          await saveMandate(sb, obj.metadata.client_id, customer, pmId);
        } else if (pmId && searchId) {
          /* Paid before an account existed: kept on the search, and it becomes
             the account's mandate the moment the account is claimed. */
          const m = await describeMethod(pmId);
          must(await sb.from('searches').update({
            deposit_stripe_customer: customer, deposit_payment_method: m.id,
            deposit_method_kind: m.kind, deposit_bank_name: m.bank, deposit_last4: m.last4
          }).eq('id', searchId).is('client_id', null), 'keep pre-signup mandate');
        }
        break;
      }

      /* ---------- it did not go through ---------- */
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        const canceled = event.type === 'payment_intent.canceled';
        const reason = canceled
          ? 'The payment was cancelled before it completed.'
          : (obj.last_payment_error?.message ?? 'The bank did not accept it.');
        const id = obj.metadata?.invoice_id;
        if (id) {
          /* Only an invoice this payment was actually collecting. A paid one
             stays paid. A card declined on the Checkout page itself is seen
             there and then, so only a collection that was already clearing
             (autopay, a bank debit) is written to anyone about. */
          const before = await invoiceById(sb, id);
          const res = must(await sb.from('invoices').update({
            status: canceled ? 'sent' : 'failed',
            failure_reason: canceled ? null : reason,
            checkout_session: null, checkout_expires_at: null
          }).eq('id', id).in('status', ['sent', 'failed', 'processing'])
            .or(`stripe_payment_intent.is.null,stripe_payment_intent.eq.${obj.id}`)
            .select('id'), 'mark failed');

          if (!canceled && (res.data ?? []).length && before?.status === 'processing') {
            const who: any = before.client;
            const amount = money(before.amount_cents ?? obj.amount ?? 0);
            const number = before.number ?? '';
            if (before.kind !== 'deposit' && who?.email) {
              await send(who.email, templates.paymentFailed({ name: first(who.full_name), number, amount }));
            }
            await tellTeam(() => templates.paymentFailedTeam({
              client: who?.org_name ?? who?.full_name ?? 'A client', number, amount, reason }));
          }
        }

        /* A deposit that did not clear goes back to due, and the payer is told
           how to try again (B16). A deposit already marked paid by hand stays. */
        const searchId = obj.metadata?.search_id;
        if (searchId && !canceled) {
          const res = must(await sb.from('searches').update({ deposit_status: 'due', deposit_payment_intent: null })
            .eq('id', searchId).eq('deposit_status', 'processing').select('id'), 'deposit back to due');
          const { data: s } = await sb.from('searches')
            .select('deposit_cents, client:client_id(full_name, email, org_name), pending:pending_id(full_name, email, org_name)')
            .eq('id', searchId).maybeSingle();
          const person: any = (s as any)?.client ?? (s as any)?.pending;
          const amount = money((s as any)?.deposit_cents ?? obj.amount ?? 50_000);
          if ((res.data ?? []).length) {
            let payUrl: string | undefined;
            try {
              const { depositLinkReady, signDepositLink } = await import('@/lib/deposit-link');
              const { SITE } = await import('@/lib/stripe');
              if (depositLinkReady()) payUrl = `${SITE}/pay/${signDepositLink(searchId)}`;
            } catch { /* the app link still works */ }
            if (person?.email) await send(person.email, billingTemplates.depositFailed({
              name: first(person.full_name), amount, payUrl }));
            await tellTeam(() => billingTemplates.depositFailedTeam({
              who: person?.org_name ?? person?.full_name ?? 'A new client', amount, reason }));
          }
        }
        break;
      }

      /* ---------- money going back ---------- */
      case 'charge.refunded': {
        const intent = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        if (!intent) break;
        const inv = await invoiceByIntent(sb, intent);
        if (!inv) { summary = 'refund on a payment with no invoice'; break; }
        const refunded = Number(obj.amount_refunded ?? 0);
        const full = refunded >= inv.amount_cents;
        must(await sb.from('invoices').update({
          refunded_cents: refunded,
          refunded_on: todayInPacific(),
          ...(full && inv.status !== 'disputed' ? { status: 'refunded' } : {})
        }).eq('id', inv.id), 'record refund');
        const who: any = inv.client;
        const newly = refunded - (inv.refunded_cents ?? 0);
        if (newly > 0 && who?.email) await send(who.email, billingTemplates.refundIssued({
          name: first(who.full_name), number: inv.number ?? '', amount: money(newly, true), full }));
        break;
      }

      case 'charge.dispute.created':
      case 'charge.dispute.closed':
      case 'charge.dispute.updated': {
        const intent = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        if (!intent) break;
        const inv = await invoiceByIntent(sb, intent);
        if (!inv) { summary = 'dispute on a payment with no invoice'; break; }
        const who: any = inv.client;
        const client = who?.org_name ?? who?.full_name ?? 'A client';

        if (event.type === 'charge.dispute.created') {
          must(await sb.from('invoices').update({
            status: 'disputed', dispute_id: obj.id, dispute_status: obj.status ?? 'needs_response',
            disputed_at: new Date().toISOString()
          }).eq('id', inv.id).in('status', ['paid', 'processing', 'refunded', 'disputed']), 'mark disputed');
          await tellTeam(() => billingTemplates.disputeTeam({
            client, number: inv.number ?? '', amount: money(obj.amount ?? inv.amount_cents), state: 'opened', reason: obj.reason ?? null }));
        } else if (event.type === 'charge.dispute.updated') {
          must(await sb.from('invoices').update({ dispute_status: obj.status ?? null })
            .eq('id', inv.id), 'update dispute');
        } else {
          const won = obj.status === 'won' || obj.status === 'warning_closed';
          const lost = obj.status === 'lost';
          must(await sb.from('invoices').update({
            dispute_status: obj.status ?? 'closed',
            status: lost ? 'refunded' : 'paid',
            ...(lost ? { refunded_cents: inv.amount_cents, refunded_on: todayInPacific(), failure_reason: 'Dispute decided for the client.' } : {})
          }).eq('id', inv.id).eq('status', 'disputed'), 'close dispute');
          await tellTeam(() => billingTemplates.disputeTeam({
            client, number: inv.number ?? '', amount: money(obj.amount ?? inv.amount_cents),
            state: won ? 'won' : lost ? 'lost' : 'closed', reason: obj.reason ?? null }));
        }
        break;
      }

      /* ---------- the mandate itself ---------- */
      case 'payment_method.detached': {
        must(await sb.from('billing_accounts')
          .update({ mandate_ok: false, updated_at: new Date().toISOString() })
          .eq('payment_method', obj.id), 'mark detached');
        break;
      }

      /* A bank debit mandate can be revoked by the customer at their bank.
         Autopay stops at once rather than failing every month (B10). */
      case 'mandate.updated': {
        const pm = typeof obj.payment_method === 'string' ? obj.payment_method : obj.payment_method?.id;
        if (!pm) break;
        const ok = obj.status === 'active';
        must(await sb.from('billing_accounts')
          .update({ mandate_ok: ok, updated_at: new Date().toISOString() })
          .eq('payment_method', pm), 'update mandate');
        if (!ok) {
          const { data: acct } = await sb.from('billing_accounts')
            .select('client:client_id(full_name, org_name)').eq('payment_method', pm).maybeSingle();
          const who: any = (acct as any)?.client;
          if (who) await tellTeam(() => billingTemplates.moneyNeedsALook({
            headline: 'A bank mandate was withdrawn',
            detail: `${who.org_name ?? who.full_name}'s bank debit mandate is no longer active, so autopay is off for them. Their next invoice will need paying from their billing page, or a new account linked.`
          }));
        }
        break;
      }

      default:
        summary = 'ignored';
    }
  } catch (e: any) {
    /* Something went wrong handling a genuine, signed event. 500 so Stripe
       retries, and the event row is removed so the retry is not dismissed as
       a duplicate. */
    console.error('[stripe webhook]', event.type, event.id, e);
    await sb.from('stripe_events').delete().eq('id', event.id);
    return NextResponse.json({ error: safeMessage(e) }, { status: 500 });
  }

  await sb.from('stripe_events').update({ summary }).eq('id', event.id);
  return NextResponse.json({ ok: true });
}
