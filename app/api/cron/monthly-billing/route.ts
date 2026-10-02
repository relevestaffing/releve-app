import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { hasServiceKey } from '@/lib/supabase/admin';
import { adminClient, liftSuspensionIfClear, tellTeam } from '@/lib/billing';
import { send } from '@/lib/email';
import { billingTemplates } from '@/lib/email-billing';
import { invoiceLinkReady, signInvoiceLink } from '@/lib/invoice-link';
import { SITE } from '@/lib/stripe';
import { money, todayInPacific, daysBetweenISO } from '@/lib/money-public';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const REMINDER_DAYS = [1, 7, 13];
const first = (s: unknown) => String(s ?? '').trim().split(/\s+/)[0] || 'there';

/* The daily billing run.
   ---------------------
   Called every morning by netlify/functions/cron-monthly-billing.mts. Every
   step is idempotent, so running daily rather than on the 1st is what makes
   it dependable:
     1. run_the_month for the current Pacific month. Drafts any retainer not
        yet drafted (including a placement created yesterday, prorated from
        its start), credits deposits, ends placements whose notice has taken
        effect, and lists payroll. Nothing is sent and no money moves.
     2. Reminders on days 1, 7 and 13 after an invoice's due date.
     3. At fourteen days unpaid, the placement pauses: payroll for it stops
        being created, and both sides are told, warmly.
     4. Any pause whose balance is settled is lifted.
   Any failure is emailed to the team the same morning. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given || !safeEqual(given, secret))
    return NextResponse.json({ error: 'no' }, { status: 401 });

  if (!hasServiceKey())
    return NextResponse.json({ error: 'The server is missing its database service key.' }, { status: 500 });

  const sb = adminClient();
  const today = todayInPacific();
  const errors: string[] = [];
  const out = { today, invoices: 0, payments: 0, reminders: 0, paused: 0, resumed: 0 };

  /* 1. the month */
  try {
    const { data, error } = await sb.rpc('run_the_month', { for_month: today });
    if (error) throw new Error(error.message);
    out.invoices = Number((data as any)?.invoices ?? 0);
    out.payments = Number((data as any)?.payments ?? 0);
  } catch (e: any) { errors.push(`run_the_month: ${e?.message ?? e}`); }

  /* 2 and 3. reminders, then the pause */
  try {
    const { data, error } = await sb.from('invoices')
      .select('id, number, amount_cents, due_on, status, kind, client_id, placement_id, reminders_sent, ' +
              'client:client_id(full_name, email, org_name), ' +
              'placement:placement_id(id, ended_on, suspended_at, talent:talent_id(full_name, email))')
      .in('status', ['sent', 'failed']).gt('amount_cents', 0).not('due_on', 'is', null)
      /* Only invoices that genuinely went out by email. One marked "sent" by
         hand before sending meant sending was never reminded or paused on. */
      .not('sent_at', 'is', null);
    if (error) throw new Error(error.message);

    for (const inv of (data ?? []) as any[]) {
      const late = daysBetweenISO(inv.due_on, today);
      if (late < 1) continue;
      const who = inv.client;
      const payUrl = invoiceLinkReady() ? `${SITE}/pay-invoice/${signInvoiceLink(inv.id)}` : undefined;
      const sent: number[] = inv.reminders_sent ?? [];

      if (late < 14) {
        const due = REMINDER_DAYS.filter(d => late >= d && !sent.includes(d));
        if (!due.length) continue;
        const day = Math.max(...due);
        if (who?.email) {
          const ok = await send(who.email, billingTemplates.invoiceReminder({
            name: first(who.full_name), number: inv.number ?? 'on file', amount: money(inv.amount_cents), day, payUrl }));
          if (ok) out.reminders++;
        }
        const { error: e2 } = await sb.from('invoices')
          .update({ reminders_sent: [...new Set([...sent, ...due])] }).eq('id', inv.id);
        if (e2) errors.push(`reminder mark ${inv.id}: ${e2.message}`);
        continue;
      }

      /* Fourteen days. Only a retainer has a placement to pause; an unpaid
         deposit holds the search through the client's own gate instead. */
      const pl = inv.placement;
      if (!pl || pl.ended_on || pl.suspended_at) continue;
      const { data: paused, error: e3 } = await sb.from('placements')
        .update({ suspended_at: new Date().toISOString(), suspended_reason: `Invoice ${inv.number ?? inv.id} unpaid 14 days` })
        .eq('id', pl.id).is('suspended_at', null).is('ended_on', null).select('id');
      if (e3) { errors.push(`pause ${pl.id}: ${e3.message}`); continue; }
      if (!(paused ?? []).length) continue;
      out.paused++;

      const execName = who?.org_name ?? who?.full_name ?? 'your executive';
      const talent = pl.talent;
      if (who?.email) await send(who.email, billingTemplates.placementPausedClient({
        name: first(who.full_name), number: inv.number ?? 'on file', amount: money(inv.amount_cents),
        talent: talent?.full_name ?? 'your placement', payUrl }));
      if (talent?.email) await send(talent.email, billingTemplates.placementPausedTalent({
        name: first(talent.full_name), executive: who?.full_name ?? execName }));
      await tellTeam(() => billingTemplates.placementPausedTeam({
        client: execName, talent: talent?.full_name ?? 'their talent',
        number: inv.number ?? 'on file', amount: money(inv.amount_cents) }));
      await sb.from('invoices').update({ reminders_sent: [...new Set([...sent, ...REMINDER_DAYS, 14])] }).eq('id', inv.id);
    }
  } catch (e: any) { errors.push(`reminders: ${e?.message ?? e}`); }

  /* 4. lift any pause whose balance is settled */
  try {
    const { data, error } = await sb.from('placements')
      .select('client_id').not('suspended_at', 'is', null);
    if (error) throw new Error(error.message);
    for (const c of new Set(((data ?? []) as any[]).map(r => r.client_id as string)))
      out.resumed += await liftSuspensionIfClear(sb, c);
  } catch (e: any) { errors.push(`lift: ${e?.message ?? e}`); }

  if (errors.length) {
    await tellTeam(() => billingTemplates.cronFailed({ job: 'Daily billing run', detail: errors.join('\n') }));
    const res = NextResponse.json({ ok: false, ...out, errors }, { status: 500 });
    res.headers.set('x-alerted', '1');
    return res;
  }

  return NextResponse.json({
    ok: true, ...out,
    note: 'Invoices are drafts until somebody sends them, and payments are due until somebody records them.'
  });
}
