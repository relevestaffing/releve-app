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

  /* Clearing is Stripe's: shown, never offered. */
  if (status === 'processing') return (
    <span className="rate-set"><span className="pill" title="A bank payment is on its way">Clearing</span>
      {invoiced && <span className="xs muted">Invoiced</span>}</span>
  );

  async function commit(next: DepositStatus) {
    const prev = value;
    setValue(next); setBusy(true);
    const ok = await saving(
      () => post({ action: 'deposit_status', search_id: searchId, status: next }),
      next === 'paid' ? `${money(cents)} deposit marked paid` : next === 'waived' ? 'Deposit waived. Its invoice is void' : `Deposit ${next}`
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
      <select aria-label="Deposit status" className={`pill ${tone}`} value={value} disabled={busy}
        style={{ padding: '5px 10px', cursor: 'pointer' }}
        onChange={e => {
          const next = e.target.value as DepositStatus;
          if (next === value) return;
          /* Recording money received gets a confirm, and so does undoing it:
             moving a paid deposit back to due says money was never received.
             The select snaps back to its current value until it is confirmed. */
          if (next === 'paid' || next === 'waived' || value === 'paid') { setPending(next); e.target.value = value; return; }
          commit(next);
        }}>
        {DEPOSIT_STATUS.filter(s => s.key !== 'processing').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      {pending ? (
        <>
          <span className="xs muted">{pending === 'paid'
            ? `Mark the ${money(cents)} deposit paid?`
            : pending === 'waived'
              ? `Waive the ${money(cents)} deposit? Its invoice is voided.`
              : `Mark the ${money(cents)} deposit due again? This records that the money was not received.`}</span>
          <button className="btn sm solid" disabled={busy}
            onClick={() => { const p = pending; setPending(null); commit(p); }}>
            {busy ? 'Working…' : pending === 'paid' ? 'Yes, mark it paid' : pending === 'waived' ? 'Yes, waive it' : 'Yes, mark it due'}</button>
          <button className="btn sm ghost" disabled={busy} onClick={() => setPending(null)}>Keep it</button>
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
