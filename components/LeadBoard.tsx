'use client';
import { useEffect, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import Overlay from './Overlay';
import { toast, saving } from './Toast';
import type { Prospect, Touch, TouchKind } from '@/lib/prospects-public';
import {
  PROSPECT_STAGES, PROSPECT_SOURCES, STAGE_GROUPS, TOUCH_KINDS,
  stageLabel, stageColor, stageGroup, sourceLabel, followUpDue
} from '@/lib/prospects-public';
import { daysBetweenISO } from '@/lib/money-public';
import { fmtWhen } from '@/lib/words';

/* The lead board, reworked Monday-style (28 October 2026). One grouped table,
   a solid coloured status label per row, an owner column, inline-editable
   dates, add a lead inline. The "Follow up today" card sits above it: it is
   the point of the whole feature, so it reads first. */

type Member = { user_id: string; name: string };

async function patch(body: Record<string, unknown>, label: string) {
  return saving(() => fetch('/api/admin/prospects', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }), label);
}

/* Last touched, said the short way. A timestamp, compared by its calendar day
   in the business timezone so "today" means today here. */
function sinceDay(iso: string | null, today: string): string {
  if (!iso) return 'Not yet';
  const day = iso.slice(0, 10);
  const n = daysBetweenISO(day, today);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n < 7) return `${n} days ago`;
  if (n < 14) return 'Last week';
  return `${Math.round(n / 7)} weeks ago`;
}

/* How overdue a follow-up is, in words, for the card up top. */
function dueWords(nextFollowUp: string | null, today: string): { text: string; tone: 'over' | 'today' } {
  if (!nextFollowUp) return { text: 'today', tone: 'today' };
  const n = daysBetweenISO(nextFollowUp, today);
  if (n <= 0) return { text: 'today', tone: 'today' };
  if (n === 1) return { text: '1 day overdue', tone: 'over' };
  return { text: `${n} days overdue`, tone: 'over' };
}

