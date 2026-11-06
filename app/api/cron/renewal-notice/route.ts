import { NextResponse } from 'next/server';
import { cronAllowed, cronClient } from '@/lib/cron-auth';
import { send } from '@/lib/email';
import { billingTemplates } from '@/lib/email-billing';
import { teamAddresses } from '@/lib/billing';
import { dayLabel } from '@/lib/money-public';

export const dynamic = 'force-dynamic';

/* Initial-term reminder (6 November 2026). The Client Services Agreement
   renews a Placement automatically in three-month terms and needs 30 days'
   notice not to (3.7). Forty-five days before the minimum ends, the executive
   and the team get one courtesy note giving the notice deadline. One per
   placement per term: the email log is the record, keyed on the subject. */
const LEAD_DAYS = 45;

export async function POST(req: Request) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'no' }, { status: 401 });
  const sb = cronClient();
  if (!sb) return NextResponse.json({ error: 'not configured' }, { status: 500 });
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const limit = new Date(Date.now() + LEAD_DAYS * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const { data: rows } = await sb.from('placements')
      .select('id, client_id, talent:talent_id(full_name), client:client_id(full_name, org_name, email), terms:placement_terms(notice_ends_on)')
      .is('ended_on', null);
    const team = await teamAddresses();
    let sent = 0;
    for (const r of (rows ?? []) as any[]) {
      const terms = Array.isArray(r.terms) ? r.terms[0] : r.terms;
      if (terms?.notice_ends_on || !r.client?.email) continue;
      const { data: end } = await sb.rpc('placement_minimum_ends', { p_id: r.id });
      const endIso = typeof end === 'string' ? end.slice(0, 10) : null;
      if (!endIso || endIso < today || endIso > limit) continue;
      const noticeBy = new Date(new Date(endIso + 'T00:00:00Z').getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
      const who = `${r.client.org_name ?? r.client.full_name}${r.talent?.full_name ? ` (${r.talent.full_name})` : ''}`;
      const msgToClient = billingTemplates.renewalNotice({
        name: (r.client.full_name ?? '').split(' ')[0] || 'there', who, endsOn: dayLabel(endIso),
        noticeBy: dayLabel(noticeBy), renewMonths: 3, toTeam: false });
      const { count } = await sb.from('email_log').select('id', { count: 'exact', head: true })
        .eq('to_addr', r.client.email).eq('subject', msgToClient.subject).eq('ok', true);
      if ((count ?? 0) > 0) continue;
      if (await send(r.client.email, msgToClient)) {
        sent++;
        const toTeam = billingTemplates.renewalNotice({
          name: 'there', who, endsOn: dayLabel(endIso), noticeBy: dayLabel(noticeBy), renewMonths: 3, toTeam: true });
        for (const t of team) await send(t, toTeam);
      }
    }
    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    console.error('[cron renewal-notice]', e);
    return NextResponse.json({ error: e?.message ?? 'The renewal notices could not run.' }, { status: 500 });
  }
}
