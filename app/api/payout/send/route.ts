import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { isOwner } from '@/lib/money';
import { periodLabel } from '@/lib/payout-public';
import { money, todayInPacific } from '@/lib/money-public';
import { payoutProviders, sendPayPal, sendWise, paypalStatus, wiseStatus } from '@/lib/payout-send';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* One-click payouts (19 Oct 2026). Owner only, button only: see the header
   of lib/payout-send.ts for why nothing here ever runs unattended.

   POST { action: 'send', ids: [...] }   pay each listed payment that is due
   POST { action: 'refresh' }            ask PayPal and Wise where recent
                                          payments have got to */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  if (!(await isOwner())) return NextResponse.json({ error: 'Only the owner can send money.' }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: 'Preview mode: nothing is sent.' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const sb = await supabaseServer();
  const ready = payoutProviders();

  try {
    if (b.action === 'refresh') {
      const { data } = await sb.from('talent_payments').select('id, method, reference, note, state')
        .eq('state', 'sent').in('method', ['paypal', 'wise']).not('reference', 'is', null)
        .gte('sent_on', new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10));
      let changed = 0;
      for (const p of data ?? []) {
        if (p.method === 'paypal' && ready.paypal) {
          const s = await paypalStatus(p.reference!);
          if (!s) continue;
          const failed = ['FAILED', 'RETURNED', 'REFUNDED', 'BLOCKED', 'DENIED', 'REVERSED'].includes(s.status);
          await sb.from('talent_payments').update({
            state: failed ? 'failed' : 'sent', note: `PayPal: ${s.status.toLowerCase()}`,
            ...(s.feeCents != null ? { fee_cents: s.feeCents } : {})
          }).eq('id', p.id);
          changed++;
        } else if (p.method === 'wise' && ready.wise) {
          const s = await wiseStatus(p.reference!);
          if (!s) continue;
          const failed = ['cancelled', 'funds_refunded', 'bounced_back', 'charged_back'].includes(s);
          await sb.from('talent_payments').update({ state: failed ? 'failed' : 'sent', note: `Wise: ${s.replace(/_/g, ' ')}` }).eq('id', p.id);
          changed++;
        }
      }
      return NextResponse.json({ ok: true, checked: changed });
    }

    if (b.action !== 'send' || !Array.isArray(b.ids) || !b.ids.length)
      return NextResponse.json({ error: 'Choose at least one payment to send.' }, { status: 400 });

    const results: { id: string; ok: boolean; message: string }[] = [];
    for (const id of b.ids.slice(0, 50).map(String)) {
      const { data: p } = await sb.from('talent_payments')
        .select('id, talent_id, amount_cents, period_start, state, talent:talent_id(full_name)').eq('id', id).maybeSingle();
      if (!p) { results.push({ id, ok: false, message: 'Payment not found.' }); continue; }
      if (p.state === 'sent') { results.push({ id, ok: false, message: 'Already sent.' }); continue; }
      const { data: po } = await sb.from('talent_payout').select('method, beneficiary, detail, confirmed_at').eq('talent_id', p.talent_id).maybeSingle();
      const name = (p as any).talent?.full_name ?? po?.beneficiary ?? 'Talent';
      if (!po || !['paypal', 'wise'].includes(po.method)) { results.push({ id, ok: false, message: `${name} is not paid by PayPal or Wise.` }); continue; }
      if (!po.confirmed_at) { results.push({ id, ok: false, message: `${name}'s payment details have not been confirmed yet.` }); continue; }
      if (po.method === 'paypal' && !ready.paypal) { results.push({ id, ok: false, message: 'PayPal is not connected yet.' }); continue; }
      if (po.method === 'wise' && !ready.wise) { results.push({ id, ok: false, message: 'Wise is not connected yet.' }); continue; }

      /* Claim it first, so a second press while this one is in flight finds
         nothing to send. */
      const wasFailed = p.state === 'failed';
      const { data: claimed } = await sb.from('talent_payments')
        .update({ state: 'sent', method: po.method, note: 'Sending…', sent_on: todayInPacific(), currency: 'USD' })
        .eq('id', id).in('state', ['due', 'failed']).select('id');
      if (!claimed?.length) { results.push({ id, ok: false, message: 'Already being sent.' }); continue; }

      const memo = `Relève pay for ${periodLabel(p.period_start)}`;
      const attempt = wasFailed ? randomUUID() : id;
      const res = po.method === 'paypal'
        ? await sendPayPal({ batchId: attempt, itemId: id, email: po.detail ?? '', cents: p.amount_cents, note: memo })
        : await sendWise({ transactionId: attempt, email: po.detail ?? '', name: po.beneficiary || name, cents: p.amount_cents, reference: memo });

      if (res.ok) {
        await sb.from('talent_payments').update({
          state: 'sent', reference: res.reference, sent_cents: p.amount_cents,
          fee_cents: res.feeCents ?? null,
          note: `${po.method === 'paypal' ? 'PayPal' : 'Wise'}: ${res.status.toLowerCase()}`
        }).eq('id', id);
        results.push({ id, ok: true, message: `${money(p.amount_cents, true)} sent to ${name}` });
      } else {
        await sb.from('talent_payments').update({ state: 'failed', note: res.error, sent_on: null }).eq('id', id);
        results.push({ id, ok: false, message: res.error });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 500 });
  }
}
