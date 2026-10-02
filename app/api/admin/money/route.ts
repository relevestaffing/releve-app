import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import {
  editInvoice, getInvoice, giveNotice, withdrawNotice, invoiceDeposit, issueMonthlyRetainers,
  markInvoiceSent, setDeposit, setInvoiceStatus, setPlacementRate, settleZeroInvoice, isOwner,
  RATE_MIN_CENTS, RATE_MAX_CENTS
} from '@/lib/money';
import { money, monthLabel, dayLabel, noticeReasonLabel, NOTICE_REASONS } from '@/lib/money-public';
import { personEmail, getPlacement } from '@/lib/work';
import { send } from '@/lib/email';
import { billingTemplates } from '@/lib/email-billing';
import { adminClient, billingAccount, chargeInvoice, liftSuspensionIfClear, refundInvoice, tellTeam } from '@/lib/billing';
import { hasServiceKey } from '@/lib/supabase/admin';
import { invoiceLinkReady, signInvoiceLink } from '@/lib/invoice-link';
import { SITE } from '@/lib/stripe';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const OWNER_ONLY = 'Only the owner can do that. Ask her, or have her change your access on the Team page.';

/* One invoice, mailed and marked: shared by the single-row status picker and
   the bulk sender, so "what sending means" only has to be right once.

   The invoice does not become 'sent' until the email is genuinely away. A
   fully credited ($0) invoice is still sent, as a statement, and settles
   itself: there is nothing to collect. Eligible starting points are 'draft'
   and 'failed'; anything else is a safe no-op, never a second email. */
async function mailInvoice(id: string): Promise<boolean> {
  const before = await getInvoice(id);
  if (!before || !['draft', 'failed'].includes(before.status)) return false;
  const who = before.client_id ? await personEmail(before.client_id) : null;
  if (!who?.email || before.amount_cents < 0) return false;

  /* The number is assigned the moment an invoice stops being a draft, and the
     due date resets to today if it was drafted earlier (due on receipt). */
  await setInvoiceStatus(id, 'sent');
  const inv = (await getInvoice(id)) ?? before;
  const zero = inv.amount_cents === 0;
  const credit = (inv as any).deposit_credit_cents ?? 0;

  const payUrl = !zero && invoiceLinkReady() ? `${SITE}/pay-invoice/${signInvoiceLink(inv.id)}` : undefined;
  const tpl = billingTemplates.invoiceIssued({
    name: who.name, number: inv.number ?? 'pending', amount: money(inv.amount_cents, true),
    period: inv.kind === 'deposit' ? 'the search deposit' : monthLabel(inv.period_start),
    due: dayLabel(inv.due_on), payUrl, zero,
    creditNote: credit > 0 ? `${money(credit, true)} of your search deposit is credited on this invoice` : null,
    docUrl: `${SITE}/app/billing/${inv.id}`
  });
  const ok = await send(who.email, tpl);
  if (!ok) {
    await setInvoiceStatus(id, before.status as any);   // back to draft/failed, safe to try again
    return false;
  }

  await markInvoiceSent(id);
  if (zero) { await settleZeroInvoice(id).catch(() => {}); return true; }

  /* Autopay: issuing the invoice is what starts the clock when a payment
     method is on file. chargeInvoice claims the row atomically and refuses
     while the client has a payment page open, so this cannot double charge.
     A failed charge is not a failed send: the invoice stands, sent and due. */
  try {
    const acct = await billingAccount(inv.client_id);
    if (acct?.mandate_ok && acct.payment_method) await chargeInvoice(id);
  } catch { /* left due; the pay link in the email still works */ }

  return true;
}

