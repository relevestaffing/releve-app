import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { savePayout, confirmPayout, setPaymentState, payTheMonth, setTaxForm, setTalentPay, setPlacementPay } from '@/lib/payout';
import { isOwner } from '@/lib/money';
import { PAYOUT_METHODS, TAX_RESIDENCE_PROMPT, TAX_COUNTRY_PROMPT, periodLabel } from '@/lib/payout-public';
import { money } from '@/lib/money-public';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json();

  /* ---- the person's own details ---- */
  if (!b.action || b.action === 'save') {
    if (me.role !== 'talent' && me.role !== 'admin')
      return NextResponse.json({ error: 'not permitted' }, { status: 403 });
    const target = me.role === 'admin' && b.talent_id ? String(b.talent_id) : me.id;
    /* Where somebody's pay is sent is the owner's to change on their behalf,
       nobody else's on the team (B18). */
    if (me.role === 'admin' && target !== me.id && !(await isOwner()))
      return NextResponse.json({ error: 'Only the owner can change someone else\'s payment details.' }, { status: 403 });
    if (!PAYOUT_METHODS.some(m => m.key === b.method))
      return NextResponse.json({ error: 'Choose how you would like to be paid.' }, { status: 400 });
    const beneficiary = String(b.beneficiary ?? '').trim().slice(0, 160);
    const detail = String(b.detail ?? '').trim().slice(0, 600);
    if (beneficiary.length < 2)
      return NextResponse.json({ error: 'We need the name on the account.' }, { status: 400 });
    if (!detail)
      return NextResponse.json({ error: 'We need the account details themselves.' }, { status: 400 });

    /* The tax question. Their declaration only — whether the signed form is
       actually held is Relève's to record, and is deliberately not settable
       from here: a person could otherwise mark their own paperwork complete. */
    const usPerson = typeof b.us_person === 'boolean' ? b.us_person : null;
    if (usPerson === null)
      return NextResponse.json({ error: `${TAX_RESIDENCE_PROMPT}.` }, { status: 400 });
    const taxResidence = usPerson
      ? 'United States'
      : String(b.tax_residence ?? '').trim().slice(0, 80);
    if (!usPerson && taxResidence.length < 2)
      return NextResponse.json({ error: TAX_COUNTRY_PROMPT }, { status: 400 });
    try {
      await savePayout(target, {
        method: b.method, beneficiary, detail,
        country: String(b.country ?? '').trim().slice(0, 80) || null,
        currency: String(b.currency ?? 'USD').trim().slice(0, 8) || 'USD',
        note: String(b.note ?? '').trim().slice(0, 600) || null,
        us_person: usPerson, tax_residence: taxResidence,
        /* Editing the details un-confirms them. Relève checked a previous
           version, not this one. */
        confirmed_at: null, confirmed_by: null
      } as any);
      return NextResponse.json({ ok: true });
    } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  /* ---- everything below is Relève's ---- */
  if (me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  try {
    if (b.action === 'confirm') {
      if (!b.talent_id) return NextResponse.json({ error: 'which person?' }, { status: 400 });
      if (!(await isOwner()))
        return NextResponse.json({ error: 'Only the owner confirms payment details.' }, { status: 403 });
      await confirmPayout(String(b.talent_id));
      return NextResponse.json({ ok: true });
    }
    /* Relève records that the signed W-8BEN is actually held. Only here —
       never on the person's own save, so nobody can clear their own paperwork. */
    if (b.action === 'taxform') {
      if (!b.talent_id) return NextResponse.json({ error: 'which person?' }, { status: 400 });
      await setTaxForm(String(b.talent_id), b.held !== false);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'payment') {
      if (!b.id || !['due', 'sent', 'failed'].includes(b.state))
        return NextResponse.json({ error: 'which payment, and what happened to it?' }, { status: 400 });
      const cents = (v: unknown) => {
        if (v === undefined || v === null || v === '') return null;
        const n = Math.round(Number(v));
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      await setPaymentState(String(b.id), {
        state: b.state,
        method: b.method ?? null,
        reference: String(b.reference ?? '').trim().slice(0, 160) || null,
        ...(b.note !== undefined ? { note: String(b.note ?? '').trim().slice(0, 600) || null } : {}),
        sent_cents: cents(b.sent_cents),
        fee_cents: cents(b.fee_cents),
        fx_note: String(b.fx_note ?? '').trim().slice(0, 200) || null
      });
      /* The talent's own notification for their own payment status — the
         notification half of this screen that never existed (talent-
         experience audit, P0). 'due' fires nothing: that state is the
         absence of news, not news itself. */
      if ((b.state === 'sent' || b.state === 'failed') && configured()) {
        try {
          const sb = await supabaseServer();
          const { data: payment } = await sb.from('talent_payments')
            .select('talent_id, amount_cents, sent_cents, period_start, talent:talent_id(full_name, email)')
            .eq('id', String(b.id)).maybeSingle();
          const talent = (payment as any)?.talent;
          if (talent?.email) {
            const args = {
              name: talent.full_name?.split(/\s+/)?.[0] || 'there',
              amount: money((payment as any).sent_cents ?? (payment as any).amount_cents, true),
              period: periodLabel((payment as any).period_start),
              reference: b.reference ? String(b.reference).trim().slice(0, 160) : null
            };
            const msg = b.state === 'sent' ? templates.talentPaymentSent(args) : templates.talentPaymentFailed(args);
            await send(talent.email, msg);
          }
        } catch (e) { console.error('talent payment notice failed to send', e); }
      }
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'set_pay') {
      const cents = Number(b.cents);
      if (!b.talent_id || !Number.isFinite(cents) || cents <= 0)
        return NextResponse.json({ error: 'which person, and how much a month?' }, { status: 400 });
      await setTalentPay(String(b.talent_id), Math.round(cents));
      return NextResponse.json({ ok: true });
    }
    /* What Relève pays the talent on one placement: the number payroll uses. */
    if (b.action === 'set_placement_pay') {
      const cents = b.cents == null || b.cents === '' ? null : Number(b.cents);
      if (!b.placement_id || (cents != null && (!Number.isFinite(cents) || cents <= 0)))
        return NextResponse.json({ error: 'which placement, and how much a month?' }, { status: 400 });
      await setPlacementPay(String(b.placement_id), cents == null ? null : Math.round(cents));
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'run') {
      const made = await payTheMonth(b.month);
      return NextResponse.json({ ok: true, made });
    }
  } catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
