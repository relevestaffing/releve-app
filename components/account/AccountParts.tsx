import Link from 'next/link';
import type { Account } from '@/lib/account';
import { money, dayLabel, INVOICE_STATUS } from '@/lib/money-public';

/* The pieces of a person's account page (3 November 2026), shared by the
   executive and the talent account so the two read the same way: a summary
   strip that answers the four questions at a glance, then one tab each. */

const since = (iso: string) => {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso + 'T00:00:00Z').getTime()) / 864e5));
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 70) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
};
const hrs = (n: number | null) => (n == null ? 'Not reported' : `${Math.round(n * 10) / 10} hrs`);

export function Strip({ a, accountHref }: { a: Account; accountHref: (id: string) => string }) {
  const c = a.current;
  const cap = a.plan?.hoursPerWeek ?? null;
  return (
    <div className="card acct-strip">
      <div className="acct-cell">
        <div className="acct-k">Plan</div>
        {a.plan ? <>
          <div className="acct-v">{a.plan.label}</div>
          <div className="acct-s">{a.plan.price}</div>
          <div className="acct-s faint">{a.plan.detail}</div>
        </> : <><div className="acct-v none">No plan yet</div><div className="acct-s faint">Set when a placement is made</div></>}
      </div>
      <div className="acct-cell">
        <div className="acct-k">{a.side === 'client' ? 'Placed with' : 'Placed with'}</div>
        {c ? <>
          <div className="acct-v"><Link href={accountHref(c.otherId)}>{c.otherName}</Link></div>
          <div className="acct-s">Since {dayLabel(c.startedOn)} · {since(c.startedOn)}</div>
          <div className="acct-s">{c.noticeOn ? <span className="acct-tag warn">Notice given</span> : <span className="acct-tag good">Live</span>}</div>
        </> : <><div className="acct-v none">Not placed</div><div className="acct-s faint">{a.placements.length ? `${a.placements.length} past placement${a.placements.length > 1 ? 's' : ''}` : 'Never placed yet'}</div></>}
      </div>
      <div className="acct-cell">
        <div className="acct-k">Hours</div>
        {a.hours.reported ? <>
          <div className="acct-v">{a.hours.thisWeek != null ? `${a.hours.thisWeek} this week` : a.hours.lastWeek != null ? `${a.hours.lastWeek} last week` : 'Not in yet'}</div>
          <div className="acct-s">{a.hours.thisWeek != null && a.hours.lastWeek != null ? `${a.hours.lastWeek} last week · ` : ''}{a.hours.thisMonth} so far this month</div>
          <div className="acct-s faint">{cap ? `Plan allows ${cap} a week` : `${a.hours.lastFour} over the last 4 weeks`}</div>
        </> : <><div className="acct-v none">None reported</div><div className="acct-s faint">From the Friday report</div></>}
      </div>
      <div className="acct-cell">
        <div className="acct-k">{a.side === 'client' ? 'Billing' : 'Pay'}</div>
        {a.side === 'client' ? <>
          <div className="acct-v"><span className={`acct-tag ${a.billing.status.tone}`}>{a.billing.status.word}</span></div>
          <div className="acct-s">{a.billing.next ? `${money(a.billing.next.amount_cents)} due ${dayLabel(a.billing.next.due_on ?? a.billing.next.issued_on)}` : a.billing.lastPaid ? `Last paid ${dayLabel(a.billing.lastPaid.paid_on ?? a.billing.lastPaid.issued_on)}` : 'No invoices yet'}</div>
          <div className="acct-s faint">{money(a.billing.paidCents)} paid to date</div>
        </> : <>
          <div className="acct-v">{a.pay.monthCents != null ? `${money(a.pay.monthCents)} a month` : <span className="none">Not set</span>}</div>
          <div className="acct-s">{a.pay.payments[0] ? `Last paid ${money(a.pay.payments[0].amount_cents)}` : 'No payments yet'}</div>
          <div className="acct-s faint">{a.pay.payments.length} payment{a.pay.payments.length === 1 ? '' : 's'} on file</div>
        </>}
      </div>
    </div>
  );
}

