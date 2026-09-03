import { redirect } from 'next/navigation';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { allInvoices, moneySummary } from '@/lib/money';
import {
  money, dayLabel, monthLabel, daysOverdue, minimumTermEnds,
  MINIMUM_MONTHS, firstMonday
} from '@/lib/money-public';
import Shell from '@/components/Shell';
import RateSetter from '@/components/RateSetter';
import { InvoiceStatusPicker, RunTheMonth } from '@/components/InvoiceControls';
import DepositControl from '@/components/DepositControl';
import type { DepositStatus } from '@/lib/money-public';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; started_on: string; ended_on: string | null;
  rate_month_cents: number | null; minimum_months: number; notice_given_on: string | null;
  client_name: string; org_name: string | null; talent_name: string;
};

async function livePlacements(): Promise<Row[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, started_on, ended_on, ' +
            'terms:placement_terms(rate_month_cents, minimum_months, notice_given_on), ' +
            'client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .order('started_on', { ascending: false });
  return (data ?? []).map((r: any) => {
    const t = Array.isArray(r.terms) ? r.terms[0] : r.terms;
    return ({
    id: r.id, started_on: r.started_on, ended_on: r.ended_on,
    rate_month_cents: t?.rate_month_cents ?? null,
    minimum_months: t?.minimum_months ?? MINIMUM_MONTHS,
    notice_given_on: t?.notice_given_on ?? null,
    client_name: r.client?.full_name ?? 'Client',
    org_name: r.client?.org_name ?? null,
    talent_name: r.talent?.full_name ?? 'Talent'
    });
  });
}

type Search = {
  id: string; client_id: string; role_title: string; opened_at: string; stage: string;
  deposit_status: DepositStatus; deposit_cents: number;
  client_name: string; org_name: string | null;
};

async function openSearches(): Promise<Search[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('searches')
    .select('id, client_id, role_title, opened_at, stage, deposit_status, deposit_cents, ' +
            'client:client_id(full_name, org_name)')
    .not('client_id', 'is', null)
    .order('opened_at', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, client_id: r.client_id, role_title: r.role_title,
    opened_at: r.opened_at, stage: r.stage,
    deposit_status: (r.deposit_status ?? 'due') as DepositStatus,
    deposit_cents: r.deposit_cents ?? 50000,
    client_name: r.client?.full_name ?? 'Client',
    org_name: r.client?.org_name ?? null
  }));
}

