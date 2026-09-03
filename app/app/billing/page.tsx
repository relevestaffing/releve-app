import { redirect } from 'next/navigation';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { listInvoicesFor } from '@/lib/money';
import {
  money, dayLabel, monthLabel, daysOverdue,
  MINIMUM_MONTHS, NOTICE_DAYS, minimumTermEnds, INVOICE_STATUS
} from '@/lib/money-public';
import Shell from '@/components/Shell';

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

  let live: any[] = [];
  if (configured()) {
    const sb = await supabaseServer();
    const { data } = await sb.from('placements')
      .select('id, started_on, talent:talent_id(full_name), ' +
              'terms:placement_terms(rate_month_cents, minimum_months, notice_given_on)')
      .eq('client_id', profile.id).is('ended_on', null);
    /* The client may read their own terms row; talent may not read it at all. */
    live = (data ?? []).map((r: any) => {
      const t = Array.isArray(r.terms) ? r.terms[0] : r.terms;
      return { ...r, rate_month_cents: t?.rate_month_cents ?? null,
               minimum_months: t?.minimum_months ?? MINIMUM_MONTHS,
               notice_given_on: t?.notice_given_on ?? null };
    });
  }

  const open = invoices.filter(i => i.status === 'draft' || i.status === 'sent');
  const owed = open.reduce((n, i) => n + i.amount_cents, 0);
  const monthly = live.reduce((n, p) => n + (p.rate_month_cents ?? 0), 0);

  return (
    <Shell profile={profile} active="/app/billing" title="Billing" crumb="What you are paying, and when">

      <div className="money-strip">
        <div className="money-stat">
          <div className="n">{money(monthly)}</div>
          <div className="k">Per month</div>
        </div>
        <div className={`money-stat ${owed > 0 ? 'alert' : ''}`}>
          <div className="n">{money(owed)}</div>
          <div className="k">{owed > 0 ? `Outstanding · ${open.length}` : 'Nothing outstanding'}</div>
        </div>
      </div>

      {live.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-head"><h3>Your placements</h3></div>
          {live.map((p: any) => {
            const ends = minimumTermEnds(p.started_on, p.minimum_months ?? MINIMUM_MONTHS);
            const inTerm = ends >= new Date().toISOString().slice(0, 10);
            return (
              <div key={p.id} className="row between" style={{ padding: '12px 0', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <b>{p.talent?.full_name ?? 'Your placement'}</b>
                  <div className="xs muted">
                    Started {dayLabel(p.started_on)} · {inTerm
                      ? `minimum term runs to ${dayLabel(ends)}`
                      : `month to month, ${NOTICE_DAYS} days' notice`}
                  </div>
                  {p.notice_given_on &&
                    <div className="xs muted">Notice given {dayLabel(p.notice_given_on)}</div>}
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
              <th>Number</th><th>For</th><th>Issued</th>
              <th style={{ textAlign: 'right' }}>Amount</th><th>Status</th>
            </tr></thead>
            <tbody>
              {invoices.map(i => {
                const late = daysOverdue(i.due_on);
                const openInv = i.status === 'draft' || i.status === 'sent';
                const tone = INVOICE_STATUS.find(s => s.key === i.status)?.tone ?? '';
                return (
                  <tr key={i.id}>
                    <td className="inv-num xs">{i.number ?? <span className="muted">pending</span>}</td>
                    <td className="xs">
                      {i.kind === 'deposit' ? 'Search deposit' : monthLabel(i.period_start)}
                    </td>
                    <td className="xs">{dayLabel(i.issued_on)}
                      {openInv && late > 0 &&
                        <><br /><span className={`pill ${late >= 14 ? 'crit' : 'warn'}`}>
                          {late} day{late === 1 ? '' : 's'} late
                        </span></>}
                    </td>
                    <td className="amount">{money(i.amount_cents)}</td>
                    <td><span className={`pill ${tone}`}>
                      {INVOICE_STATUS.find(s => s.key === i.status)?.label}
                    </span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="xs muted" style={{ marginTop: 14 }}>
          Invoices are issued on the first Monday of each month and are due on
          receipt. Placements carry a {MINIMUM_MONTHS}-month minimum; after that
          either side may end the engagement with {NOTICE_DAYS} days' written
          notice. The full terms are at relevestaffing.com/terms.
        </p>
      </div>
    </Shell>
  );
}
