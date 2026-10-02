import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { listInvoicesFor } from '@/lib/money';
import {
  money, dayLabel, monthLabel, daysOverdue, addDaysISO,
  MINIMUM_MONTHS, NOTICE_TERMS, minimumTermEnds
} from '@/lib/money-public';
import { PAYMENT_STATUS } from '@/lib/billing-public';
import BillingReturnBanner from '@/components/BillingReturnBanner';
import Shell from '@/components/Shell';
import Explain from '@/components/Explain';
import PaymentMethod from '@/components/PaymentMethod';
import PayInvoiceButton from '@/components/PayInvoiceButton';
import { billingAccount } from '@/lib/billing';
import { stripeReady } from '@/lib/stripe';
import { todayIn } from '@/lib/experience-public';

export const dynamic = 'force-dynamic';

/* The client's own view of what they are paying. Deliberately plain: what is
   owed, what it is for, and when the commitment ends. No talent pay appears
   here or anywhere a client can reach — that is the standing rule. */
export default async function Billing() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console/money');
  if (profile.role !== 'client') redirect('/app');

  const invoices = await listInvoicesFor(profile.id);
  const account = await billingAccount(profile.id);

  let live: any[] = [];
  let tz: string | null = null;
  if (configured()) {
    const sb = await supabaseServer();
    const { data: me } = await sb.from('profiles').select('timezone').eq('id', profile.id).maybeSingle();
    tz = (me as any)?.timezone ?? null;
    const { data: placements } = await sb.from('placements')
      .select('id, started_on, talent:talent_id(full_name)')
      .eq('client_id', profile.id).is('ended_on', null);
    /* The client may read their own rate; talent pay lives on the same row
       and must never reach them, so this reads my_placement_terms (PART 33)
       rather than placement_terms directly — that base table has no client
       policy left at all. */
    const ids = (placements ?? []).map((p: any) => p.id);
    const { data: terms } = ids.length
      ? await sb.from('my_placement_terms')
          .select('placement_id, rate_month_cents, minimum_months, notice_given_on, notice_ends_on, minimum_ends')
          .in('placement_id', ids)
      : { data: [] as any[] };
    const byId = new Map((terms ?? []).map((t: any) => [t.placement_id, t]));
    live = (placements ?? []).map((r: any) => {
      const t = byId.get(r.id);
      return { ...r, rate_month_cents: t?.rate_month_cents ?? null,
               minimum_months: t?.minimum_months ?? MINIMUM_MONTHS,
               notice_given_on: t?.notice_given_on ?? null,
               notice_ends_on: t?.notice_ends_on ?? null,
               minimum_ends: t?.minimum_ends ?? null };
    });
  }

  /* "Today" where the client is, so a term that ends today still reads as in
     term for them; business dates themselves stay recorded in Pacific time. */
  const today = todayIn(tz ?? 'America/Los_Angeles');

  /* Money already collected and clearing is not outstanding — showing it as
     owed makes a client think they have missed something days after they
     paid, which is the most annoying possible way to be wrong. */
  const open = invoices.filter(i => i.status === 'sent' || i.status === 'failed');
  const clearing = invoices.filter(i => i.status === 'processing');
  const owed = open.reduce((n, i) => n + i.amount_cents, 0);
  const monthly = live.reduce((n, p) => n + (p.rate_month_cents ?? 0), 0);

  return (
    <Shell profile={profile} active="/app/billing" title="Billing" crumb="What you are paying, and when">

      <BillingReturnBanner />
      <PaymentMethod account={account} ready={stripeReady()} />

      <div className="money-strip">
        <div className="money-stat">
          <div className="n">{money(monthly)}</div>
          <div className="k">Per month</div>
        </div>
        <div className={`money-stat ${owed > 0 ? 'alert' : ''}`}>
          <div className="n">{money(owed)}</div>
          <div className="k">{owed > 0 ? `Outstanding · ${open.length}` : 'Nothing outstanding'}</div>
        </div>
        {clearing.length > 0 && (
          <div className="money-stat">
            <div className="n">{money(clearing.reduce((n, i) => n + i.amount_cents, 0))}</div>
            <div className="k">Clearing</div>
          </div>
        )}
      </div>

      {live.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Your placements</h3></div>
          {live.map((p: any) => {
            const minEnds: string = p.minimum_ends ?? minimumTermEnds(p.started_on, p.minimum_months ?? MINIMUM_MONTHS);
            const minLast = addDaysISO(minEnds, -1);
            const inTerm = minLast >= today;
            return (
              <div key={p.id} className="row between" style={{ padding: '12px 0', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <b>{p.talent?.full_name ?? 'Your placement'}</b>
                  <div className="xs muted">
                    Started {dayLabel(p.started_on)} · {inTerm
                      ? `minimum term runs through ${dayLabel(minLast)}`
                      : 'month to month'}
                  </div>
                  {p.notice_given_on &&
                    <div className="xs muted">Notice given {dayLabel(p.notice_given_on)}
                      {p.notice_ends_on ? `. Runs and is billed through ${dayLabel(p.notice_ends_on)}` : ''}</div>}
                </div>
                <b className="amount">{money(p.rate_month_cents)}<span className="xs muted"> /mo</span></b>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Invoices</h3></div>
        {!invoices.length ? (
          <p className="small muted">Nothing has been invoiced yet.</p>
        ) : (
          <table className="data">
            <thead><tr>
              <th>Number</th><th>For</th><th>Dated</th>
              <th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {invoices.map(i => {
                const late = daysOverdue(i.due_on);
                const openInv = i.status === 'sent' || i.status === 'failed';
                const st = PAYMENT_STATUS[i.status] ?? { label: i.status, tone: '' };
                return (
                  <tr key={i.id}>
                    <td className="inv-num xs">
                      <Link href={`/app/billing/${i.id}`}>
                        {i.number ?? <span className="muted">pending</span>}
                      </Link>
                    </td>
                    <td className="xs">
                      {i.kind === 'deposit' ? 'Search deposit' : monthLabel(i.period_start)}
                    </td>
                    <td className="xs">{dayLabel(i.issued_on)}
                      {openInv && late > 0 &&
                        <><br /><span className="pill warn">
                          {late} day{late === 1 ? '' : 's'} open
                        </span></>}
                    </td>
                    <td className="amount">{money(i.amount_cents, true)}</td>
                    <td><span className={`pill ${st.tone}`}>{st.label}</span></td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <Link className="btn sm ghost" href={`/app/billing/${i.id}`}>View</Link>
                        {openInv && i.amount_cents > 0 && stripeReady() &&
                          <PayInvoiceButton invoiceId={i.id} label="Pay" className="btn sm solid" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 14 }}>
          <Explain>
            Invoices are dated the first Monday of each month and are due on receipt.
            A first or final month is billed by the day. Your $500 search deposit is
            credited on your first invoice. {NOTICE_TERMS} The full terms are at
            relevestaffing.com/terms.
          </Explain>
        </div>
      </div>
    </Shell>
  );
}
