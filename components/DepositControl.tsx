'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import { DEPOSIT_STATUS, money, type DepositStatus } from '@/lib/money-public';

async function post(body: any) {
  return fetch('/api/admin/money', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/* The $500 taken when a search begins. Non-refundable, and credited against
   the first monthly invoice — so it is tracked, not just remembered. */
export default function DepositControl({ searchId, clientId, status, cents, invoiced }: {
  searchId: string; clientId: string; status: DepositStatus; cents: number; invoiced: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<DepositStatus>(status);
  const [busy, setBusy] = useState(false);
  const tone = DEPOSIT_STATUS.find(s => s.key === value)?.tone ?? '';

  async function bill() {
    setBusy(true);
    const ok = await saving(
      () => post({ action: 'invoice_deposit', search_id: searchId, client_id: clientId }),
      `${money(cents)} deposit invoiced`
    );
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <span className="rate-set">
      <select className={`pill ${tone}`} value={value} disabled={busy}
        style={{ padding: '5px 10px', cursor: 'pointer' }}
        onChange={async e => {
          const prev = value;
          const next = e.target.value as DepositStatus;
          setValue(next); setBusy(true);
          const ok = await saving(
            () => post({ action: 'deposit_status', search_id: searchId, status: next }),
            next === 'paid' ? `${money(cents)} deposit marked paid` : `Deposit ${next}`
          );
          setBusy(false);
          if (ok) router.refresh(); else setValue(prev);
        }}>
        {DEPOSIT_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      {!invoiced && value !== 'waived' &&
        <button className="btn sm ghost" disabled={busy} onClick={bill}>Invoice it</button>}
      {invoiced && <span className="xs muted">Invoiced</span>}
    </span>
  );
}
