'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saving, toast } from '@/components/Toast';
import { money, toCents, RATE_MIN_CENTS, RATE_MAX_CENTS, PLANS, PART_TIME_TOTAL_CENTS, ELIVATE_DISCOUNT_CENTS, ELIVATE_DISCOUNT_MONTHS, TALENT_HOURLY_CENTS, TALENT_HOURS, plansForHours, standardPayCents, type PlanKey, type TalentHours } from '@/lib/money-public';
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
  const fid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Making a placement starts the billing relationship, and a withdrawal
     retracts an offer someone may already have said yes to — neither should
     fire on a single stray click, so both arm a confirm first. */
  const [armed, setArmed] = useState<{ id: string; action: string } | null>(null);
  /* The new-offer form has two actions that reach outside the console:
     "Send to both sides" emails two people, and "Discard" drops whatever was
     typed. Each arms a confirm inside the card before it fires. */
  const [formArmed, setFormArmed] = useState<null | 'send' | 'discard'>(null);
  const blank = { client_id: '', talent_id: '', role_title: '', starts_on: '', hours: '', scope: '', rate: '', pay: '', plan: 'essential', talent_hours: '40', elivate: false };
  const [f, setF] = useState(blank);

  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const th = Number(f.talent_hours) as TalentHours;
  const stdPay = standardPayCents(th);
  const allowed = plansForHours(th);
  const isStd = (pay: string, h: number) => !pay || pay === String(standardPayCents(h) / 100);
  /* The role's size comes first. It decides which plans fit (15 is Starter,
     25 to 40 are Essential or Specialist) and the talent's standard pay; a
     plan that no longer fits moves to the first one that does, and a pay
     figure someone has typed by hand is left alone. */
  function pickHours(v: string) {
    const h = Number(v) as TalentHours;
    const plans = plansForHours(h);
    const plan = plans.includes(f.plan as PlanKey) ? f.plan as PlanKey : plans[0];
    const pl = PLANS[plan];
    setF({ ...f, talent_hours: v, plan,
      pay: isStd(f.pay, th) ? String(standardPayCents(h) / 100) : f.pay,
      ...(plan !== f.plan ? { rate: String(pl.monthlyCents / 100),
        hours: pl.hoursPerWeek ? `Up to ${pl.hoursPerWeek} hours a week` : '' } : {}),
      elivate: plan === 'essential' || plan === 'specialist' ? f.elivate : false });
  }
  const elivateOk = f.plan === 'essential' || f.plan === 'specialist';
  const dirty = Object.entries(f).some(([k, v]) => v !== (blank as any)[k]);
  const execName = clients.find(p => p.id === f.client_id);
  const talentName = talent.find(p => p.id === f.talent_id);

  /* Both recipients, named, so the sentence on the confirm says exactly who
     is about to get an email. */
  function sentToast(mailed: number, exec: string, tal: string) {
    if (mailed >= 2) return `Sent to ${exec} and ${tal}`;
    if (mailed === 1) return `Saved, but only one email sent. Check the email addresses for ${exec} and ${tal}`;
    return `Saved, but neither email sent. Check the email addresses for ${exec} and ${tal}`;
  }

  function formReady(): boolean {
    if (!f.client_id || !f.talent_id || !f.role_title || !f.starts_on) {
      toast.bad('Add the executive, talent, role and start date.');
      return false;
    }
    const rate = f.rate ? toCents(f.rate) : null;
    const pay = f.pay ? toCents(f.pay) : null;
    if (rate != null && pay != null && pay >= rate) {
      toast.bad('The talent would be paid more than the executive pays. Check both numbers.');
      return false;
    }
    return true;
  }

  async function create(send: boolean) {
    if (!formReady()) return;
    const rate = f.rate ? toCents(f.rate) : null;
    const pay = f.pay ? toCents(f.pay) : null;
    setBusy(true); setFormArmed(null);
    try {
      const r = await post({
        action: 'make', ...f,
        minimum_months: PLANS[f.plan as PlanKey].months,
        prepaid_total_cents: f.plan === 'part_time_full' ? PART_TIME_TOTAL_CENTS : undefined,
        intro_discount_cents: elivateOk && f.elivate ? ELIVATE_DISCOUNT_CENTS : undefined,
        intro_discount_months: elivateOk && f.elivate ? ELIVATE_DISCOUNT_MONTHS : undefined,
        rate_month_cents: rate ?? undefined,
        talent_pay_cents: pay ?? undefined,
        talent_hours: th,
        send
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ? `Not saved. ${d.error}` : 'That did not save. Please try again.'); setBusy(false); return; }
      if (!send) toast.saved('Saved as a draft');
      else {
        const mailed = Number(d.mailed ?? 0);
        const text = sentToast(mailed, execName ? nameOf(execName) : 'the executive', talentName ? nameOf(talentName) : 'the talent');
        if (mailed >= 2) toast.saved(text); else toast.bad(text);
      }
      setBusy(false);
      setOpen(false);
      setF(blank);
      router.refresh();
    } catch {
      toast.bad('No connection, so nothing was saved.');
      setBusy(false);
    }
  }

  async function act(id: string, action: string, okText: string) {
    setBusy(true);
    const ok = await saving(() => post({ action, id }), okText);
    setBusy(false);
    if (ok) router.refresh();
  }

  /* Sending a draft: the route reports how many of the two letters left. */
  async function sendDraft(o: Offer) {
    setBusy(true); setArmed(null);
    const exec = o.org_name ?? o.client_name ?? 'the executive';
    const tal = o.talent_name ?? 'the talent';
    try {
      const r = await post({ action: 'send', id: o.id });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ? `Not sent. ${d.error}` : 'That did not send. Please try again.'); setBusy(false); return; }
      const mailed = Number(d.mailed ?? 0);
      const text = sentToast(mailed, exec, tal);
      if (mailed >= 2) toast.saved(text); else toast.bad(text);
      setBusy(false);
      router.refresh();
    } catch {
      toast.bad('No connection, so the offer was not sent.');
      setBusy(false);
    }
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
            Use this after interviews. Both sides see the role, start date and terms in
            their own account (each sees only their own figure) and accept or decline there.
            When both accept, one click turns it into a placement on the agreed terms.
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
              <div className="ff"><label htmlFor={`${fid}-1`}>Role</label>
                <input id={`${fid}-1`} value={f.role_title} onChange={e => set('role_title', e.target.value)}
                  placeholder="Chief of Staff" /></div>
              <div className="ff"><label htmlFor={`${fid}-2`}>Start date</label>
                <input id={`${fid}-2`} type="date" value={f.starts_on} onChange={e => set('starts_on', e.target.value)} /></div>
            </div>

            <div className="ff"><label htmlFor={`${fid}-th`}>Role size (talent hours a week)</label>
              <select id={`${fid}-th`} value={f.talent_hours} onChange={e => pickHours(e.target.value)}>
                {TALENT_HOURS.map(h => (
                  <option key={h} value={String(h)}>{h} hours a week · {h === 15 ? 'Starter' : 'Essential or Specialist'} · talent paid {money(standardPayCents(h))} a month</option>
                ))}
              </select>
              <p className="xs muted" style={{ marginTop: 6 }}>Shown to the talent on their offer. The executive does not see it.</p></div>

            <div className="ff"><label htmlFor={`${fid}-plan`}>Plan</label>
              <select id={`${fid}-plan`} value={f.plan} onChange={e => {
                const k = e.target.value as PlanKey;
                const pl = PLANS[k];
                setF({ ...f, plan: k, rate: String(pl.monthlyCents / 100),
                  pay: isStd(f.pay, th) ? String(stdPay / 100) : f.pay,
                  hours: pl.hoursPerWeek ? `Up to ${pl.hoursPerWeek} hours a week` : f.hours });
              }}>
                {allowed.map(k => (
                  <option key={k} value={k}>{PLANS[k].label}: {PLANS[k].blurb} ({PLANS[k].months}-month commitment)</option>
                ))}
              </select></div>

            {elivateOk && (
              <label className="row small" style={{ gap: 8, alignItems: 'center', margin: '-4px 0 14px' }}>
                <input type="checkbox" checked={f.elivate} onChange={e => setF({ ...f, elivate: e.target.checked })} />
                eLIVate Club member: {money(ELIVATE_DISCOUNT_CENTS)} off each month for the first {ELIVATE_DISCOUNT_MONTHS} months
              </label>
            )}

            <div className="ff"><label htmlFor={`${fid}-3`}>Hours</label>
              <input id={`${fid}-3`} value={f.hours} onChange={e => set('hours', e.target.value)}
                placeholder="40 a week, four hours overlapping 8am Pacific" /></div>

            <div className="ff"><label htmlFor={`${fid}-4`}>What this role owns</label>
              <textarea id={`${fid}-4`} rows={2} value={f.scope} onChange={e => set('scope', e.target.value)}
                placeholder="Inbox and calendar, board prep, running the weekly leadership meeting." /></div>

            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label htmlFor={`${fid}-5`}>Executive pays (USD/month)</label>
                <input id={`${fid}-5`} value={f.rate} inputMode="decimal" onChange={e => set('rate', e.target.value)}
                  placeholder="3500" />
                {outside && <p className="xs muted" style={{ marginTop: 6 }}>
                  Outside your standard range of {money(RATE_MIN_CENTS)} to {money(RATE_MAX_CENTS)}.
                </p>}</div>
              <div className="ff"><label htmlFor={`${fid}-6`}>Talent is paid (USD/month)</label>
                <input id={`${fid}-6`} value={f.pay} inputMode="decimal" onChange={e => set('pay', e.target.value)}
                  placeholder={String(stdPay / 100)} />
                <p className="xs muted" style={{ marginTop: 6 }}>
                  {f.pay && f.pay !== String(stdPay / 100)
                    ? <>Adjusted from the standard {money(stdPay)} ({money(TALENT_HOURLY_CENTS)} an hour, {th} hours a week). <button type="button" style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", textDecoration: "underline", cursor: "pointer" }} onClick={() => set('pay', String(stdPay / 100))}>Use the standard</button></>
                    : <>Standard: {money(TALENT_HOURLY_CENTS)} an hour × {th} hours a week, paid as {money(stdPay)} a month.</>}
                </p></div>
            </div>

            {margin != null && margin > 0 && (
              <p className="xs muted" style={{ marginBottom: 16 }}>
                Margin <b>{money(margin)}</b> a month. Neither side sees the other's figure.
              </p>
            )}

            {formArmed === 'send' ? (
              <>
                <p className="small" style={{ maxWidth: 'var(--measure)', marginBottom: 12 }}>
                  Email this offer to <b>{execName ? nameOf(execName) : 'the executive'}</b> and{' '}
                  <b>{talentName ? nameOf(talentName) : 'the talent'}</b>? Each sees only their own number.
                </p>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn sm solid" disabled={busy} onClick={() => create(true)}>
                    {busy ? 'Sending…' : 'Yes, send to both'}
                  </button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => setFormArmed(null)}>Keep editing</button>
                </div>
              </>
            ) : formArmed === 'discard' ? (
              <>
                <p className="small" style={{ maxWidth: 'var(--measure)', marginBottom: 12 }}>
                  Discard this offer? Nothing typed here is kept.
                </p>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn sm solid danger" disabled={busy}
                    onClick={() => { setFormArmed(null); setF(blank); setOpen(false); }}>
                    Yes, discard it
                  </button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => setFormArmed(null)}>Keep editing</button>
                </div>
              </>
            ) : (
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <button className="btn sm solid" disabled={busy} onClick={() => { if (formReady()) setFormArmed('send'); }}>
                  {busy ? 'Working…' : 'Send to both sides'}
                </button>
                <button className="btn sm ghost" disabled={busy} onClick={() => create(false)}>Save as draft</button>
                <button className="btn sm ghost" disabled={busy}
                  onClick={() => { if (dirty) setFormArmed('discard'); else setOpen(false); }}>Discard</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        {/* A bare number in this slot said nothing: every other card in the
            console labels it ("8 on file", "0 running"). */}
        <div className="card-head"><h3>Offers</h3>
          <span className="pill">{offers.length} on file</span></div>
        {!offers.length ? (
          <div className="empty-card" style={{ padding: '30px 20px' }}>
            <div className="empty-mark" aria-hidden="true" />
            <h3>No offers yet</h3>
            <p className="small">
              When an executive wants to go ahead with a candidate, make the offer here
              rather than by email, so the terms, answers and dates are on record.
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
                        {o.state === 'draft' && (
                          armed?.id === o.id && armed.action === 'send' ? (
                            <>
                              <span className="xs muted">
                                Email this offer to {o.org_name ?? o.client_name ?? 'the executive'} and {o.talent_name ?? 'the talent'}?
                              </span>
                              <button className="btn sm solid" disabled={busy} onClick={() => sendDraft(o)}>
                                {busy ? 'Sending…' : 'Yes, send to both'}
                              </button>
                              <button className="btn sm ghost" disabled={busy} onClick={() => setArmed(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn sm solid" disabled={busy}
                              onClick={() => setArmed({ id: o.id, action: 'send' })}>Send</button>
                          )
                        )}
                        {o.state === 'accepted' && !o.placement_id && (
                          armed?.id === o.id && armed.action === 'place' ? (
                            <>
                              <span className="xs muted">Create the placement on these terms?</span>
                              <button className="btn sm solid" disabled={busy}
                                onClick={() => { setArmed(null); act(o.id, 'place', 'Placement created on the agreed terms'); }}>
                                Create placement
                              </button>
                              <button className="btn sm ghost" disabled={busy} onClick={() => setArmed(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn sm solid" disabled={busy}
                              onClick={() => setArmed({ id: o.id, action: 'place' })}>
                              Create placement
                            </button>
                          )
                        )}
                        {o.placement_id &&
                          <Link className="btn sm ghost" href={`/console/placements/${o.placement_id}`}>
                            Open file
                          </Link>}
                        {['sent', 'client_yes', 'talent_yes'].includes(o.state) && (
                          armed?.id === o.id && armed.action === 'withdraw' ? (
                            <>
                              <span className="xs muted">Withdraw this offer?</span>
                              <button className="btn sm solid" disabled={busy}
                                onClick={() => { setArmed(null); act(o.id, 'withdraw', 'Withdrawn'); }}>
                                Yes, withdraw
                              </button>
                              <button className="btn sm ghost" disabled={busy} onClick={() => setArmed(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn sm ghost" disabled={busy}
                              onClick={() => setArmed({ id: o.id, action: 'withdraw' })}>Withdraw</button>
                          )
                        )}
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
