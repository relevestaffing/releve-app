'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import { INVOICE_STATUS, MANUAL_STATUSES, money, monthLabel, type Invoice, type InvoiceStatus } from '@/lib/money-public';

async function post(body: any) {
  return fetch('/api/admin/money', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export function InvoiceStatusPicker({ inv }: { inv: Invoice }) {
  const router = useRouter();
  const [value, setValue] = useState<InvoiceStatus>(inv.status);
  const [busy, setBusy] = useState(false);
  /* Paid and void are the two that matter and the two that are awkward to
     undo. On a phone this control is a spinning wheel next to a scroll
     gesture, so those two now ask first. Draft and sent still fire straight. */
  const [ask, setAsk] = useState<InvoiceStatus | null>(null);
  const tone = INVOICE_STATUS.find(s => s.key === value)?.tone ?? '';

  /* Stripe's states are shown, never offered: the database refuses a hand
     change while money is clearing, refunded or disputed. */
  if (!MANUAL_STATUSES.includes(inv.status)) return (
    <span className={`pill ${tone}`} title="Set by Stripe">
      {INVOICE_STATUS.find(s => s.key === inv.status)?.label ?? inv.status}
    </span>
  );

  async function apply(next: InvoiceStatus) {
    const prev = value;
    setValue(next); setBusy(true); setAsk(null);
    const ok = await saving(
      () => post({ action: 'invoice_status', id: inv.id, status: next }),
      next === 'paid' ? `${money(inv.amount_cents)} marked paid` : next === 'sent' ? 'Sent to the client' : `Marked ${next}`
    );
    setBusy(false);
    if (ok) router.refresh(); else setValue(prev);
  }

  if (ask) return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span className="xs">
        {ask === 'paid'
          ? `${money(inv.amount_cents)} from ${inv.org_name ?? inv.client_name ?? 'them'}, received outside Stripe?`
          : 'Void this invoice? Nothing will be owed on it.'}
      </span>
      <button className="btn sm solid" disabled={busy} onClick={() => apply(ask)}>Yes</button>
      <button className="btn sm ghost" onClick={() => setAsk(null)}>No</button>
    </div>
  );

  return (
    <select aria-label="Invoice status" className={`pill ${tone}`} value={value} disabled={busy}
      style={{ padding: '5px 10px', cursor: 'pointer' }}
      onChange={e => {
        const next = e.target.value as InvoiceStatus;
        if (next === 'paid' || next === 'void') { setAsk(next); return; }
        apply(next);
      }}>
      {INVOICE_STATUS.filter(s => MANUAL_STATUSES.includes(s.key)).map(s =>
        <option key={s.key} value={s.key}>{s.key === 'sent' && inv.status === 'draft' ? 'Send' : s.label}</option>)}
    </select>
  );
}

/* The monthly run. Idempotent in the database, so pressing it twice is
   harmless: it reports that there was nothing new. The daily scheduled run
   does the same thing every morning; this is for running it now, or for a
   month that was missed. */
export function RunTheMonth({ month, previous }: { month: string; previous?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [which, setWhich] = useState(month);

  async function run() {
    setBusy(true);
    try {
      const r = await post({ action: 'run_month', month: which });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.bad(d.error ? `Not drafted: ${d.error}` : 'Nothing was drafted. Please try again.');
      } else {
        toast.saved(d.made === 0
          ? `${monthLabel(which)} is already drafted. Nothing new`
          : `${d.made} invoice${d.made === 1 ? '' : 's'} drafted`);
        router.refresh();
      }
    } catch {
      toast.bad('No connection. Nothing was drafted.');
    }
    setBusy(false);
    setArmed(false);
  }

  if (!armed) return (
    <button className="btn sm solid" onClick={() => setArmed(true)}>Run the month</button>
  );
  return (
    <span className="rate-set">
      {previous && (
        <select aria-label="Which month" value={which} disabled={busy} onChange={e => setWhich(e.target.value)}
          className="pill" style={{ padding: '5px 10px' }}>
          <option value={month}>{monthLabel(month)}</option>
          <option value={previous}>{monthLabel(previous)}</option>
        </select>
      )}
      <button className="btn sm solid" disabled={busy} onClick={run}>
        {busy ? 'Working…' : 'Yes, draft the invoices'}
      </button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}
