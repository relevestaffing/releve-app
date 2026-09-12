import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { allInvoices, moneySummary } from '@/lib/money';
import { listPayments, marginSummary, getPayout, unpaidPlacements } from '@/lib/payout';
import { RunPayroll, PaymentRow } from '@/components/PayrollDesk';
import { periodLabel } from '@/lib/payout-public';
import {
  money, dayLabel, minimumTermEnds,
  MINIMUM_MONTHS, firstMonday
} from '@/lib/money-public';
import Shell from '@/components/Shell';
import { stripeReady } from '@/lib/stripe';
import InvoiceTable from '@/components/InvoiceTable';
import RateSetter from '@/components/RateSetter';
import { RunTheMonth } from '@/components/InvoiceControls';
import DepositControl from '@/components/DepositControl';
import type { DepositStatus } from '@/lib/money-public';
import Explain from '@/components/Explain';

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
  id: string; client_id: string | null; role_title: string; opened_at: string; stage: string;
  deposit_status: DepositStatus; deposit_cents: number;
  client_name: string; org_name: string | null;
  /* true while the executive has not signed in yet: the search hangs off
     their pending record, and the deposit can only be marked, not invoiced */
  pending: boolean;
};

/* Every search that is still open — including the newest client's, opened
   from "Send onboarding email" before they have signed in. Those used to be
   filtered out here while the dashboard counted their deposit as due and
   pointed at this page, where the row did not exist. */