/* ---------- the status label, click to change ---------- */
function StatusCell({ p, onMove }: { p: Prospect; onMove: (stage: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="status-wrap">
      <button className="status-pill" style={{ background: stageColor(p.stage) }}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {stageLabel(p.stage)}<span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="status-menu" role="menu">
            {PROSPECT_STAGES.map(s => (
              <button key={s.key} className="status-opt" role="menuitem"
                onClick={() => { setOpen(false); if (s.key !== p.stage) onMove(s.key); }}>
                <span className="status-swatch" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- the inline follow-up date ---------- */
function DateCell({ p, today, onSet }: { p: Prospect; today: string; onSet: (d: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const overdue = followUpDue(p, today);
  if (!p.next_follow_up && !editing) {
    return <button className="date-empty" onClick={() => setEditing(true)}>Set a date</button>;
  }
  return (
    <input type="date" className={`date-cell${overdue ? ' overdue' : ''}`}
      key={p.next_follow_up ?? 'empty'} defaultValue={p.next_follow_up ?? ''} autoFocus={editing}
      onChange={e => onSet(e.target.value || null)} />
  );
}

/* ---------- the touch panel ---------- */
function TouchPanel({ p, team, today, onClose }: {
  p: Prospect; team: Member[]; today: string; onClose: () => void;
}) {
  const fid = useId();
  const router = useRouter();
  const [touches, setTouches] = useState<Touch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string | null) => team.find(m => m.user_id === id)?.name ?? null;

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/prospects?id=${encodeURIComponent(p.id)}`)
      .then(r => r.json()).then(d => { if (live) setTouches(d.touches ?? []); })
      .catch(() => { if (live) setTouches([]); });
    return () => { live = false; };
  }, [p.id]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/prospects', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'touch', prospect_id: p.id, kind: f.get('kind'),
        note: f.get('note'), next_follow_up: f.get('next_follow_up') || null
      })
    }), 'Touch logged');
    setBusy(false);
    if (ok) { onClose(); router.refresh(); }
  }

  return (
    <Overlay onClose={onClose} label={`Touches with ${p.full_name}`}>
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-head">
          <div>
            <div className="crumb">{sourceLabel(p.source)} · {stageLabel(p.stage)}</div>
            <h3>{p.full_name}</h3>
          </div>
          <button type="button" className="x-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit}>
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="ff"><label htmlFor={`${fid}-k`}>What happened</label>
              <select id={`${fid}-k`} name="kind" defaultValue="call">
                {TOUCH_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select></div>
            <div className="ff"><label htmlFor={`${fid}-f`}>Next follow-up</label>
              <input id={`${fid}-f`} name="next_follow_up" type="date" defaultValue={p.next_follow_up ?? ''} /></div>
          </div>
          <div className="ff"><label htmlFor={`${fid}-n`}>Notes</label>
            <textarea id={`${fid}-n`} name="note" rows={3} placeholder="What was said, what comes next." /></div>
          <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Log touch'}</button>
        </form>

        <div className="touch-log">
          <h4 className="touch-head">History</h4>
          {touches === null && <p className="small muted">Reading…</p>}
          {touches && touches.length === 0 && <p className="small muted">No touches logged yet.</p>}
          {touches && touches.map(t => (
            <div key={t.id} className="touch-item">
              <div className="row between" style={{ gap: 10 }}>
                <b>{TOUCH_KINDS.find(k => k.key === t.kind)?.label ?? t.kind}</b>
                <span className="xs muted">{fmtWhen(t.at)}{nameOf(t.by) ? ` · ${nameOf(t.by)}` : ''}</span>
              </div>
              {t.note && <p className="small" style={{ marginTop: 4 }}>{t.note}</p>}
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

/* ---------- add a lead inline ---------- */
function AddLead() {
  const fid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/prospects', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: f.get('full_name'), email: f.get('email'),
        org_name: f.get('org_name'), source: f.get('source')
      })
    }), 'Lead added');
    setBusy(false);
    if (ok) { (e.target as HTMLFormElement).reset(); setOpen(false); router.refresh(); }
  }

  if (!open) return <button className="add-lead" onClick={() => setOpen(true)}>+ Add lead</button>;
  return (
    <form onSubmit={submit} className="add-lead-form">
      <input name="full_name" placeholder="Full name" required aria-label="Full name" />
      <input name="email" type="email" placeholder="Email" required aria-label="Email" />
      <input name="org_name" placeholder="Company" aria-label="Company" />
      <select name="source" defaultValue="linkedin" aria-label="How they found us">
        {PROSPECT_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <button className="btn sm solid" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
      <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

/* ---------- the board ---------- */
export default function LeadBoard({ prospects, team, calendarOn, today }: {
  prospects: Prospect[]; team: Member[]; calendarOn: boolean; today: string;
}) {
  const router = useRouter();
  const [touchFor, setTouchFor] = useState<Prospect | null>(null);
  const [pulling, setPulling] = useState(false);
  const ownerName = (id: string | null) => team.find(m => m.user_id === id)?.name ?? null;

  async function pull() {
    setPulling(true);
    let r: Response, d: any = {};
    try {
      r = await fetch('/api/admin/prospects', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'import' })
      });
      d = await r.json().catch(() => ({}));
    } catch { setPulling(false); toast.bad('No connection.'); return; }
    setPulling(false);
    if (!r.ok) { toast.bad(d.error ?? 'Could not read the calendar.'); return; }
    if (d.reason) { toast.bad(d.reason); return; }
    toast.saved(d.added ? `${d.added} added from the calendar` : 'Nothing new on the calendar');
    router.refresh();
  }

  const due = prospects.filter(p => followUpDue(p, today))
    .sort((a, b) => (a.next_follow_up ?? '') < (b.next_follow_up ?? '') ? -1 : 1);

  const onboardHref = (p: Prospect) =>
    `/console/people?onboard=${encodeURIComponent(p.email)}&name=${encodeURIComponent(p.full_name)}`;

  return (
    <>
      <div className="row between" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <p className="small muted" style={{ margin: 0 }}>Every lead, from first interest to signed, in one place.</p>
        {calendarOn && (
          <button className="btn sm ghost" disabled={pulling} onClick={pull}>
            {pulling ? 'Reading…' : 'Import from calendar'}
          </button>
        )}
      </div>

      {/* Follow up today — the heart of it */}
      <div className="card followups">
        <div className="card-head">
          <h3>Follow up today</h3>
          {due.length > 0 && <span className="pill warn"><span className="dot" />{due.length}</span>}
        </div>
        {due.length === 0 && <p className="small muted">Nobody is due today.</p>}
        {due.map(p => {
          const w = dueWords(p.next_follow_up, today);
          return (
            <div key={p.id} className="fu-row">
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <b className="lead-name">{p.full_name}</b>
                {p.org_name && <span className="lead-sub"> · {p.org_name}</span>}
                <div><span className={`fu-when ${w.tone}`}>{w.text}</span></div>
              </div>
              <StatusCell p={p} onMove={stage => patch({ id: p.id, stage }, stageLabel(stage)).then(ok => ok && router.refresh())} />
              <DateCell p={p} today={today} onSet={d => patch({ id: p.id, next_follow_up: d }, 'Rescheduled').then(ok => ok && router.refresh())} />
              <button className="btn sm solid" onClick={() => setTouchFor(p)}>Log touch</button>
            </div>
          );
        })}
      </div>

      {/* The board */}
      {STAGE_GROUPS.map(g => {
        const rows = prospects.filter(p => stageGroup(p.stage) === g.key);
        const accent = stageColor(PROSPECT_STAGES.find(s => s.group === g.key)!.key);
        return (
          <div key={g.key} className="board-group">
            <div className="group-head" style={{ '--accent': accent } as React.CSSProperties}>
              <h3>{g.label}</h3>
              <span className="group-count">{rows.length}</span>
              {g.key === 'leads' && <span style={{ marginLeft: 'auto' }}><AddLead /></span>}
            </div>
            {rows.length === 0
              ? <p className="small muted" style={{ paddingLeft: 14 }}>
                  {g.key === 'leads' ? 'No leads yet. Add one, or pull calls from the calendar.' : 'Nothing here yet.'}
                </p>
              : (
                <div className="lead-scroll">
                <table className="lead-table">
                  <thead>
                    <tr>
                      <th>Lead</th><th>Status</th><th>Owner</th><th>Source</th>
                      <th>Next follow-up</th><th>Last touched</th><th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(p => (
                      <tr key={p.id}>
                        <td className="lead-cell" data-label="Lead">
                          <b className="lead-name">{p.full_name}</b>
                          <div className="lead-sub">{[p.org_name, p.email].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td data-label="Status">
                          <StatusCell p={p} onMove={stage => patch({ id: p.id, stage }, stageLabel(stage)).then(ok => ok && router.refresh())} />
                        </td>
                        <td data-label="Owner">
                          <select className="owner-select" key={p.owner_id ?? 'none'} defaultValue={p.owner_id ?? ''}
                            aria-label={`Owner for ${p.full_name}`}
                            onChange={e => patch({ id: p.id, owner_id: e.target.value || null }, 'Owner set').then(ok => ok && router.refresh())}>
                            <option value="">Unassigned</option>
                            {team.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                          </select>
                        </td>
                        <td data-label="Source"><span className="src-pill">{sourceLabel(p.source)}</span></td>
                        <td data-label="Next follow-up">
                          <DateCell p={p} today={today} onSet={d => patch({ id: p.id, next_follow_up: d }, 'Follow-up set').then(ok => ok && router.refresh())} />
                        </td>
                        <td data-label="Last touched"><span className="muted small">{sinceDay(p.last_touched_at, today)}</span></td>
                        <td data-label="" className="lead-actions-cell">
                          <div className="lead-actions">
                            <button className="btn sm ghost" onClick={() => setTouchFor(p)}>Log touch</button>
                            {p.stage === 'won' && <a className="btn sm solid" href={onboardHref(p)}>Send onboarding</a>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
          </div>
        );
      })}

      {touchFor && <TouchPanel p={touchFor} team={team} today={today} onClose={() => setTouchFor(null)} />}
    </>
  );
}