/* Every money write funnels through here. The database checks again on its
   own: is_admin() for the team, is_owner() for paid, void and amounts. */
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
        const outside = cents != null && (cents < RATE_MIN_CENTS || cents > RATE_MAX_CENTS);
        await setPlacementRate(String(b.placement_id), cents, b.minimum_months);
        return NextResponse.json({ ok: true, outsideQuotedBand: outside });
      }

      /* Written notice that reached Relève, recorded from the console. The
         database applies the rule and stores the end date billing reads. */
      case 'notice': {
        const placementId = String(b.placement_id ?? '');
        if (!placementId) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
        const on = typeof b.on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.on) ? b.on : null;
        const reason = NOTICE_REASONS.some(r => r.key === b.reason) ? String(b.reason) : null;
        const note = String(b.note ?? '').trim().slice(0, 1000) || null;
        const { givenOn, endsOn } = await giveNotice(placementId, { on, reason, note });
        const endsLabel = endsOn ? dayLabel(endsOn) : 'the end of next month';
        try {
          const pl = await getPlacement(placementId);
          if (pl) {
            await tellTeam(() => billingTemplates.noticeGiven({
              name: 'there', who: `${pl.org_name ?? pl.client_name} (${pl.talent_name}), recorded by ${me.full_name ?? me.email}`,
              endsOn: endsLabel, toTeam: true, reason: noticeReasonLabel(reason), note }));
            if (b.tell_client !== false) {
              const exec = await personEmail(pl.client_id);
              if (exec?.email) await send(exec.email, billingTemplates.noticeGiven({
                name: exec.name, who: exec.full, endsOn: endsLabel, toTeam: false }));
            }
          }
        } catch { /* the notice stands */ }
        return NextResponse.json({ ok: true, notice_given_on: givenOn, notice_ends_on: endsOn, ends_on: endsLabel });
      }

      case 'withdraw_notice':
        await withdrawNotice(String(b.placement_id));
        return NextResponse.json({ ok: true });

      /* Recording money received, or giving it up, is the owner's. */
      case 'deposit_status': {
        const status = String(b.status ?? '');
        if (!['due', 'paid', 'waived'].includes(status))
          return NextResponse.json({ error: 'Clearing is set by Stripe, not by hand.' }, { status: 400 });
        if ((status === 'paid' || status === 'waived') && !(await isOwner()))
          return NextResponse.json({ error: OWNER_ONLY }, { status: 403 });
        await setDeposit(String(b.search_id), status as any, b.paid_on);
        return NextResponse.json({ ok: true });
      }

      case 'invoice_deposit': {
        const inv = await invoiceDeposit(String(b.search_id), String(b.client_id));
        return NextResponse.json({ ok: true, invoice: inv });
      }

      case 'invoice_status': {
        if (b.status === 'sent') {
          const mailed = await mailInvoice(String(b.id)).catch(() => false);
          if (!mailed) return NextResponse.json(
            { error: 'Could not send that invoice. Check the address on file and try again.' }, { status: 400 });
          return NextResponse.json({ ok: true, mailed: true });
        }
        if ((b.status === 'paid' || b.status === 'void') && !(await isOwner()))
          return NextResponse.json({ error: OWNER_ONLY }, { status: 403 });
        await setInvoiceStatus(String(b.id), b.status, b.paid_on);
        if (b.status === 'paid' && hasServiceKey()) {
          const inv = await getInvoice(String(b.id));
          if (inv?.client_id) await liftSuspensionIfClear(adminClient(), inv.client_id).catch(() => 0);
        }
        return NextResponse.json({ ok: true, mailed: false });
      }

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
          if (!(await isOwner())) return NextResponse.json({ error: OWNER_ONLY }, { status: 403 });
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

      case 'refund': {
        if (!(await isOwner())) return NextResponse.json({ error: OWNER_ONLY }, { status: 403 });
        const cents = b.cents == null || b.cents === '' ? null : Number(b.cents);
        const out = await refundInvoice(String(b.id), cents);
        return NextResponse.json({ ok: true, ...out });
      }

      case 'run_month': {
        const month = typeof b.month === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.month) ? b.month : undefined;
        const made = await issueMonthlyRetainers(month);
        return NextResponse.json({ ok: true, made });
      }

      /* Lifting a pause early, by hand: the team's call, for example when a
         payment is promised and trusted. */
      case 'resume_placement': {
        if (!hasServiceKey()) return NextResponse.json({ error: 'The server is missing its service key.' }, { status: 500 });
        const db = adminClient();
        const { data, error } = await db.from('placements')
          .update({ suspended_at: null, suspended_reason: null, resumed_at: new Date().toISOString() })
          .eq('id', String(b.placement_id)).not('suspended_at', 'is', null)
          .select('id, client:client_id(full_name, email), talent:talent_id(full_name, email)').maybeSingle();
        if (error) throw error;
        const pl: any = data;
        if (pl) {
          const firstName = (s: any) => String(s ?? '').trim().split(/\s+/)[0] || 'there';
          if (pl.client?.email) await send(pl.client.email, billingTemplates.placementResumed({
            name: firstName(pl.client.full_name), withWhom: pl.talent?.full_name ?? 'your placement', side: 'client' }));
          if (pl.talent?.email) await send(pl.talent.email, billingTemplates.placementResumed({
            name: firstName(pl.talent.full_name), withWhom: pl.client?.full_name ?? 'your executive', side: 'talent' }));
        }
        return NextResponse.json({ ok: true, resumed: Boolean(pl) });
      }

      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
