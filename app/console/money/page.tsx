import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { allInvoices, moneySummary, isOwner } from '@/lib/money';
import { listPayments, marginSummary, getPayout, unpaidPlacements } from '@/lib/payout';
import { RunPayroll, PaymentRow } from '@/components/PayrollDesk';
import { periodLabel } from '@/lib/payout-public';
import {
  money, dayLabel, minimumTermEnds, addDaysISO, todayInPacific, monthStartPacific,
  MINIMUM_MONTHS, firstMonday, NOTICE_TERMS
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
  notice_ends_on: string | null; suspended_at: string | null;
  client_id: string | null;
  client_name: string; org_name: string | null; talent_name: string;
};

async function livePlacements(): Promise<Row[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('placements')
    .select('id, client_id, started_on, ended_on, suspended_at, ' +
            'terms:placement_terms(rate_month_cents, minimum_months, notice_given_on, notice_ends_on), ' +
            'client:client_id(full_name, org_name), talent:talent_id(full_name)')
    .order('started_on', { ascending: false });
  return (data ?? []).map((r: any) => {
    const t = Array.isArray(r.terms) ? r.terms[0] : r.terms;
    return ({
    id: r.id, started_on: r.started_on, ended_on: r.ended_on,
    rate_month_cents: t?.rate_month_cents ?? null,
    minimum_months: t?.minimum_months ?? MINIMUM_MONTHS,
    notice_given_on: t?.notice_given_on ?? null,
    notice_ends_on: t?.notice_ends_on ?? null,
    suspended_at: r.suspended_at ?? null,
    client_id: r.client_id ?? null,
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

  const [sum, invoices, placements, searches, owner] = await Promise.all([
    moneySummary(), allInvoices(), livePlacements(), openSearches(), isOwner()
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

  const todayP = todayInPacific();
  const thisMonth = monthStartPacific();
  const lastMonth = (() => { const d = new Date(thisMonth + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const billingDay = firstMonday(new Date(thisMonth + 'T12:00:00Z')).toISOString().slice(0, 10);
  const live = placements.filter(p => !p.ended_on);
  const paused = live.filter(p => p.suspended_at);

  /* Money moves on a signed agreement (B21). The Terms are accepted in the
     app by everyone; this is the Client Services Agreement on top. Named, not
     blocked: the call is the owner's. */
  let unsigned: Row[] = [];
  if (configured() && live.length) {
    const sb = await supabaseServer();
    const { data: signedRows, error } = await sb.from('client_agreements').select('client_id').eq('state', 'verified');
    if (!error) {
      const signed = new Set(((signedRows ?? []) as any[]).map(r => r.client_id));
      unsigned = live.filter(p => p.client_id && !signed.has(p.client_id));
    }
  }

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
      action={<RunTheMonth month={thisMonth} previous={lastMonth} />}>

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

      {unsigned.length > 0 && (
        <div className="card tight" style={{ borderLeft: '3px solid var(--warn)' }}>
          <p className="small" style={{ margin: 0 }}>
            <b>{unsigned.length === 1 ? 'One live placement is' : `${unsigned.length} live placements are`} billing without a signed
            Client Services Agreement:</b>{' '}
            {unsigned.map((p, i) => <span key={p.id}>{i ? ', ' : ''}{p.org_name ?? p.client_name}</span>)}.
            Send it from Executives before the next invoice goes out.
          </p>
        </div>
      )}

      {(paused.length > 0 || sum.disputedCount > 0 || sum.failedCount > 0) && (
        <div className="card tight" style={{ borderLeft: '3px solid var(--warn)' }}>
          {paused.length > 0 && (
            <p className="small" style={{ margin: '0 0 6px' }}>
              <b>{paused.length} placement{paused.length === 1 ? ' is' : 's are'} paused</b> for an invoice open fourteen days:{' '}
              {paused.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link href={`/console/placements/${p.id}`}>{p.org_name ?? p.client_name}</Link></span>)}.
              Payroll for {paused.length === 1 ? 'it is' : 'them is'} not created while paused, and each resumes on its own the day the invoice is paid.
            </p>
          )}
          {sum.failedCount > 0 && (
            <p className="small" style={{ margin: '0 0 6px' }}>
              <b>{sum.failedCount} payment{sum.failedCount === 1 ? '' : 's'} did not go through.</b> The client has a banner and an email
              with a pay link; a retry from the table below also works once they have fixed it.
            </p>
          )}
          {sum.disputedCount > 0 && (
            <p className="small" style={{ margin: 0 }}>
              <b>{sum.disputedCount} payment{sum.disputedCount === 1 ? ' is' : 's are'} disputed.</b> Respond in the Stripe dashboard
              with the signed agreement and the invoice document.
            </p>
          )}
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
          <div className="k">Open 14 days or more</div>
        </div>
      </div>
      {sum.draftCount > 0 && (
        <div style={{ margin: '-8px 0 20px' }}>
          <Explain>
            {money(sum.draftCents)} is drafted and has not been sent to anybody. Drafts are
            not counted as owed, because nobody has been asked for them yet. Choose <b>Send</b>
            and the client is emailed it, with a pay link; autopay collects it if they have a payment method on file.
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
            the payroll run skips them. Set what Relève pays them on each{' '}
            <Link href={`/console/placements/${unpaid[0].placement_id}`}>placement file</Link> and they join the next run.
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
                Relève sends this money itself, in US dollars. The app records what was owed, what was
                sent, any fee and what landed, so a question in six months has an answer rather than
                a search through a bank statement. A first or final month is paid by the day.
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
              <thead><tr><th>Person</th><th>Period</th><th style={{ textAlign: 'right' }}>Owed (USD)</th><th style={{ textAlign: 'right' }}>Sent</th><th>On</th><th>Method · reference</th></tr></thead>
              <tbody>
                {paidPayments.map(p => (
                  <tr key={p.id}>
                    <td>{p.talent_name ?? 'Talent'}</td>
                    <td className="xs">{periodLabel(p.period_start)}</td>
                    <td className="amount">{money(p.amount_cents, true)}</td>
                    <td className="amount">{money(p.sent_cents ?? p.amount_cents, true)}{p.fee_cents ? <div className="xs muted">fee {money(p.fee_cents, true)}</div> : null}</td>
                    <td className="xs">{p.sent_on ? dayLabel(p.sent_on) : '–'}</td>
                    <td className="xs muted">{[p.method, p.reference, p.fx_note].filter(Boolean).join(' · ') || '–'}</td>
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
            <span className="xs muted">$500 once a search begins · non-refundable · marking paid or waived is the owner&rsquo;s</span>
          </div>
          <table className="data">
            <thead><tr>
              <th>Client</th><th>Role</th><th>Opened</th><th>Stage</th><th>Deposit</th>
            </tr></thead>
            <tbody>
              {searches.map(sr => (
                <tr key={sr.id}>
                  <td>{sr.org_name ?? sr.client_name}
                    {sr.pending && <div className="xs muted">No account yet. The pay link is in their onboarding email</div>}</td>
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
              The deposit is credited against the client&rsquo;s first monthly invoice. Any amount it does
              not cover carries to the next one, and voiding an invoice gives the credit back.
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
              <th>Minimum term</th><th style={{ textAlign: 'right' }}>Client pays</th>
            </tr></thead>
            <tbody>
              {live.map(p => {
                const minLast = addDaysISO(minimumTermEnds(p.started_on, p.minimum_months), -1);
                const inTerm = minLast >= todayP;
                return (
                  <tr key={p.id}>
                    <td><Link href={`/console/placements/${p.id}`}>{p.org_name ?? p.client_name}</Link>
                      {p.notice_given_on &&
                        <><br /><span className="xs muted">Notice {dayLabel(p.notice_given_on)}{p.notice_ends_on ? `, ends ${dayLabel(p.notice_ends_on)}` : ''}</span></>}
                      {p.suspended_at && <><br /><span className="pill warn">Paused</span></>}
                    </td>
                    <td>{p.talent_name}</td>
                    <td className="xs">{dayLabel(p.started_on)}</td>
                    <td className="xs">
                      through {dayLabel(minLast)}
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
            This is what the client pays Relève. What the talent is paid is set on each
            placement file and never appears on anything a client can open. {NOTICE_TERMS}
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
          <InvoiceTable invoices={invoices} stripeOn={stripeReady()} methods={Object.fromEntries(methods)} owner={owner} />
        )}
        <div style={{ marginTop: 14, maxWidth: 640 }}>
          <Explain>
            {stripeReady()
              ? <>Charging submits a bank debit against the mandate that executive set up. It does not mark anything paid: bank transfers take a few days, and Stripe telling us the money landed is the only thing that moves an invoice to paid. A debit can also fail after being accepted, which is why <b>Failed</b> exists and puts it back on this list with the reason. Marking paid or void by hand, changing an amount and refunds are the owner&rsquo;s.</>
              : <>Payments are not switched on yet. These are records: you collect however you already do, and the owner marks them paid when the money lands.</>}
          </Explain>
        </div>
      </div>
    </Shell>
  );
}
