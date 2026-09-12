'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { PAYOUT_METHODS, payoutMissing, type Payout, type PayoutMethod } from '@/lib/payout-public';

/* Where somebody says how they want to be paid.
   ---------------------------------------------
   There was nowhere in the product to record this at all, which meant month
   one would have been a series of messages asking people for bank details and
   keeping them in a spreadsheet. This is deliberately plain and says what
   happens to the information, because handing your bank details to a company
   you met three weeks ago deserves an explanation. */
export default function PayoutForm({ initial }: { initial: Payout | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    method: (initial?.method ?? '') as PayoutMethod | '',
    beneficiary: initial?.beneficiary ?? '',
    country: initial?.country ?? '',
    currency: initial?.currency ?? 'USD',
    detail: initial?.detail ?? '',
    note: initial?.note ?? '',
    us_person: (initial?.us_person ?? null) as boolean | null,
    tax_residence: initial?.tax_residence ?? ''
  });
  const chosen = PAYOUT_METHODS.find(m => m.key === f.method) ?? null;
  const missing = payoutMissing(f as any);

  async function save() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/payout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(f)
    }), 'Saved — Relève will check these before the first payment');
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>How you would like to be paid</h3>
        {initial?.confirmed_at
          ? <span className="pill good"><span className="dot" />Checked by Relève</span>
          : initial ? <span className="pill warn"><span className="dot" />With Relève to check</span> : null}
      </div>

      <p className="small muted" style={{ marginBottom: 22, maxWidth: 620 }}>
        Relève pays you directly, once a month. These details are seen by the Relève team
        and by nobody else — never by an executive, and never by anyone else on the roster.
        You can change them whenever you like; if you do, we check them again before the
        next payment.
      </p>

      <div className="ff">
        <label>How</label>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {PAYOUT_METHODS.map(m => (
            <button key={m.key} type="button"
              className={`btn sm ${f.method === m.key ? 'solid' : 'ghost'}`}
              onClick={() => setF(p => ({ ...p, method: m.key }))}>{m.label}</button>
          ))}
        </div>
        {chosen && <span className="xs muted" style={{ marginTop: 8 }}>{chosen.hint}</span>}
      </div>

      {chosen && (
        <>
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="ff"><label>The name on the account</label>
              <input value={f.beneficiary} onChange={e => setF(p => ({ ...p, beneficiary: e.target.value }))}
                placeholder="Exactly as it appears there" />
              <span className="xs muted">If it does not match, the transfer bounces and you wait another week.</span></div>
            <div className="ff"><label>Country</label>
              <input value={f.country} onChange={e => setF(p => ({ ...p, country: e.target.value }))}
                placeholder="Philippines" /></div>
          </div>

          <div className="ff"><label>{chosen.asks}</label>
            <textarea rows={3} value={f.detail}
              onChange={e => setF(p => ({ ...p, detail: e.target.value }))} /></div>

          <div className="ff"><label>Anything else we should know <span className="muted">— optional</span></label>
            <input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))}
              placeholder="A reference the transfer needs to carry, for instance" /></div>

          {/* Tax residency. Asked once, here, because this is the screen where
              somebody is already thinking about money — and because the answer
              decides whether Relève needs a form from them before the first
              payment rather than during it. No tax number is asked for or
              stored, on purpose. */}
          <div className="ff">
            <label>Where are you tax resident?</label>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              <button type="button"
                className={`btn sm ${f.us_person === false ? 'solid' : 'ghost'}`}
                onClick={() => setF(p => ({ ...p, us_person: false }))}>Outside the United States</button>
              <button type="button"
                className={`btn sm ${f.us_person === true ? 'solid' : 'ghost'}`}
                onClick={() => setF(p => ({ ...p, us_person: true, tax_residence: 'United States' }))}>
                I am a US person for tax</button>
            </div>
            <span className="xs muted" style={{ marginTop: 8 }}>
              &ldquo;US person&rdquo; means a citizen, a green card holder, or someone
              resident there for tax. If you are unsure, say outside and we will work it
              out together.
            </span>
          </div>

          {f.us_person === false && (
            <div className="ff">
              <label>Country of tax residence</label>
              <input value={f.tax_residence}
                onChange={e => setF(p => ({ ...p, tax_residence: e.target.value }))}
                placeholder="Philippines" />
              <span className="xs muted">
                We will send you a W-8BEN to sign before your first payment. It is a short
                form that says you are taxed where you live rather than in the United
                States. <b>We never ask for a tax identification number and never store
                one</b> — the same rule as your identity documents.
              </span>
            </div>
          )}

          {missing.length > 0 && (
            <p className="small" style={{ color: 'var(--warn, #9A7B3F)' }}>{missing.join(' ')}</p>
          )}

          <button className="btn solid" disabled={busy || missing.length > 0} onClick={save}>
            {busy ? 'Saving…' : initial ? 'Save these details' : 'Save'}
          </button>
        </>
      )}
    </div>
  );
}
