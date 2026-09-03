import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import {
  editInvoice, giveNotice, invoiceDeposit, issueMonthlyRetainers,
  setDeposit, setInvoiceStatus, setPlacementRate,
  RATE_MIN_CENTS, RATE_MAX_CENTS
} from '@/lib/money';

export const dynamic = 'force-dynamic';

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
      case 'invoice_status':
        await setInvoiceStatus(String(b.id), b.status, b.paid_on);
        return NextResponse.json({ ok: true });

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
