import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { startPaymentSetup, startDepositPayment, startInvoicePayment, chargeInvoice } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (!stripeReady())
    return NextResponse.json({ error: 'Payments are not switched on yet.' }, { status: 503 });

  const b = await req.json().catch(() => ({}));

  /* An executive setting up their own bank debit. */
  if (b.action === 'setup') {
    if (me.role !== 'client')
      return NextResponse.json({ error: 'only an executive account pays' }, { status: 403 });
    try {
      const url = await startPaymentSetup(me.id, me.email, me.full_name);
      return NextResponse.json({ ok: true, url });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  /* An executive paying their own $500 search deposit — on-session, their
     own click, the same trust boundary as linking a bank above. Charging an
     invoice without them present is the 'charge' action below, and stays
     admin-only. */
  if (b.action === 'deposit') {
    if (me.role !== 'client')
      return NextResponse.json({ error: 'only an executive account pays' }, { status: 403 });
    try {
      const url = await startDepositPayment(me.id, me.email, me.full_name);
      return NextResponse.json({ ok: true, url });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  /* An executive paying one of their own invoices — on-session, their own
     click, the same trust boundary as the deposit above. What InvoiceGate's
     button calls. */
  if (b.action === 'pay_invoice') {
    if (me.role !== 'client')
      return NextResponse.json({ error: 'only an executive account pays' }, { status: 403 });
    if (!b.invoice_id) return NextResponse.json({ error: 'which invoice?' }, { status: 400 });
    try {
      const url = await startInvoicePayment(me.id, me.email, me.full_name, String(b.invoice_id));
      return NextResponse.json({ ok: true, url });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  /* Taking money is Relève's, never the client's — an executive charging
     their own invoice off-session (the console's Charge button) is not a
     thing that should be possible. */
  if (me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });

  if (b.action === 'charge') {
    if (!b.invoice_id) return NextResponse.json({ error: 'which invoice?' }, { status: 400 });
    try {
      const out = await chargeInvoice(String(b.invoice_id));
      return NextResponse.json({ ok: true, ...out });
    } catch (e: any) {
      /* Stripe's own wording, not a paraphrase. "Insufficient funds" and
         "the account was closed" need different actions from you. */
      return NextResponse.json({ error: e.message, code: e.code ?? null }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
