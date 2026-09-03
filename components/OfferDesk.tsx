'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saving, toast } from '@/components/Toast';
import { money, toCents, RATE_MIN_CENTS, RATE_MAX_CENTS } from '@/lib/money-public';
import { fmtDate } from '@/lib/words';
import { OFFER_STATE, type Offer } from '@/lib/offer-public';
import PersonPicker from './PersonPicker';

/* full_name is nullable on a self-serve account that has not given one, so
   the picker falls back to the email rather than rendering a blank option. */
type Person = { id: string; full_name: string | null; email?: string; org_name?: string | null; role: string };
const nameOf = (p: Person) => p.full_name?.trim() || p.email || 'Unnamed account';

async function post(body: any) {
  return fetch('/api/offers', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
}

/* Where a yes becomes an arrangement. Between the interview and the
   placement there was nothing at all — the one moment the business earns
   money was the one moment the app had nothing to say about. */
export default function OfferDesk({ offers, clients, talent }: {
  offers: Offer[]; clients: Person[]; talent: Person[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    client_id: '', talent_id: '', role_title: '', starts_on: '',
    hours: '', scope: '', rate: '', pay: ''
  });

  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  async function create(send: boolean) {
    if (!f.client_id || !f.talent_id || !f.role_title || !f.starts_on) {
      toast.bad('Executive, talent, role and start date are all needed.');
      return;
    }
    const rate = f.rate ? toCents(f.rate) : null;
    const pay = f.pay ? toCents(f.pay) : null;
    if (rate != null && pay != null && pay >= rate) {
      toast.bad('The talent would be paid more than the client pays. Check both numbers.');
      return;
    }
    setBusy(true);
    const ok = await saving(() => post({
      action: 'make', ...f,
      rate_month_cents: rate ?? undefined,
      talent_pay_cents: pay ?? undefined,
      send
    }), send ? 'Offer sent to both sides' : 'Saved as a draft');
    setBusy(false);
    if (ok) {
      setOpen(false);
      setF({ client_id: '', talent_id: '', role_title: '', starts_on: '', hours: '', scope: '', rate: '', pay: '' });
      router.refresh();
    }
  }

  async function act(id: string, action: string, okText: string) {
    setBusy(true);
    const ok = await saving(() => post({ action, id }), okText);
    setBusy(false);
    if (ok) router.refresh();
  }

  const rateCents = f.rate ? toCents(f.rate) : null;
  const outside = rateCents != null && (rateCents < RATE_MIN_CENTS || rateCents > RATE_MAX_CENTS);
  const margin = rateCents != null && f.pay ? rateCents - (toCents(f.pay) ?? 0) : null;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>Make an offer</h3>
          {!open && <button className="btn sm solid" onClick={() => setOpen(true)}>New offer</button>}
        </div>

        {!open ? (
          <p className="small muted">
            After the interviews, before the placement. Both sides see the role, the
            start date and the terms — each sees only their own number — and answer
            it in their own account. When both say yes, one button turns it into a
            placement with the terms already agreed.
          </p>
        ) : (
          <>
            <div className="grid-2" style={{ gap: 14 }}>
              <PersonPicker label="Executive" people={clients as any}
                value={f.client_id} onChange={v => set('client_id', v)}
                placeholder="Type a name or company…" />
              <PersonPicker label="Talent" people={talent as any}
                value={f.talent_id} onChange={v => set('talent_id', v)}
                placeholder="Type a name…" />
            </div>

            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label>Role</label>
                <input value={f.role_title} onChange={e => set('role_title', e.target.value)}
                  placeholder="Chief of Staff" /></div>
              <div className="ff"><label>Start date</label>
                <input type="date" value={f.starts_on} onChange={e => set('starts_on', e.target.value)} /></div>
            </div>

            <div className="ff"><label>Hours</label>
              <input value={f.hours} onChange={e => set('hours', e.target.value)}
                placeholder="40 a week, four hours overlapping 8am Pacific" /></div>

            <div className="ff"><label>What this role owns outright</label>
              <textarea rows={2} value={f.scope} onChange={e => set('scope', e.target.value)}
                placeholder="Inbox and calendar, board prep, running the weekly leadership meeting." /></div>

            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label>The client pays (USD/mo)</label>
                <input value={f.rate} inputMode="decimal" onChange={e => set('rate', e.target.value)}
                  placeholder="3500" />
                {outside && <p className="xs muted" style={{ marginTop: 6 }}>
                  Outside the {money(RATE_MIN_CENTS)}–{money(RATE_MAX_CENTS)} band in your terms.
                </p>}</div>
              <div className="ff"><label>The talent is paid (USD/mo)</label>
                <input value={f.pay} inputMode="decimal" onChange={e => set('pay', e.target.value)}
                  placeholder="1450" /></div>
            </div>

            {margin != null && margin > 0 && (
              <p className="xs muted" style={{ marginBottom: 16 }}>
                Margin <b>{money(margin)}</b> a month. Neither side ever sees the other's figure —
                the executive's offer and the talent's offer are separate views of this row.
              </p>
            )}

            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button className="btn sm solid" disabled={busy} onClick={() => create(true)}>
                {busy ? 'Working…' : 'Send to both sides'}
              </button>
              <button className="btn sm ghost" disabled={busy} onClick={() => create(false)}>Save as draft</button>
              <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Offers</h3><span className="pill">{offers.length}</span></div>
        {!offers.length ? (
          <div className="empty-card" style={{ padding: '30px 20px' }}>
            <div className="empty-mark" aria-hidden="true" />
            <h3>No offers yet</h3>
            <p className="small">
              When an executive has met someone and wants them, make the offer here
              rather than over email — so the terms, the answers and the dates are
              all on the record.
            </p>
          </div>
        ) : (
          <table className="data">
            <thead><tr>
              <th>Executive</th><th>Talent</th><th>Role</th><th>Starts</th>
              <th style={{ textAlign: 'right' }}>They pay</th><th>State</th>
              <th style={{ textAlign: 'right' }}></th>
            </tr></thead>
            <tbody>
              {offers.map(o => {
                const st = OFFER_STATE[o.state];
                return (
                  <tr key={o.id}>
                    <td><b>{o.org_name ?? o.client_name}</b></td>
                    <td>{o.talent_name}</td>
                    <td className="xs">{o.role_title}</td>
                    <td className="xs">{fmtDate(o.starts_on)}</td>
                    <td className="amount">{money(o.rate_month_cents)}</td>
                    <td>
                      <span className={`pill ${st.tone}`}>{st.label}</span>
                      {o.state === 'declined' && o.declined_by &&
                        <div className="xs muted">by the {o.declined_by}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {o.state === 'draft' &&
                          <button className="btn sm solid" disabled={busy}
                            onClick={() => act(o.id, 'send', 'Sent to both sides')}>Send</button>}
                        {o.state === 'accepted' && !o.placement_id &&
                          <button className="btn sm solid" disabled={busy}
                            onClick={() => act(o.id, 'place', 'Placed — the terms carried across')}>
                            Make the placement
                          </button>}
                        {o.placement_id &&
                          <Link className="btn sm ghost" href={`/console/placements/${o.placement_id}`}>
                            Open file
                          </Link>}
                        {['sent', 'client_yes', 'talent_yes'].includes(o.state) &&
                          <button className="btn sm ghost" disabled={busy}
                            onClick={() => act(o.id, 'withdraw', 'Withdrawn')}>Withdraw</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