async function openSearches(): Promise<Search[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('searches')
    .select('id, client_id, pending_id, role_title, opened_at, stage, deposit_status, deposit_cents, closed_at, ' +
            'client:client_id(full_name, org_name), pending:pending_id(full_name, org_name)')
    .is('closed_at', null)
    .order('opened_at', { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id, client_id: r.client_id ?? null, role_title: r.role_title,
    opened_at: r.opened_at, stage: r.stage,
    deposit_status: (r.deposit_status ?? 'due') as DepositStatus,
    deposit_cents: r.deposit_cents ?? 50000,
    client_name: r.client?.full_name ?? r.pending?.full_name ?? 'Client',
    org_name: r.client?.org_name ?? r.pending?.org_name ?? null,
    pending: !r.client_id
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

  /* What Relève actually earns. Both numbers were already in the database and
     deliberately never joined, so profit was not visible anywhere. */
  const margin = await marginSummary();
  const payments = await listPayments();
  const duePayments = payments.filter(p => p.state !== 'sent');
  /* Paid stays visible: the point of recording a payment is answering "was I
     paid for October?" six months later, which a list that forgets the moment
     something is marked sent cannot do. */
  const paidPayments = payments.filter(p => p.state === 'sent');
  const dueTotal = duePayments.reduce((n, p) => n + (p.amount_cents ?? 0), 0);
  const unpaid = await unpaidPlacements();
  const payoutBy: Record<string, any> = {};
  for (const p of duePayments) {
    if (!(p.talent_id in payoutBy)) payoutBy[p.talent_id] = await getPayout(p.talent_id);
  }

  const today = new Date();
  const thisMonth = today.toISOString().slice(0, 10);
  const billingDay = firstMonday(today).toISOString().slice(0, 10);
  const live = placements.filter(p => !p.ended_on);

  /* Who has a mandate on file, so the table can show a Charge button rather
     than one that fails when pressed. One query for the page rather than one
     per row. */
  let methods = new Map<string, { label: string; ok: boolean }>();
  if (configured() && stripeReady()) {
    const sb = await supabaseServer();
    const { data } = await sb.from('billing_accounts')
      .select('client_id, method_kind, bank_name, last4, mandate_ok');
    methods = new Map((data ?? []).map((b: any) => [b.client_id, {
      label: b.method_kind === 'card'
        ? `card ···${b.last4 ?? '????'}`
        : `${b.bank_name ?? 'bank'} ···${b.last4 ?? '????'}`,
      ok: Boolean(b.mandate_ok)
    }]));
  }

  return (
    <Shell profile={profile} active="/console/money" title="Billing"
      crumb="Deposits, rates and invoices"
      action={<RunTheMonth month={thisMonth} />}>

      {/* Gross, cost, net. The first two were on separate pages and the third
          did not exist anywhere in the product. */}
      <div className="money-strip">
        <div className="money-stat">
          <div className="n">{money(margin.grossCents)}</div>
          <div className="k">Billed monthly</div>
        </div>
        <div className="money-stat">
          <div className="n">{money(margin.costCents)}</div>
          <div className="k">Paid out monthly</div>
        </div>
        <div className="money-stat">
          <div className="n">{money(margin.netCents)}</div>
          <div className="k">Yours{margin.pct != null ? ` · ${margin.pct}%` : ''}</div>
        </div>
        <div className={`money-stat ${sum.overdueCents > 0 ? 'alert' : ''}`}>
          <div className="n">{money(sum.overdueCents)}</div>
          <div className="k">Overdue · {sum.overdueCount}</div>
        </div>
      </div>
      {margin.counted < margin.total && (
        <div style={{ margin: '-8px 0 20px' }}>
          <Explain>
            Those three figures cover {margin.counted} of {margin.total} live placements.
            The rest are missing either a client rate or a talent rate, so they are left out
            rather than quietly counted as free.
          </Explain>
        </div>
      )}

      <h3 className="section-h">Money in</h3>
      <div className="money-strip">
        <div className="money-stat">
          <div className="n">{money(sum.monthlyRunRateCents)}</div>
          <div className="k">Monthly run rate</div>
        </div>
        <div className="money-stat">
          <div className="n">{money(sum.outstandingCents)}</div>
          <div className="k">Asked for · {sum.unpaidCount}</div>
        </div>
        <div className={`money-stat ${sum.draftCount > 0 ? 'alert' : ''}`}>
          <div className="n">{sum.draftCount}</div>
          <div className="k">Drafted, not sent</div>
        </div>
        <div className={`money-stat ${sum.suspendableCount > 0 ? 'alert' : ''}`}>
          <div className="n">{sum.suspendableCount}</div>
          <div className="k">14 days late</div>
        </div>
      </div>
      {sum.draftCount > 0 && (
        <div style={{ margin: '-8px 0 20px' }}>
          <Explain>
            {money(sum.draftCents)} is drafted and has not been sent to anybody. Drafts are
            not counted as owed, because nobody has been asked for them yet — set one to
            <b> Sent</b> and the client is emailed it.
          </Explain>
        </div>
      )}

      {/* ---------- money out ---------- */}
      <div className="row between" style={{ alignItems: 'center' }}>
        <h3 className="section-h" id="money-out" style={{ margin: 0 }}>Money out{duePayments.length > 0 && <span className="muted"> · {money(dueTotal)} owed</span>}</h3>
        <RunPayroll month={thisMonth} />
      </div>
      {unpaid.length > 0 && (
        <div className="card tight" style={{ borderLeft: '3px solid var(--warn, #B4762E)' }}>
          <p className="small" style={{ margin: 0 }}>
            <b>{unpaid.length === 1 ? `${unpaid[0].talent_name} has` : `${unpaid.length} placed people have`} no pay on file</b>, so
            the payroll run skips them without a word. Set what Relève pays them on the{' '}
            <Link href="/console/bench">Talent Roster</Link> and they join the next run.
          </p>
        </div>
      )}
      <div className="card">
        {duePayments.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Nobody is waiting to be paid. Press <b>Run payroll</b> after the
            billing run and every live placement appears here with what it owes them.
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Explain>
                Relève sends this money itself — the app records it so that a question in six
                months has an answer rather than a search through a bank statement.
              </Explain>
            </div>
            {duePayments.map(p => (
              <div key={p.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                <PaymentRow p={p} payout={payoutBy[p.talent_id] ?? null} />
              </div>
            ))}
          </>
        )}
        {paidPayments.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary className="small" style={{ cursor: 'pointer' }}>Paid · {paidPayments.length}</summary>
            <table className="data" style={{ boxShadow: 'none', marginTop: 8 }}>
              <thead><tr><th>Person</th><th>Period</th><th style={{ textAlign: 'right' }}>Amount</th><th>Sent</th><th>Method · reference</th></tr></thead>
              <tbody>
                {paidPayments.map(p => (
                  <tr key={p.id}>
                    <td>{p.talent_name ?? 'Talent'}</td>
                    <td className="xs">{periodLabel(p.period_start)}</td>
                    <td className="amount">{money(p.amount_cents)}</td>
                    <td className="xs">{p.sent_on ? dayLabel(p.sent_on) : '—'}</td>
                    <td className="xs muted">{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      {sum.placementsWithoutRate > 0 && (
        <div className="card tight">
          <p className="small">
            <b>{sum.placementsWithoutRate} placement{sum.placementsWithoutRate === 1 ? ' has' : 's have'} no
            rate set.</b> They are skipped by the monthly run, so nothing is billed for them.
            Set the rate below and they join the next issue.
          </p>
        </div>
      )}

      {searches.length > 0 && (
        <div className="card">
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
                  <td>{sr.org_name ?? sr.client_name}
                    {sr.pending && <div className="xs muted">No account yet — the pay link is in their onboarding email</div>}</td>
                  <td className="xs">{sr.role_title}</td>
                  <td className="xs">{dayLabel(sr.opened_at)}</td>
                  <td className="xs">{sr.stage}</td>
                  <td>
                    <DepositControl key={sr.deposit_status} searchId={sr.id} clientId={sr.client_id ?? ''}
                      status={sr.deposit_status} cents={sr.deposit_cents}
                      invoiced={depositInvoiced.has(sr.id) || sr.pending} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 14 }}>
            <Explain>
              The deposit is credited against the client's first monthly invoice.
            </Explain>
          </div>
        </div>
      )}

      <div className="card">
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
        <div style={{ marginTop: 14 }}>
          <Explain>
            This is what the client pays Relève. What the talent is paid is on their
            profile and never appears on anything a client can open.
          </Explain>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3 id="invoices">Invoices</h3></div>
        {!invoices.length ? (
          <p className="small muted">
            Nothing issued yet. Set a rate on a placement, then press <b>Run the month</b>.
          </p>
        ) : (
          <InvoiceTable invoices={invoices} stripeOn={stripeReady()} methods={Object.fromEntries(methods)} />
        )}
        <div style={{ marginTop: 14, maxWidth: 640 }}>
          <Explain>
            {stripeReady()
              ? <>Charging submits a bank debit against the mandate that executive set up. It does not mark anything paid — bank transfers take a few days, and Stripe telling us the money landed is the only thing that moves an invoice to paid. A debit can also fail after being accepted, which is why <b>Failed</b> exists and puts it back on this list with the reason.</>
              : <>Payments are not switched on yet. These are records — you collect however you already do, and mark them paid when the money lands.</>}
          </Explain>
        </div>
      </div>
    </Shell>
  );
}
