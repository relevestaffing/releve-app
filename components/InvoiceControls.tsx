'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import { INVOICE_STATUS, money, type Invoice, type InvoiceStatus } from '@/lib/money-public';

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

  async function apply(next: InvoiceStatus) {
    const prev = value;
    setValue(next); setBusy(true); setAsk(null);
    const ok = await saving(
      () => post({ action: 'invoice_status', id: inv.id, status: next }),
      next === 'paid' ? `${money(inv.amount_cents)} marked paid` : `Marked ${next}`
    );
    setBusy(false);
    if (ok) router.refresh(); else setValue(prev);
  }

  if (ask) return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span className="xs">
        {ask === 'paid'
          ? `${money(inv.amount_cents)} from ${inv.org_name ?? inv.client_name ?? 'them'} — received?`
          : 'Void this invoice?'}
      </span>
      <button className="btn sm solid" disabled={busy} onClick={() => apply(ask)}>Yes</button>
      <button className="btn sm ghost" onClick={() => setAsk(null)}>No</button>
    </div>
  );

  return (
    <select className={`pill ${tone}`} value={value} disabled={busy}
      style={{ padding: '5px 10px', cursor: 'pointer' }}
      onChange={e => {
        const next = e.target.value as InvoiceStatus;
        if (next === 'paid' || next === 'void') { setAsk(next); return; }
        apply(next);
      }}>
      {INVOICE_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}

/* The monthly run. Idempotent in the database, so pressing it twice in a
   month is harmless — it simply reports that there was nothing new. */
export function RunTheMonth({ month }: { month: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await post({ action: 'run_month', month });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.bad(d.error ? `Not issued — ${d.error}` : 'Nothing was issued. Please try again.');
      } else {
        toast.saved(d.made === 0
          ? 'Already issued for this month — nothing new'
          : `${d.made} invoice${d.made === 1 ? '' : 's'} drafted`);
        router.refresh();
      }
    } catch {
      toast.bad('No connection — nothing was issued.');
    }
    setBusy(false);
  }

  return (
    <button className="btn sm solid" disabled={busy} onClick={run}>
      {busy ? 'Working…' : 'Run the month'}
    </button>
  );
}
