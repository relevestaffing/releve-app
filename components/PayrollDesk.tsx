'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import { money, toCents, dayLabel } from '@/lib/money-public';
import { PAYOUT_METHODS, periodLabel, taxClear, taxNote, taxFormName,
         type TalentPayment, type Payout } from '@/lib/payout-public';

/* Money going out.
   ----------------
   The platform recorded every invoice sent to a client and nothing at all
   about paying the people doing the work. A contractor asking "was I paid for
   October?" could not be answered from the system. */
export function RunPayroll({ month }: { month: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

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
    setArmed(false);
  }

  /* One deliberate step before the payroll run, same as the billing run. */
  if (!armed) return (
    <button className="btn sm solid" onClick={() => setArmed(true)}>Run payroll</button>
  );
  return (
    <span className="rate-set">
      <button className="btn sm solid" disabled={busy} onClick={run}>
        {busy ? 'Working…' : 'Yes, list this month’s pay'}
      </button>
      <button className="btn sm ghost" disabled={busy} onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}

export function PaymentRow({ p, payout }: { p: TalentPayment; payout: Payout | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const method = PAYOUT_METHODS.find(m => m.key === payout?.method);

  /* Paperwork before payment, not during it: a W-9 for a US person (for the
     year-end 1099), a W-8BEN for anyone else. This does not block the
     button; the judgement is Relève's. It only refuses to let the question
     go unnoticed. */
  const taxOk = taxClear(payout);
  const tax = taxNote(payout);
  const form = taxFormName(payout);

  async function holdForm() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/payout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'taxform', talent_id: p.talent_id, held: true })
    }), `Recorded: the signed ${form} is on file`);
    setBusy(false);
    if (ok) router.refresh();
  }

  async function mark(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const sentText = String(f.get('sent') ?? '').trim();
    const feeText = String(f.get('fee') ?? '').trim();
    const sent = sentText ? toCents(sentText) : null;
    const fee = feeText ? toCents(feeText) : null;
    if (sentText && sent == null) { toast.bad('The amount sent is not a dollar amount.'); return; }
    if (feeText && fee == null) { toast.bad('The fee is not a dollar amount.'); return; }
    setBusy(true);
    const ok = await saving(() => fetch('/api/payout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'payment', id: p.id, state: String(f.get('state')),
        method: payout?.method ?? null,
        reference: String(f.get('reference') ?? ''),
        sent_cents: sent, fee_cents: fee,
        fx_note: String(f.get('fx_note') ?? '')
      })
    }), 'Recorded');
    setBusy(false); setMarking(false);
    if (ok) router.refresh();
  }

  if (marking) return (
    <form onSubmit={mark} className="decide-form">
      <div className="ff"><label htmlFor={`st-${p.id}`}>What happened</label>
        <select id={`st-${p.id}`} name="state" defaultValue="sent">
          <option value="sent">Sent</option>
          <option value="failed">It did not go through</option>
        </select></div>
      <div className="grid-2" style={{ gap: 14 }}>
        <div className="ff"><label htmlFor={`sent-${p.id}`}>Amount sent, US dollars <span className="muted">(if not {money(p.amount_cents, true)})</span></label>
          <input id={`sent-${p.id}`} name="sent" inputMode="decimal" placeholder={(p.amount_cents / 100).toFixed(2)} /></div>
        <div className="ff"><label htmlFor={`fee-${p.id}`}>Transfer fee Relève paid, US dollars <span className="muted">(optional)</span></label>
          <input id={`fee-${p.id}`} name="fee" inputMode="decimal" placeholder="0.00" /></div>
      </div>
      <div className="ff"><label htmlFor={`ref-${p.id}`}>Reference <span className="muted">(the transfer id)</span></label>
        <input id={`ref-${p.id}`} name="reference" placeholder="So a question in six months has an answer" /></div>
      <div className="ff"><label htmlFor={`fx-${p.id}`}>What landed locally <span className="muted">(optional, a note)</span></label>
        <input id={`fx-${p.id}`} name="fx_note" placeholder="For example: PHP 196,400 at Wise rate" /></div>
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
          {periodLabel(p.period_start)}{p.client_name ? ` · with ${p.client_name}` : ''} · {money(p.amount_cents, true)} USD
          {p.sent_cents != null && p.sent_cents !== p.amount_cents ? ` · sent ${money(p.sent_cents, true)}` : ''}
          {p.fee_cents ? ` · fee ${money(p.fee_cents, true)}` : ''}
          {method ? ` · ${method.label}` : ' · no payment details on file'}
          {p.reference && ` · ${p.reference}`}
        </div>
        {p.note && <div className="xs muted">{p.note}</div>}
        {p.fx_note && <div className="xs muted">Landed: {p.fx_note}</div>}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {p.paused && p.state !== 'sent' && (
          <span className="pill" title="The placement is paused for an unpaid balance. Pay what was worked; nothing new is created while paused.">Placement paused</span>
        )}
        {p.state !== 'sent' && !taxOk && tax && (
          <>
            <span className="pill warn" title={tax}><span className="dot" />{form}</span>
            <button className="btn sm ghost" disabled={busy} onClick={holdForm}>
              I have the signed {form}
            </button>
          </>
        )}
        {p.state === 'sent'
          ? <span className="pill good"><span className="dot" />Sent {dayLabel(p.sent_on)}</span>
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
