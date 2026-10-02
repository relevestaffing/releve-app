import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { startPaymentSetup, startDepositPayment, startInvoicePayment, chargeInvoice, tellTeam } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { send } from '@/lib/email';
import { billingTemplates } from '@/lib/email-billing';
import { getPlacement } from '@/lib/work';
import { dayLabel, noticeReasonLabel, NOTICE_REASONS } from '@/lib/money-public';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* The executive's own notice state for one placement: when it was given,
   when it takes effect, and when the minimum ends. Read through
   my_placement_terms, the client-safe view. */
export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const placementId = new URL(req.url).searchParams.get('placement');
  if (!placementId) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
  if (!configured()) return NextResponse.json({ ok: true, notice_given_on: null, notice_ends_on: null, minimum_ends: null });
  const sb = await supabaseServer();
  const { data } = await sb.from('my_placement_terms')
    .select('notice_given_on, notice_ends_on, minimum_ends').eq('placement_id', placementId).maybeSingle();
  return NextResponse.json({ ok: true, ...(data ?? { notice_given_on: null, notice_ends_on: null, minimum_ends: null }) });
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  /* Notice, given by the executive from their own account, with the one exit
     question asked once. Does not need Stripe. */
  if (b.action === 'give_notice') {
    if (me.role !== 'client') return NextResponse.json({ error: 'The executive gives notice.' }, { status: 403 });
    const placementId = String(b.placement_id ?? '');
    if (!placementId) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
    const reason = NOTICE_REASONS.some(r => r.key === b.reason) ? String(b.reason) : null;
    const note = String(b.note ?? '').trim().slice(0, 1000) || null;
    if (!configured()) return NextResponse.json({ ok: true, ends_on: null, note: 'Preview mode' });
    const sb = await supabaseServer();
    const { error } = await sb.rpc('give_notice', { p_placement: placementId, p_reason: reason, p_note: note });
    if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
    const { data: term } = await sb.from('my_placement_terms')
      .select('notice_given_on, notice_ends_on').eq('placement_id', placementId).maybeSingle();
    const endsIso = (term as any)?.notice_ends_on ?? null;
    const endsOn = endsIso ? dayLabel(endsIso) : 'the end of next month';
    try {
      const pl = await getPlacement(placementId);
      const who = `${me.org_name ?? me.full_name ?? me.email}${pl ? ` (${pl.talent_name})` : ''}`;
      await tellTeam(() => billingTemplates.noticeGiven({
        name: 'there', who, endsOn, toTeam: true, reason: noticeReasonLabel(reason), note }));
      await send(me.email, billingTemplates.noticeGiven({
        name: (me.full_name ?? '').split(' ')[0] || 'there', who, endsOn, toTeam: false }));
    } catch { /* the notice stands */ }
    return NextResponse.json({
      ok: true, notice_given_on: (term as any)?.notice_given_on ?? null, notice_ends_on: endsIso, ends_on: endsOn
    });
  }

  if (!stripeReady())
    return NextResponse.json({ error: 'Payments are not switched on yet.' }, { status: 503 });

  /* An executive setting up their own bank debit. */
  if (b.action === 'setup') {
    if (me.role !== 'client')
      return NextResponse.json({ error: 'only an executive account pays' }, { status: 403 });
    try {
      const url = await startPaymentSetup(me.id, me.email, me.full_name);
      return NextResponse.json({ ok: true, url });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  /* An executive paying their own $500 search deposit, on-session. */
  if (b.action === 'deposit') {
    if (me.role !== 'client')
      return NextResponse.json({ error: 'only an executive account pays' }, { status: 403 });
    try {
      const url = await startDepositPayment(me.id, me.email, me.full_name);
      return NextResponse.json({ ok: true, url });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  /* An executive paying one of their own invoices, on-session. */
  if (b.action === 'pay_invoice') {
    if (me.role !== 'client')
      return NextResponse.json({ error: 'only an executive account pays' }, { status: 403 });
    if (!b.invoice_id) return NextResponse.json({ error: 'which invoice?' }, { status: 400 });
    try {
      const url = await startInvoicePayment(me.id, me.email, me.full_name, String(b.invoice_id));
      return NextResponse.json({ ok: true, url });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  /* Taking money off-session is Relève's, never the client's. */
  if (me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });

  if (b.action === 'charge') {
    if (!b.invoice_id) return NextResponse.json({ error: 'which invoice?' }, { status: 400 });
    try {
      const out = await chargeInvoice(String(b.invoice_id));
      return NextResponse.json({ ok: true, ...out });
    } catch (e: any) {
      /* Stripe's own wording: "insufficient funds" and "the account was
         closed" need different actions. */
      return NextResponse.json({ error: e.message, code: e.code ?? null }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
