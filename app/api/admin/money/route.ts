import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import {
  editInvoice, getInvoice, giveNotice, invoiceDeposit, issueMonthlyRetainers,
  markInvoiceSent, setDeposit, setInvoiceStatus, setPlacementRate,
  RATE_MIN_CENTS, RATE_MAX_CENTS
} from '@/lib/money';
import { money, monthLabel, dayLabel } from '@/lib/money-public';
import { personEmail } from '@/lib/work';
import { send, templates } from '@/lib/email';
import { billingAccount, chargeInvoice } from '@/lib/billing';
import { invoiceLinkReady, signInvoiceLink } from '@/lib/invoice-link';
import { SITE } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/* One invoice, mailed and marked — shared by the single-row status picker
   below and the bulk sender, so "what sending means" only has to be right
   once. Returns whether the mail actually went; the caller decides what
   that implies about the invoice's status.

   The invoice does not become 'sent' until the email is genuinely away.
   Flipping the status first and hoping the send followed left invoices
   stuck marked "sent" with nobody actually told whenever the send failed —
   and with no way back, since this function and the bulk sender both only
   look at eligible starting statuses. Eligible starting points are 'draft'
   and 'failed': anything already sent, processing, paid or void has
   nothing left for "send" to mean, so calling this twice is always a safe
   no-op, never a second email. */
async function mailInvoice(id: string): Promise<boolean> {
  const before = await getInvoice(id);
  if (!before || !['draft', 'failed'].includes(before.status)) return false;
  const who = before.client_id ? await personEmail(before.client_id) : null;
  if (!who?.email || before.amount_cents <= 0) return false;

  /* The number is assigned by the database the moment an invoice stops
     being a draft — so it has to stop being a draft BEFORE the letter is
     built, or every invoice email reads "Relève invoice pending". The
     status is put back if the mail does not go, and the number it was
     given stays with it, so a retry sends the same number, not a new one. */
  await setInvoiceStatus(id, 'sent');
  const inv = (await getInvoice(id)) ?? before;

  const payUrl = invoiceLinkReady() ? `${SITE}/pay-invoice/${signInvoiceLink(inv.id)}` : undefined;
  const tpl = templates.invoiceIssued({
    name: who.name, number: inv.number ?? 'pending', amount: money(inv.amount_cents),
    period: inv.kind === 'deposit' ? 'the search deposit' : monthLabel(inv.period_start),
    due: dayLabel(inv.due_on), payUrl
  });
  const ok = await send(who.email, tpl);
  if (!ok) {
    await setInvoiceStatus(id, before.status as any);   // back to draft/failed — safe to try again
    return false;
  }

  await markInvoiceSent(id);

  /* Autopay is not a separate switch — it is what "Invoices are collected
     from this automatically" on the billing page already promises the
     moment a payment method is on file. Issuing the invoice is what starts
     that clock, so this is where it fires, right after the status flips to
     'sent' with nothing else awaited in between. chargeInvoice claims the
     row atomically before it ever calls Stripe, so an executive clicking
     their own "pay now" link at this exact moment cannot open a second,
     unrelated charge — see the comment on chargeInvoice in lib/billing.ts.
     A failed charge here is not a failed send: the invoice stands, sent and
     due, same as any invoice a client has to pay by hand. */
  try {
    const acct = await billingAccount(inv.client_id);
    if (acct?.mandate_ok && acct.payment_method) await chargeInvoice(id);
  } catch { /* left due — the pay-now link in the email still works */ }

  return true;
}

/* Every money write funnels through here. The database checks is_admin()
   again on its own, so this guard is the first of two, not the only one. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin')
    return NextResponse.json({ error: 'Relève team only' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');

  try {
    switch (action) {
      case 'set_rate': {
        const cents = b.cents == null ? null : Number(b.cents);
        if (cents != null && (!Number.isInteger(cents) || cents <= 0))
          return NextResponse.json({ error: 'that is not a rate' }, { status: 400 });
        /* Outside the quoted band is allowed but never silent — the Terms say
           $2,500 to $4,500, and a number outside it should be deliberate. */
        const outside = cents != null && (cents < RATE_MIN_CENTS || cents > RATE_MAX_CENTS);
        await setPlacementRate(String(b.placement_id), cents, b.minimum_months);
        return NextResponse.json({ ok: true, outsideQuotedBand: outside });
      }
      case 'notice':
        await giveNotice(String(b.placement_id), b.on);
        return NextResponse.json({ ok: true });

      case 'deposit_status':
        await setDeposit(String(b.search_id), b.status, b.paid_on);
        return NextResponse.json({ ok: true });

      case 'invoice_deposit': {
        const inv = await invoiceDeposit(String(b.search_id), String(b.client_id));
        return NextResponse.json({ ok: true, invoice: inv });
      }
      case 'invoice_status': {
        /* Marking an invoice sent now sends it. It used to be a word in a
           dropdown, so a number was minted on a document nobody would see,
           and the client was never told it existed. mailInvoice owns the
           whole draft/failed → sent transition itself now — it only flips
           the status once the email has actually gone, so a failed send
           leaves the invoice exactly where it was, with a real error back
           to the dropdown, rather than silently stuck at "sent". */
        if (b.status === 'sent') {
          const mailed = await mailInvoice(String(b.id)).catch(() => false);
          if (!mailed) return NextResponse.json(
            { error: 'Could not send that invoice — check the address on file and try again.' }, { status: 400 });
          return NextResponse.json({ ok: true, mailed: true });
        }
        await setInvoiceStatus(String(b.id), b.status, b.paid_on);
        return NextResponse.json({ ok: true, mailed: false });
      }

      /* One at a time from the dropdown above, or a batch from the table's
         own selection — either way a draft becomes an issued invoice the
         client has actually been told about. mailInvoice itself decides
         eligibility (draft or failed), so a send that fails partway through
         a batch leaves every un-mailed invoice exactly where it was,
         available to select and retry rather than stuck at "sent". */
      case 'invoice_send_bulk': {
        const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String) : [];
        if (!ids.length) return NextResponse.json({ error: 'nothing selected' }, { status: 400 });
        let sentCount = 0, skipped = 0;
        for (const id of ids) {
          const mailed = await mailInvoice(id).catch(() => false);
          if (mailed) sentCount++; else skipped++;
        }
        return NextResponse.json({ ok: true, sent: sentCount, skipped });
      }

      case 'invoice_edit': {
        const patch: any = {};
        if (b.amount_cents != null) {
          const c = Number(b.amount_cents);
          if (!Number.isInteger(c) || c < 0)
            return NextResponse.json({ error: 'that is not an amount' }, { status: 400 });
          patch.amount_cents = c;
        }
        if (b.note !== undefined) patch.note = String(b.note).slice(0, 400);
        if (b.due_on !== undefined) patch.due_on = b.due_on || null;
        await editInvoice(String(b.id), patch);
        return NextResponse.json({ ok: true });
      }
      case 'run_month': {
        const made = await issueMonthlyRetainers(b.month);
        return NextResponse.json({ ok: true, made });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