export function PlacementTab({ a, accountHref, emptyText }: { a: Account; accountHref: (id: string) => string; emptyText: string }) {
  const c = a.current;
  const past = a.placements.filter(p => p !== c);
  return (
    <div className="acct-tab">
      {c ? (
        <div className="acct-hero">
          <div className="acct-hero-main">
            <div className="acct-k">Current placement</div>
            <div className="acct-hero-name"><Link href={accountHref(c.otherId)}>{c.otherName}</Link></div>
            {c.otherSub && <div className="acct-s">{c.otherSub}</div>}
          </div>
          <dl className="acct-kv">
            <dt>Status</dt><dd>{c.noticeOn ? <span className="acct-tag warn">Notice given {dayLabel(c.noticeOn)}</span> : <span className="acct-tag good">Live</span>}</dd>
            <dt>Started</dt><dd>{dayLabel(c.startedOn)} · {since(c.startedOn)} ago</dd>
            <dt>Plan</dt><dd>{c.plan ? `${c.plan.label} · ${c.plan.price}` : 'No rate set yet'}</dd>
            {a.side === 'talent' && <><dt>Their pay</dt><dd>{c.talentPayCents != null ? `${money(c.talentPayCents)} a month` : 'Not set'}</dd></>}
          </dl>
          <div className="acct-hero-foot">
            <Link className="btn sm" href={`/console/placements/${c.id}`}>Open placement</Link><span className="ws-faint acct-hint">Tasks, notice and ending the placement live there.</span>
          </div>
        </div>
      ) : (
        <div className="acct-empty"><b>Not placed right now.</b><span>{emptyText}</span></div>
      )}
      {past.length > 0 && (
        <>
          <h4 className="acct-h">Past placements</h4>
          <table className="acct-table">
            <thead><tr><th>{a.side === 'client' ? 'Talent' : 'Executive'}</th><th>From</th><th>To</th><th>Plan</th><th aria-label="Open" /></tr></thead>
            <tbody>{past.map(p => (
              <tr key={p.id}>
                <td><Link href={accountHref(p.otherId)}>{p.otherName}</Link></td>
                <td>{dayLabel(p.startedOn)}</td><td>{p.endedOn ? dayLabel(p.endedOn) : 'Live'}</td>
                <td>{p.plan?.label ?? '·'}</td>
                <td className="r"><Link href={`/console/placements/${p.id}`}>Open</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function HoursTab({ a }: { a: Account }) {
  const cap = a.plan?.hoursPerWeek ?? null;
  const max = Math.max(cap ?? 0, ...a.hours.weeks.map(w => w.hours ?? 0), 1);
  return (
    <div className="acct-tab">
      <div className="acct-figs">
        <div><div className="acct-k">{a.hours.thisWeek != null ? 'This week' : 'Last week'}</div><div className="acct-fig">{a.hours.thisWeek ?? a.hours.lastWeek ?? '·'}</div></div>
        <div><div className="acct-k">So far this month</div><div className="acct-fig">{a.hours.thisMonth}</div></div>
        <div><div className="acct-k">Last 4 weeks</div><div className="acct-fig">{a.hours.lastFour}</div></div>
        <div><div className="acct-k">Plan allows</div><div className="acct-fig">{cap ? `${cap}/wk` : 'Unlimited'}</div></div>
      </div>
      {!a.hours.reported ? (
        <div className="acct-empty"><b>No hours reported yet.</b><span>Hours come in with the talent&rsquo;s report every Friday.</span></div>
      ) : (
        <table className="acct-table">
          <thead><tr><th>Week ending</th>{a.side === 'client' && <th>Talent</th>}<th>Hours</th><th className="bar-h" aria-label="Chart" /><th>Workload</th><th>Flagged</th></tr></thead>
          <tbody>{a.hours.weeks.map(w => {
            const over = cap != null && (w.hours ?? 0) > cap;
            return (
              <tr key={w.weekEnding + w.who}>
                <td>{dayLabel(w.weekEnding)}</td>
                {a.side === 'client' && <td>{w.who}</td>}
                <td className={over ? 'acct-over' : ''}><b>{hrs(w.hours)}</b>{over ? ' · over plan' : ''}</td>
                <td className="bar"><span style={{ width: `${Math.round(((w.hours ?? 0) / max) * 100)}%` }} className={over ? 'over' : ''} /></td>
                <td>{w.workload === 'heavy' ? 'Heavy' : w.workload === 'light' ? 'Light' : w.workload === 'right' ? 'About right' : '·'}</td>
                <td className="acct-note-cell">{w.note ?? ''}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </div>
  );
}

export function BillingTab({ a }: { a: Account }) {
  const b = a.billing;
  const label = (s: string) => INVOICE_STATUS.find(x => x.key === s)?.label ?? s;
  const tone = (s: string) => INVOICE_STATUS.find(x => x.key === s)?.tone ?? '';
  return (
    <div className="acct-tab">
      <div className="acct-figs">
        <div><div className="acct-k">Plan</div><div className="acct-fig sm">{a.plan ? a.plan.label : 'None'}</div><div className="acct-s">{a.plan?.price ?? 'Set on placement'}</div></div>
        <div><div className="acct-k">Status</div><div className="acct-fig sm"><span className={`acct-tag ${b.status.tone}`}>{b.status.word}</span></div></div>
        <div><div className="acct-k">Outstanding</div><div className="acct-fig">{money(b.owedCents)}</div></div>
        <div><div className="acct-k">Paid to date</div><div className="acct-fig">{money(b.paidCents)}</div></div>
      </div>
      {!b.invoices.length ? (
        <div className="acct-empty"><b>Nothing billed yet.</b><span>The deposit and the monthly invoices appear here as they go out.</span></div>
      ) : (
        <table className="acct-table">
          <thead><tr><th>Invoice</th><th>For</th><th>Issued</th><th>Due</th><th className="r">Amount</th><th>Status</th></tr></thead>
          <tbody>{b.invoices.map(i => (
            <tr key={i.id}>
              <td><Link href={`/console/money/invoice/${i.id}`}>{i.number ?? 'Draft'}</Link></td>
              <td>{i.kind === 'deposit' ? 'Deposit' : 'Monthly'}</td>
              <td>{dayLabel(i.issued_on)}</td><td>{dayLabel(i.due_on)}</td>
              <td className="r"><b>{money(i.amount_cents)}</b></td>
              <td><span className={`acct-tag ${tone(i.status)}`}>{label(i.status)}{i.status === 'paid' && i.paid_on ? ` ${dayLabel(i.paid_on)}` : ''}</span></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <div className="acct-foot-link"><Link href="/console/money">Open Billing for refunds, edits and reminders</Link></div>
    </div>
  );
}

export function Messages({ a, name, threadHref }: { a: Account; name: string; threadHref: string }) {
  const first = name.split(' ')[0];
  const last = a.messages.slice(-6);
  return (
    <div className="acct-msgs">
      <div className="acct-row-head"><h4 className="acct-h">Messages with {first}</h4><Link className="btn sm" href={threadHref}>Open conversation</Link></div>
      {!last.length ? <p className="ws-faint">No messages yet. Start one with Message at the top.</p> : (
        <ul>{last.map(m => (
          <li key={m.id} className={m.from_team ? 'us' : 'them'}>
            <span className="who">{m.from_team ? 'Relève' : first}</span>
            <span className="when">{new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <p>{m.body}</p>
          </li>
        ))}</ul>
      )}
      {a.messages.length > last.length && <div className="acct-foot-link"><Link href={threadHref}>{a.messages.length - last.length} earlier messages</Link></div>}
    </div>
  );
}