export default async function ConsoleMoney() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const [sum, invoices, placements, searches] = await Promise.all([
    moneySummary(), allInvoices(), livePlacements(), openSearches()
  ]);
  const depositInvoiced = new Set(
    invoices.filter(i => i.kind === 'deposit' && i.search_id).map(i => i.search_id as string)
  );

  const today = new Date();
  const thisMonth = today.toISOString().slice(0, 10);
  const billingDay = firstMonday(today).toISOString().slice(0, 10);
  const live = placements.filter(p => !p.ended_on);

  return (
    <Shell profile={profile} active="/console/money" title="Money"
      crumb="Deposits, rates and invoices"
      action={<RunTheMonth month={thisMonth} />}>

      <div className="money-strip">
        <div className="money-stat">
          <div className="n">{money(sum.monthlyRunRateCents)}</div>
          <div className="k">Monthly run rate</div>
        </div>
        <div className="money-stat">
          <div className="n">{money(sum.outstandingCents)}</div>
          <div className="k">Outstanding · {sum.unpaidCount}</div>
        </div>
        <div className={`money-stat ${sum.overdueCents > 0 ? 'alert' : ''}`}>
          <div className="n">{money(sum.overdueCents)}</div>
          <div className="k">Overdue · {sum.overdueCount}</div>
        </div>
        <div className={`money-stat ${sum.suspendableCount > 0 ? 'alert' : ''}`}>
          <div className="n">{sum.suspendableCount}</div>
          <div className="k">14 days late</div>
        </div>
      </div>

      {sum.placementsWithoutRate > 0 && (
        <div className="card tight" style={{ marginBottom: 22 }}>
          <p className="small">
            <b>{sum.placementsWithoutRate} placement{sum.placementsWithoutRate === 1 ? ' has' : 's have'} no
            rate set.</b> They are skipped by the monthly run, so nothing is billed for them.
            Set the rate below and they join the next issue.
          </p>
        </div>
      )}

      {searches.length > 0 && (
        <div className="card" style={{ marginBottom: 26 }}>
          <div className="card-head">
            <h3>Search deposits</h3>
            <span className="xs muted">$500 once a search begins · non-refundable</span>
          </div>
          <table className="data">
            <thead><tr>
              <th>Client</th><th>Role</th><th>Opened</th><th>Stage</th><th>Deposit</th>
            </tr></thead>
            <tbody>
              {searches.map(sr => (
                <tr key={sr.id}>
                  <td>{sr.org_name ?? sr.client_name}</td>
                  <td className="xs">{sr.role_title}</td>
                  <td className="xs">{dayLabel(sr.opened_at)}</td>
                  <td className="xs">{sr.stage}</td>
                  <td>
                    <DepositControl searchId={sr.id} clientId={sr.client_id}
                      status={sr.deposit_status} cents={sr.deposit_cents}
                      invoiced={depositInvoiced.has(sr.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="xs muted" style={{ marginTop: 14 }}>
            The deposit is credited against the client's first monthly invoice.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 26 }}>
        <div className="card-head">
          <h3>Placements and rates</h3>
          <span className="xs muted">Billing day this month · {dayLabel(billingDay)}</span>
        </div>
        {!live.length ? <p className="small muted">No live placements yet.</p> : (
          <table className="data">
            <thead><tr>
              <th>Client</th><th>Talent</th><th>Started</th>
              <th>Minimum term ends</th><th style={{ textAlign: 'right' }}>Client pays</th>
            </tr></thead>
            <tbody>
              {live.map(p => {
                const ends = minimumTermEnds(p.started_on, p.minimum_months);
                const inTerm = ends >= new Date().toISOString().slice(0, 10);
                return (
                  <tr key={p.id}>
                    <td>{p.org_name ?? p.client_name}
                      {p.notice_given_on &&
                        <><br /><span className="xs muted">Notice given {dayLabel(p.notice_given_on)}</span></>}
                    </td>
                    <td>{p.talent_name}</td>
                    <td className="xs">{dayLabel(p.started_on)}</td>
                    <td className="xs">
                      {dayLabel(ends)}
                      {inTerm && <span className="pill" style={{ marginLeft: 8 }}>In term</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <RateSetter placementId={p.id} cents={p.rate_month_cents} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="xs muted" style={{ marginTop: 14 }}>
          This is what the client pays Relève. What the talent is paid is on their
          profile and never appears on anything a client can open.
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h3>Invoices</h3></div>
        {!invoices.length ? (
          <p className="small muted">
            Nothing issued yet. Set a rate on a placement, then press <b>Issue this month</b>.
          </p>
        ) : (
          <table className="data">
            <thead><tr>
              <th>Number</th><th>Client</th><th>For</th><th>Issued</th>
              <th style={{ textAlign: 'right' }}>Amount</th><th>Status</th>
            </tr></thead>
            <tbody>
              {invoices.map(i => {
                const late = daysOverdue(i.due_on);
                const open = i.status === 'draft' || i.status === 'sent';
                return (
                  <tr key={i.id}>
                    <td className="inv-num xs">{i.number ?? <span className="muted">draft</span>}</td>
                    <td>{i.org_name ?? i.client_name}</td>
                    <td className="xs">
                      {i.kind === 'deposit' ? 'Search deposit' : monthLabel(i.period_start)}
                    </td>
                    <td className="xs">{dayLabel(i.issued_on)}
                      {open && late >= 14 &&
                        <><br /><span className="pill crit">{late} days late</span></>}
                      {open && late > 0 && late < 14 &&
                        <><br /><span className="pill warn">{late} day{late === 1 ? '' : 's'} late</span></>}
                    </td>
                    <td className="amount">{money(i.amount_cents)}</td>
                    <td><InvoiceStatusPicker inv={i} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="xs muted" style={{ marginTop: 14 }}>
          Relève does not take payment here. These are the records — you send and
          collect however you already do, and mark them paid when the money lands.
        </p>
      </div>
    </Shell>
  );
}
