import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { listPayments, getPayout, setPaymentState } from '@/lib/payout';
import { isOwner } from '@/lib/money';
import { periodLabel } from '@/lib/payout-public';
import { money } from '@/lib/money-public';
import { send, templates } from '@/lib/email';
import { csvFile, centsToAmount } from '@/lib/csv';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Paying the roster in one batch, through Wise.
   ---------------------------------------------
   Relève pays talent through Wise, which takes up to 1,000 transfers in a
   single CSV. Until now the payroll run listed who was owed what and every
   transfer was typed into Wise by hand — fine for one person, a transcription
   error waiting to happen at six.

   TWO HALVES, deliberately separate, because only one of them involves money
   actually moving:

     GET  builds the CSV. It reads, and changes nothing.
     POST records that the batch was sent, after she has uploaded it to Wise
          and it has gone through.

   Nothing here talks to Wise. Relève holds no Wise credential and makes no
   transfer on its own: the file is handed over, a person uploads it and
   approves it inside Wise, and only then is this told what happened. That
   division is on purpose — software that can move money unattended is a much
   bigger thing to own than software that prepares a file.

   FIXED TARGET, not fixed source. amountCurrency is set to the TARGET
   currency, which is Wise's way of saying "deliver exactly this much, take
   the fee from the sender". The alternative bills the fee to the talent, so
   somebody on $1,800 watches $1,787 arrive and is reminded every month that
   the fee is theirs. For a premium staffing brand that is a small saving and
   a large, recurring irritation. (12 October, Sage's call.)

   DOLLARS ON BOTH SIDES, and this one is not a preference. Every amount in
   the app is stored as US cents. A currency code does not convert a figure,
   it renames it: the same 1800 written as PHP delivers about thirty dollars
   instead of eighteen hundred. So the file says USD to USD, the talent's
   Wise account receives dollars, and they convert inside Wise at Wise's rate
   — which is what the payroll desk's "PHP 196,400 at Wise rate" note has
   always been describing. Anybody whose payout row asks to be paid in some
   other currency is left out of the file and paid by hand, because the
   honest alternative is paying them the right number in the wrong money.

   A NOTE ON THE COLUMNS. These are the core columns Wise documents for a
   batch file: Name, sourceCurrency, targetCurrency, Amount, amountCurrency,
   plus the recipient email and a reference. Wise generates per-account
   templates that can carry extra columns, so the first upload is worth
   checking against the template Wise offers in the account. If it wants more,
   they go in HEADERS below and nothing else changes. */

const SOURCE_CURRENCY = 'USD';

/* Wise's own column names, spelled as Wise spells them. */
const HEADERS = [
  'Name', 'recipientEmail', 'sourceCurrency', 'targetCurrency',
  'Amount', 'amountCurrency', 'reference'
] as const;

/* Cell escaping and cents-to-decimal live in lib/csv.ts, where they can be
   tested without a signed-in admin and a live payroll run behind them. */

/* Who is in this batch, and who cannot be. Shared by both halves so the file
   and the thing marked sent can never describe different people. */
async function batchRows() {
  const payments = (await listPayments()).filter(p => p.state !== 'sent');
  const rows: { payment: any; payout: any }[] = [];
  const skipped: { name: string; why: string }[] = [];
  const seen: Record<string, any> = {};

  for (const p of payments) {
    if (!(p.talent_id in seen)) seen[p.talent_id] = await getPayout(p.talent_id);
    const payout = seen[p.talent_id];
    const who = p.talent_name ?? 'Talent';
    if (!payout?.method) { skipped.push({ name: who, why: 'no payout details on file' }); continue; }
    if (payout.method !== 'wise') {
      skipped.push({ name: who, why: `paid by ${payout.method}, not Wise` });
      continue;
    }
    if (!(payout.detail ?? '').trim()) { skipped.push({ name: who, why: 'no Wise email on file' }); continue; }
    if (!(payout.beneficiary ?? '').trim()) { skipped.push({ name: who, why: 'no beneficiary name on file' }); continue; }
    const cur = (payout.currency || SOURCE_CURRENCY).toUpperCase();
    if (cur !== SOURCE_CURRENCY) {
      skipped.push({ name: who, why: `set up to be paid in ${cur}, and this run is in US dollars` });
      continue;
    }
    if (!p.amount_cents || p.amount_cents <= 0) { skipped.push({ name: who, why: 'nothing owed' }); continue; }
    rows.push({ payment: p, payout });
  }
  return { rows, skipped };
}

export async function GET() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ error: 'not permitted' }, { status: 403 });

  try {
    const { rows } = await batchRows();
    if (!rows.length)
      return NextResponse.json({ error: 'Nobody in this run can be paid by Wise yet.' }, { status: 400 });

    const body = csvFile(HEADERS, rows.map(({ payment, payout }) => [
      payout.beneficiary.trim(),
      payout.detail.trim(),
      SOURCE_CURRENCY,
      SOURCE_CURRENCY,
      centsToAmount(payment.amount_cents),
      /* Fixed target, in dollars — see the note at the top of this file. */
      SOURCE_CURRENCY,
      `Releve ${payment.period_start ?? ''}`.trim()
    ]));

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="releve-wise-batch-${stamp}.csv"`,
        'cache-control': 'no-store'
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

/* The batch went through Wise. Record it.
   ---------------------------------------
   Marking somebody paid emails them to say their money is on its way, so
   this is only ever run deliberately, after the upload has actually been
   approved in Wise — never as a side effect of downloading the file.

   sent_cents is the full amount owed, which is true precisely because the
   file is fixed-target: every person receives exactly their figure. The Wise
   fee is charged once against the whole batch rather than per transfer, so
   there is no honest per-person fee to record and fee_cents is left alone
   rather than filled with a made-up share of it. The batch reference ties
   every row back to the one transfer in Wise. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ error: 'not permitted' }, { status: 403 });
  /* Same bar as marking a single payment paid: recording money as sent is
     the owner's call. */
  if (!(await isOwner())) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });

  try {
    const b = await req.json().catch(() => ({}));
    const reference = String(b.reference ?? '').trim().slice(0, 160);
    const { rows } = await batchRows();
    if (!rows.length) return NextResponse.json({ error: 'Nothing in this run to mark as sent.' }, { status: 400 });

    /* Addresses for the notification below. Paying somebody one at a time
       emails them that their money is on its way; being paid in a batch must
       not quietly skip that, or the people on the biggest payroll runs are
       the only ones who never hear anything. */
    const emailBy = new Map<string, { email: string; full_name: string | null }>();
    if (configured()) {
      try {
        const sb = await supabaseServer();
        const { data } = await sb.from('profiles')
          .select('id, full_name, email')
          .in('id', [...new Set(rows.map(r => r.payment.talent_id))]);
        for (const p of (data ?? []) as any[]) emailBy.set(p.id, p);
      } catch (e) { console.error('[wise-batch] could not read talent addresses', e); }
    }

    let marked = 0, notified = 0;
    const failed: string[] = [];
    for (const { payment } of rows) {
      try {
        await setPaymentState(String(payment.id), {
          state: 'sent',
          method: 'wise',
          reference: reference || null,
          sent_cents: payment.amount_cents,
          fee_cents: null,
          fx_note: 'Paid in a Wise batch, fixed target'
        });
        marked++;
      } catch {
        failed.push(payment.talent_name ?? 'Talent');
        continue;
      }
      /* Recorded first, told second, and a failed send never un-records a
         payment that really was made. */
      const who = emailBy.get(payment.talent_id);
      if (who?.email) {
        try {
          const ok = await send(who.email, templates.talentPaymentSent({
            name: who.full_name?.split(/\s+/)?.[0] || 'there',
            amount: money(payment.amount_cents, true),
            period: periodLabel(payment.period_start),
            reference: reference || null
          }));
          if (ok) notified++;
        } catch (e) { console.error('[wise-batch] payment notice failed to send', e); }
      }
    }
    return NextResponse.json({ ok: true, marked, notified, failed });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
