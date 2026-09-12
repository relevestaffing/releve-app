'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { money } from '@/lib/money-public';
import { fmtDate } from '@/lib/words';

/* An offer, as one side sees it. The other side's number is not in the data
   that reaches this component — it is left behind in the database view, not
   hidden with CSS. */
export default function OfferCard({ offer, side }: { offer: any; side: 'client' | 'talent' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  /* Both answers are confirmed. Accepting used to be a single tap on the
     dashboard — the irreversible, expensive one was the unguarded one, and on
     a phone that is a mis-tap away from a months-long commitment. */
  const [confirming, setConfirming] = useState<null | 'yes' | 'no'>(null);
  const mine = side === 'client' ? offer.client_answer : offer.talent_answer;
  const amount = side === 'client' ? offer.rate_month_cents : offer.talent_pay_cents;
  const other = side === 'client' ? offer.talent_name : (offer.org_name ?? offer.client_name);

  async function answer(a: 'yes' | 'no') {
    /* A raw browser dialog on a three-thousand-a-month product is the loudest
       cheapness tell there is. The confirmation lives in the card. */
    if (confirming !== a) { setConfirming(a); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/offers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'answer', id: offer.id, answer: a })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ? `Not saved — ${d.error}` : 'That did not save.'); setBusy(false); return; }
      toast.saved(
        d.result === 'accepted' ? 'Accepted — both sides have said yes'
        : d.result === 'declined' ? 'Declined. We will be in touch.'
        : 'Thank you — we are waiting on the other side now');
      router.refresh();
    } catch { toast.bad('No connection — nothing was saved.'); }
    setBusy(false); setConfirming(null);
  }

  return (
    <div className="card offer">
      <div className="card-head">
        <h3>Your offer</h3>
        {mine === 'yes'
          ? <span className="pill good"><span className="dot" />You said yes</span>
          : mine === 'no'
            ? <span className="pill crit">You declined</span>
            : <span className="pill warn"><span className="dot" />Waiting on you</span>}
      </div>

      <h2 style={{ fontSize: 24, marginBottom: 6 }}>{offer.role_title}</h2>
      <p className="small muted" style={{ marginBottom: 22 }}>
        With {other} · starting {fmtDate(offer.starts_on)}
      </p>

      <dl className="brief-facts">
        <dt>Starts</dt><dd>{fmtDate(offer.starts_on)}</dd>
        {offer.hours && <><dt>Hours</dt><dd>{offer.hours}</dd></>}
        {offer.scope && <><dt>Owns</dt><dd>{offer.scope}</dd></>}
        <dt>{side === 'client' ? 'You pay' : 'You are paid'}</dt>
        <dd><b>{money(amount)}</b> a month</dd>
        <dt>Minimum</dt><dd>{offer.minimum_months} months, then month to month</dd>
      </dl>

      {offer.state === 'accepted' ? (
        <p className="small" style={{ marginTop: 20 }}>
          <b>Both sides have accepted.</b> Relève will confirm the start and set everything up.
        </p>
      ) : mine ? (
        <p className="small muted" style={{ marginTop: 20 }}>
          {mine === 'yes'
            ? 'Waiting on the other side. We will let you know the moment they answer.'
            : `We have your answer. Your ${side === 'client' ? 'Client' : 'Talent'} Success Manager will be in touch.`}
        </p>
      ) : (
        <>
          {confirming ? (
            <div className="confirm-row">
              <p className="small" style={{ margin: '0 0 14px' }}>
                {confirming === 'yes'
                  ? <>Accept this offer? That is <b>{money(amount)} a month</b> for a
                      minimum of {offer.minimum_months} months, starting {fmtDate(offer.starts_on)}.</>
                  : <>Decline this offer? We will come back to you either way, and we
                      keep looking for you.</>}
              </p>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <button className="btn sm solid" disabled={busy} onClick={() => answer(confirming)}>
                  {busy ? 'One moment…' : confirming === 'yes' ? 'Yes, accept it' : 'Yes, decline it'}
                </button>
                <button className="btn sm ghost" onClick={() => setConfirming(null)}>
                  {confirming === 'yes' ? 'Not yet' : 'Keep it open'}
                </button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button className="btn solid" disabled={busy} onClick={() => answer('yes')}>
                {busy ? 'One moment…' : 'Accept this offer'}
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => answer('no')}>
                Decline
              </button>
            </div>
          )}
          <p className="xs muted" style={{ marginTop: 14 }}>
            Nothing is settled until both sides have answered. If anything here is
            not what you discussed, message your {side === 'client' ? 'Client' : 'Talent'} Success
            Manager before accepting — there is no rush on our side.
          </p>
        </>
      )}
    </div>
  );
}
