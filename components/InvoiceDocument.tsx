import { INVOICE_ENTITY, NOTICE_TERMS, dayLabel, monthLabel, money, type Invoice } from '@/lib/money-public';
import { PAYMENT_STATUS } from '@/lib/billing-public';
import PrintButton from './PrintButton';

/* The invoice as a document.
   -------------------------
   What an executive paying $4,500 a month expects to file: who it is from,
   who it is to, the number and dates, every line that makes up the total
   (proration and the deposit credit included), and its status. The same
   document for the client and for the console. Prints on its own: the print
   rules below hide everything on the page that is not the invoice. */
export default function InvoiceDocument({ inv, actions }: {
  inv: Invoice & { client_email?: string | null; talent_name?: string };
  actions?: React.ReactNode;
}) {
  const credit = inv.deposit_credit_cents ?? 0;
  const subtotal = inv.kind === 'retainer'
    ? (inv.subtotal_cents ?? inv.amount_cents + credit)
    : inv.amount_cents;
  const prorated = inv.days_billed != null && inv.days_in_period != null && inv.days_billed < inv.days_in_period;
  const refunded = inv.refunded_cents ?? 0;
  const status = PAYMENT_STATUS[inv.status] ?? { label: inv.status, tone: '', says: '' };

  const lines: { what: string; detail?: string; cents: number }[] = [];
  if (inv.kind === 'deposit') {
    lines.push({ what: 'Search deposit', detail: 'Non-refundable. Credited against your first monthly invoice.', cents: inv.amount_cents });
  } else {
    lines.push({
      what: `Monthly retainer, ${monthLabel(inv.period_start)}`,
      detail: [
        inv.talent_name ? `Virtual executive assistant: ${inv.talent_name}` : null,
        prorated
          ? `Prorated: ${inv.days_billed} of ${inv.days_in_period} days${inv.service_from && inv.service_to ? `, ${dayLabel(inv.service_from)} to ${dayLabel(inv.service_to)}` : ''}`
          : `Service period ${dayLabel(inv.period_start)} to ${dayLabel(inv.period_end)}`
      ].filter(Boolean).join('. '),
      cents: subtotal
    });
    if (credit > 0) lines.push({ what: 'Search deposit credit', detail: 'Your $500 deposit, credited as agreed.', cents: -credit });
  }

  return (
    <div className="invoice-doc card" style={{ maxWidth: 820, padding: '44px 48px' }}>
      <style>{`
        .invoice-doc table.lines{width:100%;border-collapse:collapse;margin:8px 0 0}
        .invoice-doc table.lines th{font-family:'Marcellus',serif;font-weight:400;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--sage);text-align:left;padding:12px 0;border-bottom:1px solid var(--line-strong)}
        .invoice-doc table.lines td{padding:14px 0;border-bottom:1px solid var(--line);vertical-align:top;font-size:14.5px}
        .invoice-doc .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
        .invoice-doc .meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin:28px 0}
        .invoice-doc .meta .k{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--sage);margin-bottom:4px}
        .invoice-doc .total td{border-bottom:none;font-family:'Marcellus',serif;font-size:19px;color:var(--fern);padding-top:18px}
        @media (max-width:640px){.invoice-doc{padding:26px 20px!important}.invoice-doc .meta{grid-template-columns:1fr 1fr}}
        @media print{
          @page{margin:16mm}
          body{background:#fff!important}
          .side,.topbar,.menu-trigger,.nav-drawer-scrim,.demo-banner,.no-print{display:none!important}
          .shell{display:block!important;background:#fff!important;min-height:0!important}
          .main{padding:0!important;margin:0!important}
          body *{visibility:hidden}
          .invoice-doc,.invoice-doc *{visibility:visible}
          .invoice-doc{box-shadow:none!important;border:none!important;max-width:none!important;padding:0!important;margin:0!important}
        }
      `}</style>

      <div className="row between" style={{ alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Marcellus, serif', fontSize: 26, letterSpacing: '.32em', textTransform: 'uppercase', color: 'var(--fern)' }}>Relève</div>
          <div className="xs muted" style={{ letterSpacing: '.24em', textTransform: 'uppercase', marginTop: 4 }}>Executive Staffing</div>
          <div className="small" style={{ marginTop: 14, lineHeight: 1.6 }}>
            {INVOICE_ENTITY.name}<br />{INVOICE_ENTITY.email}<br />{INVOICE_ENTITY.country}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Marcellus, serif', fontSize: 30, color: 'var(--fern)' }}>Invoice</div>
          <div className="small" style={{ marginTop: 6 }}>{inv.number ?? 'Draft, not yet issued'}</div>
          <span className={`pill ${status.tone}`} style={{ marginTop: 10 }}>{status.label}</span>
        </div>
      </div>

      <div className="meta">
        <div>
          <div className="k">Bill to</div>
          <div className="small"><b>{inv.org_name ?? inv.client_name ?? 'Client'}</b>
            {inv.org_name && inv.client_name ? <><br />{inv.client_name}</> : null}
            {inv.client_email ? <><br />{inv.client_email}</> : null}
          </div>
        </div>
        <div>
          <div className="k">Invoice date</div>
          <div className="small">{dayLabel(inv.issued_on)}</div>
          <div className="k" style={{ marginTop: 12 }}>Due</div>
          <div className="small">{inv.due_on ? `${dayLabel(inv.due_on)}, on receipt` : 'On receipt'}</div>
        </div>
        <div>
          <div className="k">Status</div>
          <div className="small">
            {inv.status === 'paid' && inv.paid_on ? `Paid ${dayLabel(inv.paid_on)}` : status.says}
          </div>
        </div>
      </div>

      <table className="lines">
        <thead><tr><th>Description</th><th className="num">Amount (USD)</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><div>{l.what}</div>{l.detail && <div className="xs muted" style={{ marginTop: 4 }}>{l.detail}</div>}</td>
              <td className="num">{l.cents < 0 ? `−${money(-l.cents, true)}` : money(l.cents, true)}</td>
            </tr>
          ))}
          {refunded > 0 && (
            <tr>
              <td><div>Refunded</div>{inv.refunded_on && <div className="xs muted" style={{ marginTop: 4 }}>{dayLabel(inv.refunded_on)}</div>}</td>
              <td className="num">−{money(refunded, true)}</td>
            </tr>
          )}
          <tr className="total">
            <td>{inv.status === 'paid' || inv.status === 'refunded' ? 'Total' : 'Total due'}</td>
            <td className="num">{money(Math.max(0, inv.amount_cents - refunded), true)}</td>
          </tr>
        </tbody>
      </table>

      {inv.note && !/^Monthly retainer$/.test(inv.note) && (
        <p className="xs muted" style={{ marginTop: 18 }}>{inv.note}</p>
      )}

      <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
        <p className="xs muted" style={{ margin: 0, lineHeight: 1.7 }}>
          Invoices are dated the first Monday of each month and due on receipt. Placements carry a
          three-month minimum term. {NOTICE_TERMS} Questions about this invoice: {INVOICE_ENTITY.email}.
        </p>
      </div>

      <div className="row no-print" style={{ gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
        <PrintButton />
        {actions}
      </div>
    </div>
  );
}
