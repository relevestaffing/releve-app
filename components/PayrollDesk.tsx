'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import { money } from '@/lib/money-public';
import { PAYOUT_METHODS, periodLabel, taxClear, taxNote,
         type TalentPayment, type Payout } from '@/lib/payout-public';

/* Money going out.
   ----------------
   The platform recorded every invoice sent to a client and nothing at all
   about paying the people doing the work. A contractor asking "was I paid for
   October?" could not be answered from the system. */
export function RunPayroll({ month }: { month: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await fetch('/api/payout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'run', month })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) toast.bad(d.error ?? 'That did not run.');
      else toast.saved(d.made ? `${d.made} payment${d.made === 1 ? '' : 's'} to make` : 'Everyone this month is already listed');
      router.refresh();
    } catch { toast.bad('No connection.'); }
    setBusy(false);
  }

  return (
    <button className="btn sm solid" disabled={busy} onClick={run}>
      {busy ? 'Working…' : 'Run payroll'}
    </button>
  );
}

export function PaymentRow({ p, payout }: { p: TalentPayment; payout: Payout | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const method = PAYOUT_METHODS.find(m => m.key === payout?.method);

  /* Paperwork before payment, not during it. A non-US contractor generally
     wants a signed W-8BEN on file before money moves; asking afterwards is how
     a payment run turns into a week of chasing forms. This does not block the
     button — the judgement is Relève's, and there will be times you pay anyway
     — but it refuses to let the question go unnoticed. */
  const taxOk = taxClear(payout);
  const tax = taxNote(payout);

  async function holdForm() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/payout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'taxform', talent_id: p.talent_id, held: true })
    }), 'Recorded — the signed form is on file');
    setBusy(false);
    if (ok) router.refresh();
  }

  async function mark(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/payout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'payment', id: p.id, state: String(f.get('state')),
        method: payout?.method ?? null,
        reference: String(f.get('reference') ?? '')
      })
    }), 'Recorded');
    setBusy(false); setMarking(false);
    if (ok) router.refresh();
  }

  if (marking) return (
    <form onSubmit={mark} className="decide-form">
      <div className="ff"><label>What happened</label>
        <select name="state" defaultValue="sent">
          <option value="sent">Sent</option>
          <option value="failed">It failed</option>
        </select></div>
      <div className="ff"><label>Reference <span className="muted">— the transfer id</span></label>
        <input name="reference" placeholder="So a question in six months has an answer" /></div>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn sm solid" disabled={busy}>{busy ? 'Saving…' : 'Record it'}</button>
        <button type="button" className="btn sm ghost" onClick={() => setMarking(false)}>Cancel</button>
      </div>
    </form>
  );

  return (
    <div className="row between" style={{ gap: 14, flexWrap: 'wrap' }}>
      <div>
        <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)' }}>{p.talent_name ?? 'Someone'}</b>
        <div className="xs muted">
          {periodLabel(p.period_start)} · {money(p.amount_cents)}
          {method ? ` · ${method.label}` : ' · no payment details on file'}
          {p.reference && ` · ${p.reference}`}
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {p.state !== 'sent' && !taxOk && tax && (
          <>
            <span className="pill warn" title={tax}><span className="dot" />W-8BEN</span>
            <button className="btn sm ghost" disabled={busy} onClick={holdForm}>
              I have the signed form
            </button>
          </>
        )}
        {p.state === 'sent'
          ? <span className="pill good"><span className="dot" />Sent {p.sent_on}</span>
          : p.state === 'failed'
            ? <><span className="pill crit"><span className="dot" />Failed</span>
                <button className="btn sm ghost" onClick={() => setMarking(true)}>Try again</button></>
            : <>
                {!payout && <span className="pill warn"><span className="dot" />No details</span>}
                <button className="btn sm solid" disabled={busy} onClick={() => setMarking(true)}>
                  Mark as sent
                </button>
              </>}
      </div>
    </div>
  );
}
