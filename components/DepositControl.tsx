'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { DEPOSIT_STATUS, money, type DepositStatus } from '@/lib/money-public';

async function post(body: any) {
  return fetch('/api/admin/money', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/* The $500 taken when a search begins. Non-refundable, and credited against
   the first monthly invoice — so it is tracked, not just remembered.
   Marking it paid records money received, so that one change arms a confirm
   first rather than committing on the stray pick of a dropdown. */
export default function DepositControl({ searchId, clientId, status, cents, invoiced }: {
  searchId: string; clientId: string; status: DepositStatus; cents: number; invoiced: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<DepositStatus>(status);
  const [pending, setPending] = useState<DepositStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const tone = DEPOSIT_STATUS.find(s => s.key === value)?.tone ?? '';

  async function commit(next: DepositStatus) {
    const prev = value;
    setValue(next); setBusy(true);
    const ok = await saving(
      () => post({ action: 'deposit_status', search_id: searchId, status: next }),
      next === 'paid' ? `${money(cents)} deposit marked paid` : `Deposit ${next}`
    );
    setBusy(false);
    if (ok) router.refresh(); else setValue(prev);
  }

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
        onChange={e => {
          const next = e.target.value as DepositStatus;
          if (next === value) return;
          /* Recording money received is the one change that gets a confirm; the
             select snaps back to its current value until it is confirmed. */
          if (next === 'paid') { setPending('paid'); e.target.value = value; return; }
          commit(next);
        }}>
        {DEPOSIT_STATUS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      {pending === 'paid' ? (
        <>
          <span className="xs muted">Mark the {money(cents)} deposit paid?</span>
          <button className="btn sm solid" disabled={busy}
            onClick={() => { setPending(null); commit('paid'); }}>Confirm</button>
          <button className="btn sm ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
        </>
      ) : (
        <>
          {!invoiced && value !== 'waived' &&
            <button className="btn sm ghost" disabled={busy} onClick={bill}>Invoice it</button>}
          {invoiced && <span className="xs muted">Invoiced</span>}
        </>
      )}
    </span>
  );
}
