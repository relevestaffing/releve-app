'use client';
import '../crm/crm.css';
import './account.css';
import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Overlay from '../Overlay';
import { Icon, Menu } from '../crm/kit';
import { toast } from '../Toast';
import { PLANS, type PlanKey, todayInPacific, money } from '@/lib/money-public';

/* The three things Nona does to a person, on their account (3 November 2026):
   assign a placement, message them, and archive them. Archive hides the
   person from every list and keeps everything; it can be undone at once from
   the notice, or later from Tidy up. */

export type Pick = { id: string; name: string; sub: string | null; busy: boolean };

export default function AccountActions({ id, name, side, options, archived, listHref, threadHref, compact = false }: {
  id: string; name: string; side: 'client' | 'talent'; options: Pick[]; archived: boolean;
  listHref: string; threadHref: string; compact?: boolean;
}) {
  const router = useRouter();
  const [assign, setAssign] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function setArchived(on: boolean) {
    const r = await fetch('/api/admin/people', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: on ? 'archive' : 'restore', ids: [id] })
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok || d?.failed?.length) { toast.bad(d?.failed?.[0]?.why ?? d?.error ?? 'That did not save. Please try again.'); return false; }
    return true;
  }

  async function archive() {
    setBusy(true);
    const ok = await setArchived(true);
    setBusy(false); setConfirm(false);
    if (!ok) return;
    toast.undo(`${name} is archived`, async () => { if (await setArchived(false)) router.refresh(); });
    router.push(listHref);
  }

  return (
    <div className={`acct-actions${compact ? ' compact' : ''}`}>
      {!archived && <button type="button" className="btn sm solid" onClick={() => setAssign(true)}><Icon.plus />Assign placement</button>}
      <a className="btn sm" href={threadHref}><Icon.chat />Message</a>
      <Menu className="btn sm acct-more" label="More" trigger={<span aria-hidden="true">&middot;&middot;&middot;</span>} width={230}>
        {close => (
          <div role="menu">
            {archived ? (
              <button className="ws-opt" role="menuitem" onClick={async () => { close(); if (await setArchived(false)) { toast.saved(`${name} is back`); router.refresh(); } }}>
                <Icon.swap />Restore {name.split(' ')[0]}</button>
            ) : (
              <button className="ws-opt acct-danger" role="menuitem" onClick={() => { close(); setConfirm(true); }}>
                <Icon.close />Archive {name.split(' ')[0]}</button>
            )}
          </div>
        )}
      </Menu>

      {assign && <AssignPlacement id={id} name={name} side={side} options={options} onClose={() => setAssign(false)}
        onDone={() => { setAssign(false); router.refresh(); }} />}

      {confirm && (
        <Overlay onClose={() => setConfirm(false)} label={`Archive ${name}`}>
          <div className="acct-confirm">
            <h3>Archive {name}?</h3>
            <p>They leave every list in the console. Nothing is deleted: their placements, invoices, messages and files stay, and you can restore them at any time from Tidy up.</p>
            <p className="ws-faint">Someone in a live placement, with an unpaid invoice, or still owed pay cannot be archived until that is settled.</p>
            <div className="acct-confirm-foot">
              <button type="button" className="btn sm" onClick={() => setConfirm(false)}>Keep</button>
              <button type="button" className="btn sm solid" disabled={busy} onClick={archive}>{busy ? 'Archiving…' : 'Archive'}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

export function AssignPlacement({ id, name, side, options, onClose, onDone }: {
  id: string; name: string; side: 'client' | 'talent'; options: Pick[]; onClose: () => void; onDone: () => void;
}) {
  const fid = useId();
  const [q, setQ] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanKey>('essential');
  const [start, setStart] = useState(todayInPacific());
  const [busy, setBusy] = useState(false);
  const other = side === 'client' ? 'talent' : 'executive';
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter(o => !s || `${o.name} ${o.sub ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => Number(a.busy) - Number(b.busy) || a.name.localeCompare(b.name));
  }, [options, q]);
  const picked = options.find(o => o.id === who);

  async function submit() {
    if (!who) return;
    setBusy(true);
    const body = side === 'client'
      ? { client_id: id, talent_id: who, started_on: start, plan }
      : { client_id: who, talent_id: id, started_on: start, plan };
    const r = await fetch('/api/admin/placements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) { toast.bad(d?.error ?? 'The placement was not made. Please try again.'); return; }
    toast.saved(`${side === 'client' ? picked?.name : name} is placed with ${side === 'client' ? name : picked?.name}`);
    onDone();
  }

  return (
    <Overlay onClose={onClose} label={`Assign a placement for ${name}`}>
      <div className="acct-assign">
        <div className="acct-assign-head">
          <div><div className="ws-faint acct-eyebrow">Assign placement</div><h3>{name}</h3></div>
          <button type="button" className="x-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <label className="acct-step" htmlFor={`${fid}-q`}>1. Choose the {other}</label>
        <label className="acct-find"><Icon.search />
          <input id={`${fid}-q`} type="search" placeholder={`Search ${other === 'talent' ? 'talent' : 'executives'}`} value={q} onChange={e => setQ(e.target.value)} autoFocus />
        </label>
        <div className="acct-picks" role="listbox" aria-label={`Choose the ${other}`}>
          {list.length === 0 && <p className="ws-faint" style={{ padding: 12 }}>Nobody matches.</p>}
          {list.map(o => (
            <button key={o.id} type="button" role="option" aria-selected={who === o.id} className={`acct-pick${who === o.id ? ' on' : ''}`} onClick={() => setWho(o.id)}>
              <span className="acct-radio" aria-hidden="true" />
              <span className="t"><b>{o.name}</b>{o.sub && <small>{o.sub}</small>}</span>
              {o.busy && <span className="acct-busy">{side === 'client' ? 'Placed elsewhere' : 'Already has talent'}</span>}
            </button>
          ))}
        </div>

        <div className="acct-two">
          <div>
            <label className="acct-step" htmlFor={`${fid}-p`}>2. Plan</label>
            <select id={`${fid}-p`} className="acct-input" value={plan} onChange={e => setPlan(e.target.value as PlanKey)}>
              {(Object.keys(PLANS) as PlanKey[]).map(k => <option key={k} value={k}>{PLANS[k].label} · {k === 'part_time_full' ? '$2,500 for 3 months' : `${money(PLANS[k].monthlyCents)} a month`} · {PLANS[k].hoursPerWeek ? `${PLANS[k].hoursPerWeek} hrs a week` : 'unlimited hours'}</option>)}
            </select>
          </div>
          <div>
            <label className="acct-step" htmlFor={`${fid}-d`}>3. Start date</label>
            <input id={`${fid}-d`} className="acct-input" type="date" value={start} onChange={e => setStart(e.target.value)} />
          </div>
        </div>

        <p className="ws-faint acct-note">Both of them get an email saying the placement has started. Billing starts from the plan you pick.</p>
        <div className="acct-confirm-foot">
          <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn sm solid" disabled={!who || busy} onClick={submit}>
            {busy ? 'Placing…' : picked ? `Place ${side === 'client' ? picked.name.split(' ')[0] : name.split(' ')[0]}` : 'Place'}</button>
        </div>
      </div>
    </Overlay>
  );
}
