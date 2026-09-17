import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyWebhook, webhookReady } from '@/lib/stripe';
import { send, templates } from '@/lib/email';
import { money } from '@/lib/money-public';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* The only thing in this platform allowed to say money arrived.
   ------------------------------------------------------------
   Not the Charge button, which only submits, and certainly not the browser.
   Bank debit is accepted first and clears days later, and can still fail
   after being accepted — so anything that marked an invoice paid at the
   moment of charging would be guessing, and would be wrong often enough to
   matter.

   Runs with the service role because Stripe is not signed in as anybody. That
   is safe only because the signature is checked first: an unsigned request
   never reaches a single database call. */
export async function POST(req: Request) {
  if (!webhookReady())
    return NextResponse.json({ error: 'no webhook secret configured' }, { status: 503 });

  /* The raw text, byte for byte. Parsing and re-serialising changes it and
     the signature will never match. */
  const raw = await req.text();

  let event: any;
  try {
    event = verifyWebhook(raw, req.headers.get('stripe-signature'));
  } catch (e: any) {
    /* 400, not 500: this is a rejected request rather than a broken server,
       and Stripe should not retry it. */
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.SUPABASE_SECRET_KEY
           ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'server not configured' }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  /* Stripe retries until it gets a 200 and will redeliver after a timeout.
     The primary key is the idempotency: a repeat insert fails, and we stop
     before doing anything twice. */
  const { error: seen } = await sb.from('stripe_events')
    .insert({ id: event.id, type: event.type, summary: null });
  if (seen) return NextResponse.json({ ok: true, note: 'already handled' });

  const obj = event.data?.object ?? {};

  try {
    switch (event.type) {
      /* The mandate is on file. Everything on billing_accounts comes from
         here rather than from the client's browser, which is why they have no
         write policy on that table. */
      case 'checkout.session.completed':
      case 'setup_intent.succeeded': {
        const setupIntentId = event.type === 'setup_intent.succeeded' ? obj.id : obj.setup_intent;
        const clientId = obj.metadata?.client_id ?? null;
        if (!setupIntentId) break;

        const { stripeCall } = await import('@/lib/stripe');
        const si: any = await stripeCall(`/setup_intents/${setupIntentId}?expand[]=payment_method`);
        const pm = si.payment_method;
        if (!pm?.id) break;

        const kind = pm.type === 'card' ? 'card' : 'us_bank_account';
        const detail = pm.type === 'card' ? pm.card : pm.us_bank_account;

        await sb.from('billing_accounts').upsert({
          client_id: clientId ?? si.metadata?.client_id,
          stripe_customer: typeof si.customer === 'string' ? si.customer : si.customer?.id,
          payment_method: pm.id,
          method_kind: kind,
          bank_name: pm.type === 'card' ? (detail?.brand ?? null) : (detail?.bank_name ?? null),
          last4: detail?.last4 ?? null,
          mandate_ok: true,
          set_up_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'client_id' });
        break;
      }

      /* Accepted by the bank, not yet cleared. Days, typically. */
      case 'payment_intent.processing': {
        const id = obj.metadata?.invoice_id;
        if (id) await sb.from('invoices').update({
          status: 'processing', stripe_payment_intent: obj.id, failure_reason: null
        }).eq('id', id);
        break;
      }

      /* The money is real. This is the only place an invoice becomes paid —
         when one exists yet. A deposit paid straight from the onboarding
         email routinely arrives with no invoice_id at all: nobody has an
         account for it to belong to. That case still has to clear the
         search's gate and, once the search backfills the invoice on sign-in
         (schema PART 20), it will already read as paid — so invoice_id
         being absent skips only the invoice update below, never the rest. */
      case 'payment_intent.succeeded': {
        const id = obj.metadata?.invoice_id;
        if (id) {
          await sb.from('invoices').update({
            status: 'paid',
            paid_on: new Date().toISOString().slice(0, 10),
            stripe_payment_intent: obj.id,
            failure_reason: null
          }).eq('id', id);

          const { data: inv } = await sb.from('invoices')
            .select('number, amount_cents, client:client_id(full_name, email)')
            .eq('id', id).maybeSingle();
          const who: any = (inv as any)?.client;
          if (who?.email) {
            await send(who.email, templates.paymentReceived({
              name: String(who.full_name ?? '').split(' ')[0] || 'there',
              number: (inv as any).number ?? '',
              amount: money((inv as any).amount_cents)
            }));
          }
        }

        /* A search deposit, paid on the executive's own Checkout session,
           does two more things a retainer charge never needs to: it opens
           the gate on their dashboard, and — because that Checkout asked to
           keep the payment method on file — it is also the account's first
           mandate, the same record the setup flow above writes. Both come
           from here rather than the browser, for the same reason everything
           else on this table does. deposit_payment_intent is the receipt a
           pre-signup payment carries forward until there is an invoice to
           attach it to. */
        const searchId = obj.metadata?.search_id;
        if (searchId) await sb.from('searches').update({
          deposit_status: 'paid',
          deposit_paid_on: new Date().toISOString().slice(0, 10),
          deposit_payment_intent: obj.id
        }).eq('id', searchId);

        if (obj.payment_method && obj.metadata?.client_id) {
          const { stripeCall } = await import('@/lib/stripe');
          const pm: any = await stripeCall(`/payment_methods/${obj.payment_method}`);
          const kind = pm.type === 'card' ? 'card' : 'us_bank_account';
          const detail = pm.type === 'card' ? pm.card : pm.us_bank_account;
          await sb.from('billing_accounts').upsert({
            client_id: obj.metadata.client_id,
            stripe_customer: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
            payment_method: pm.id,
            method_kind: kind,
            bank_name: pm.type === 'card' ? (detail?.brand ?? null) : (detail?.bank_name ?? null),
            last4: detail?.last4 ?? null,
            mandate_ok: true,
            set_up_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'client_id' });
        }
        break;
      }

      /* Failed, and it can fail after being accepted — a closed account, a
         debit the client disputed, insufficient funds. It goes back on the
         chase list with the reason attached rather than sitting in
         processing for ever. */
      case 'payment_intent.payment_failed': {
        const id = obj.metadata?.invoice_id;
        if (id) await sb.from('invoices').update({
          status: 'failed',
          failure_reason: obj.last_payment_error?.message ?? 'The bank refused it.'
        }).eq('id', id);
        break;
      }

      /* The mandate stopped being usable. Left explicit so the console can
         show "no payment method" rather than failing every charge from now on
         with no explanation. */
      case 'payment_method.detached': {
        await sb.from('billing_accounts')
          .update({ mandate_ok: false, updated_at: new Date().toISOString() })
          .eq('payment_method', obj.id);
        break;
      }
    }
  } catch (e: any) {
    /* Something went wrong handling a genuine, signed event. 500 so Stripe
       retries — and the event row is removed so the retry is not dismissed as
       a duplicate. */
    await sb.from('stripe_events').delete().eq('id', event.id);
    return NextResponse.json({ error: safeMessage(e) }, { status: 500 });
  }

  await sb.from('stripe_events').update({ summary: 'handled' }).eq('id', event.id);
  return NextResponse.json({ ok: true });
}
