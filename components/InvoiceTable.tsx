'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { InvoiceStatusPicker } from './InvoiceControls';
import ChargeInvoice from './ChargeInvoice';
import InvoiceFilter from './InvoiceFilter';
import { money, dayLabel, monthLabel, daysOverdue, type Invoice } from '@/lib/money-public';

type Method = { label: string; ok: boolean } | null;

/* The invoice table, plus the one thing it did not do: send more than one
   at a time. A draft can be checked off here and sent individually from its
   own row (unchanged, via InvoiceStatusPicker), or a batch of drafts can be
   checked and sent together — one client, a chosen few, or "select all" for
   everyone waiting on a first invoice this month. */
export default function InvoiceTable({ invoices, stripeOn, methods }: {
  invoices: Invoice[]; stripeOn: boolean; methods: Record<string, Method>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const drafts = useMemo(() => invoices.filter(i => i.status === 'draft'), [invoices]);
  const allDraftsSelected = drafts.length > 0 && drafts.every(d => selected.has(d.id));

  function toggle(id: string) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllDrafts() {
    setSelected(s => {
      if (allDraftsSelected) return new Set([...s].filter(id => !drafts.some(d => d.id === id)));
      const next = new Set(s);
      drafts.forEach(d => next.add(d.id));
      return next;
    });
  }

  async function sendSelected() {
    if (!selected.size) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/money', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'invoice_send_bulk', ids: [...selected] })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) toast.bad(d.error ?? 'Nothing was sent.');
      else {
        toast.saved(`${d.sent} invoice${d.sent === 1 ? '' : 's'} sent` + (d.skipped ? ` · ${d.skipped} skipped` : ''));
        setSelected(new Set());
        router.refresh();
      }
    } catch { toast.bad('No connection — nothing was sent.'); }
    setBusy(false);
  }

  return (
    <>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <InvoiceFilter scope="invoice-table" />
        {drafts.length > 0 && (
          <div className="row" style={{ gap: 10, marginBottom: 16 }}>
            {selected.size > 0 && (
              <button className="btn sm solid" disabled={busy} onClick={sendSelected}>
                {busy ? 'Sending…' : `Send ${selected.size} selected`}
              </button>
            )}
            <button className="btn sm ghost" onClick={toggleAllDrafts}>
              {allDraftsSelected ? 'Clear selection' : `Select all ${drafts.length} draft${drafts.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
      <table className="data" id="invoice-table">
        <thead><tr>
          <th style={{ width: 28 }}></th>
          <th>Number</th><th>Executive</th><th>For</th><th>Issued</th>
          <th style={{ textAlign: 'right' }}>Amount</th><th>Status</th>
          {stripeOn && <th>Collect</th>}
        </tr></thead>
        <tbody>
          {invoices.map(i => {
            const late = daysOverdue(i.due_on);
            const open = i.status === 'draft' || i.status === 'sent';
            const m = methods[i.client_id] ?? null;
            return (
              <tr key={i.id} data-status={i.status} data-late={open ? Math.max(0, late) : 0}>
                <td style={{ width: 28 }}>
                  {i.status === 'draft' && (
                    <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)}
                      aria-label={`Select invoice ${i.number ?? 'not yet issued'}`} />
                  )}
                </td>
                <td className="inv-num xs">{i.number ?? <span className="muted">not issued</span>}</td>
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
                <td><InvoiceStatusPicker key={i.status} inv={i} /></td>
                {stripeOn && (
                  <td>
                    {i.amount_cents <= 0
                      ? <span className="xs muted">Credit</span>
                      : i.status === 'processing'
                        ? <span className="xs muted">Clearing</span>
                        : i.status === 'paid' || i.status === 'void'
                          ? <span className="xs muted">—</span>
                          : <ChargeInvoice invoiceId={i.id} amount={money(i.amount_cents)}
                              who={i.org_name ?? i.client_name ?? 'this executive'}
                              method={m?.ok ? m.label : null} />}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
