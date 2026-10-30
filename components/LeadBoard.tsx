'use client';
import { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Overlay from './Overlay';
import { toast, saving } from './Toast';
import type { Prospect, Touch, ProspectStage } from '@/lib/prospects-public';
import {
  PROSPECT_STAGES, PROSPECT_SOURCES, STAGE_GROUPS, TOUCH_KINDS,
  stageLabel, stageColor, stageGroup, sourceLabel, followUpDue
} from '@/lib/prospects-public';
import { daysBetweenISO } from '@/lib/money-public';
import { fmtWhen } from '@/lib/words';

/* The lead board, reworked to feel seamless (28 October 2026). One grouped
   table, a solid coloured status label per row, inline owner and date. Every
   inline edit updates the row on screen at once and saves in the background,
   so nothing reloads the page or jumps the scroll. The status menu renders in
   a portal so the table's own scroll can never clip it. "Follow up today"
   sits on top: it is the point of the whole feature, so it reads first. */

type Member = { user_id: string; name: string };

/* A team member's name, tidied. Accounts without a display name fall back to
   their email; show the readable part rather than a raw address. */
function cleanName(name: string): string {
  if (!name) return 'Someone';
  if (!name.includes('@')) return name;
  const local = name.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return local ? local.replace(/\b\w/g, c => c.toUpperCase()) : name;
}

/* A background save for a single-cell edit. The row already shows the change;
   this just persists it, stays quiet on success, and on failure says so and
   hands back the previous value to put back. */
async function persist(body: Record<string, unknown>, revert: () => void) {
  try {
    const res = await fetch('/api/admin/prospects', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let why = '';
      try { why = (await res.json())?.error ?? ''; } catch { /* not json */ }
      toast.bad(why ? `Not saved. ${why}` : 'That did not save. Please try again.');
      revert();
    }
  } catch { toast.bad('No connection, so nothing was saved.'); revert(); }
}

/* Last touched, said the short way. */
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

/* ---------- the status label, click to change ----------
   The menu is portalled to the body at a fixed position worked out from the
   button, so the table's horizontal scroll (overflow) never clips it. It
   closes on an outside click, on scroll, on resize and on Escape. */
function StatusCell({ stage, onMove }: { stage: ProspectStage; onMove: (s: ProspectStage) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const H = 332;
      const below = window.innerHeight - r.bottom;
      const top = below < H ? Math.max(8, r.top - H - 4) : r.bottom + 6;
      const left = Math.min(r.left, window.innerWidth - 210);
      setPos({ top, left: Math.max(8, left) });
    };
    place();
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="status-wrap">
      <button ref={btn} className="status-pill" style={{ background: stageColor(stage) }}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {stageLabel(stage)}<span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && pos && createPortal(
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="status-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
            {PROSPECT_STAGES.map(s => (
              <button key={s.key} className="status-opt" role="menuitem"
                onClick={() => { setOpen(false); if (s.key !== stage) onMove(s.key); }}>
                <span className="status-swatch" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
                {s.key === stage && <span className="status-now" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </>, document.body)}
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
function TouchPanel({ p, team, onClose, onLogged }: {
  p: Prospect; team: Member[]; onClose: () => void;
  onLogged: (next_follow_up: string | null) => void;
}) {
  const fid = useId();
  const [touches, setTouches] = useState<Touch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string | null) => {
    const m = team.find(x => x.user_id === id);
    return m ? cleanName(m.name) : null;
  };

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
    const nextFollow = (f.get('next_follow_up') as string) || null;
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/prospects', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'touch', prospect_id: p.id, kind: f.get('kind'),
        note: f.get('note'), next_follow_up: nextFollow
      })
    }), 'Touch logged');
    setBusy(false);
    if (ok) { onLogged(nextFollow); onClose(); }
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
function AddLead({ onAdded }: { onAdded: (p: Prospect) => void }) {
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const full_name = String(f.get('full_name') ?? '').trim();
    const email = String(f.get('email') ?? '').trim();
    const org_name = String(f.get('org_name') ?? '').trim() || null;
    const source = String(f.get('source') ?? 'linkedin');
    setBusy(true);
    let id = '';
    const ok = await saving(async () => {
      const res = await fetch('/api/admin/prospects', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ full_name, email, org_name, source })
      });
      try { id = (await res.clone().json())?.id ?? ''; } catch { /* keep res */ }
      return res;
    }, 'Lead added');
    setBusy(false);
    if (ok) {
      const now = new Date().toISOString();
      onAdded({
        id: id || `new-${now}`, full_name, email, org_name,
        source: source as Prospect['source'], call_at: null, stage: 'new',
        note: null, lost_reason: null, pending_id: null, next_follow_up: null,
        last_touched_at: null, owner_id: null, website: null, created_at: now, updated_at: now
      });
      form.reset();
      setOpen(false);
    }
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
  const [rows, setRows] = useState<Prospect[]>(prospects);
  const [touchFor, setTouchFor] = useState<Prospect | null>(null);
  const [pulling, setPulling] = useState(false);

  // Re-seed when the server sends a fresh list (navigation, or after an import).
  useEffect(() => { setRows(prospects); }, [prospects]);

  const ownerName = (id: string | null) => {
    const m = team.find(x => x.user_id === id);
    return m ? cleanName(m.name) : null;
  };
  const patchRow = (id: string, change: Partial<Prospect>) =>
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...change } : r)));

  // Inline edits: change the row on screen now, save in the background.
  const move = (p: Prospect, stage: ProspectStage) => {
    const prev = p.stage;
    patchRow(p.id, { stage });
    persist({ id: p.id, stage }, () => patchRow(p.id, { stage: prev }));
  };
  const setOwner = (p: Prospect, owner_id: string | null) => {
    const prev = p.owner_id;
    patchRow(p.id, { owner_id });
    persist({ id: p.id, owner_id }, () => patchRow(p.id, { owner_id: prev }));
  };
  const setFollow = (p: Prospect, d: string | null) => {
    const prev = p.next_follow_up;
    patchRow(p.id, { next_follow_up: d });
    persist({ id: p.id, next_follow_up: d }, () => patchRow(p.id, { next_follow_up: prev }));
  };

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
    const parts = [d.added ? `${d.added} from the calendar` : '', d.inboxAdded ? `${d.inboxAdded} from hello@` : ''].filter(Boolean);
    if (d.inboxApplicants) toast.saved(`${d.inboxApplicants} job seeker${d.inboxApplicants === 1 ? '' : 's'} from hello@ added to Applications`);
    toast.saved(parts.length ? `${parts.join(' and ')} added` : 'Nothing new on the calendar or in hello@');
    if (d.inboxReason && d.inboxReason !== 'preview') toast.bad(d.inboxReason);
    router.refresh();
  }

  const due = rows.filter(p => followUpDue(p, today))
    .sort((a, b) => ((a.next_follow_up ?? '') < (b.next_follow_up ?? '') ? -1 : 1));

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
                <Link href={`/console/lead/${p.id}`} className="lead-name lead-link">{p.full_name}</Link>
                {p.org_name && <span className="lead-sub"> · {p.org_name}</span>}
                <div><span className={`fu-when ${w.tone}`}>{w.text}</span></div>
              </div>
              <StatusCell stage={p.stage} onMove={s => move(p, s)} />
              <DateCell p={p} today={today} onSet={d => setFollow(p, d)} />
              <button className="btn sm solid" onClick={() => setTouchFor(p)}>Log touch</button>
            </div>
          );
        })}
      </div>

      {/* The board */}
      {STAGE_GROUPS.map(g => {
        const groupRows = rows.filter(p => stageGroup(p.stage) === g.key);
        const accent = stageColor(PROSPECT_STAGES.find(s => s.group === g.key)!.key);
        return (
          <div key={g.key} className="board-group">
            <div className="group-head" style={{ '--accent': accent } as React.CSSProperties}>
              <h3>{g.label}</h3>
              <span className="group-count">{groupRows.length}</span>
              {g.key === 'leads' && <span style={{ marginLeft: 'auto' }}><AddLead onAdded={p => setRows(rs => [p, ...rs])} /></span>}
            </div>
            {groupRows.length === 0
              ? <p className="small muted" style={{ paddingLeft: 15 }}>
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
                    {groupRows.map(p => (
                      <tr key={p.id}>
                        <td className="lead-cell" data-label="Lead">
                          <Link href={`/console/lead/${p.id}`} className="lead-name lead-link">{p.full_name}</Link>
                          <div className="lead-sub">{[p.org_name, p.email].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td data-label="Status">
                          <StatusCell stage={p.stage} onMove={s => move(p, s)} />
                        </td>
                        <td data-label="Owner">
                          <select className="owner-select" key={p.owner_id ?? 'none'} defaultValue={p.owner_id ?? ''}
                            aria-label={`Owner for ${p.full_name}`}
                            onChange={e => setOwner(p, e.target.value || null)}>
                            <option value="">Unassigned</option>
                            {team.map(m => <option key={m.user_id} value={m.user_id}>{cleanName(m.name)}</option>)}
                          </select>
                        </td>
                        <td data-label="Source"><span className="src-pill">{sourceLabel(p.source)}</span></td>
                        <td data-label="Next follow-up">
                          <DateCell p={p} today={today} onSet={d => setFollow(p, d)} />
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

      {touchFor && (
        <TouchPanel
          p={touchFor}
          team={team}
          onClose={() => setTouchFor(null)}
          onLogged={next => patchRow(touchFor.id, {
            last_touched_at: new Date().toISOString(),
            next_follow_up: next ?? touchFor.next_follow_up
          })}
        />
      )}
    </>
  );
}
