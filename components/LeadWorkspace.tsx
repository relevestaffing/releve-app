'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Prospect, ProspectStage } from '@/lib/prospects-public';
import { PROSPECT_STAGES, PROSPECT_SOURCES, STAGE_GROUPS, stageLabel, stageColor, stageGroup, sourceLabel, followUpDue, isOpenStage } from '@/lib/prospects-public';
import {
  Avatar, Icon, Menu, StageChip, OwnerPicker, DateChip, Fresh, Panel, Sect, useKeys,
  cleanName, sinceWords, dayDiff, addDays, dueWords, type Member
} from './crm/kit';
import { Activity } from './crm/Activity';
import { toast } from './Toast';

/* Leads, working the way Asana works (2 November 2026). Nona: "full Relève
   branding but to interact exactly like Asana".

   - A project header (tile, name, count) with List and Board tabs.
   - One toolbar: Add lead (with a menu for importing), search, Filter, Sort,
     Group by (phase, stage, owner, follow-up date, source) and Fields to show
     or hide columns. Quick views sit under it as chips.
   - The list is a grid with column lines and sections that fold. Each row:
     a drag handle (drag a lead into another section to move it), a select
     box (shift-click selects a range), the name (click it to rename in
     place), and Details on hover. Clicking anywhere else on a row opens it.
   - The pane opens beside the list without covering it. Mark signed at the
     top, copy link, previous and next, full page, close; the comment box is
     pinned at the bottom.
   - Board: stage columns, drag cards between them, add at the foot.
   - Keyboard: / search, j k or arrows move, Enter opens, Esc closes, x
     selects, b list or board, Tab then Q add a lead, Tab then M assign to
     me, Cmd or Ctrl Enter marks signed, ? shows them all.
   Every change shows at once, saves in the background and can be undone. */

type View = 'all' | 'due' | 'mine' | 'unassigned' | 'week' | 'closed';
type SortKey = 'name' | 'stage' | 'follow' | 'touched' | 'age' | 'owner';
type GroupKey = 'phase' | 'stage' | 'owner' | 'due' | 'source';
type FieldKey = 'stage' | 'owner' | 'follow' | 'touched' | 'age' | 'source';
const STAGES = PROSPECT_STAGES.map(s => ({ key: s.key, label: s.label, color: s.color }));
const ORDER = PROSPECT_STAGES.map(s => s.key);
const FIELDS: { key: FieldKey; label: string; width: string }[] = [
  { key: 'stage', label: 'Stage', width: '148px' },
  { key: 'owner', label: 'Owner', width: 'minmax(140px,1fr)' },
  { key: 'follow', label: 'Follow-up', width: '128px' },
  { key: 'touched', label: 'Last touch', width: '128px' },
  { key: 'age', label: 'In stage', width: '92px' },
  { key: 'source', label: 'Source', width: '118px' }
];
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'phase', label: 'Phase' }, { key: 'stage', label: 'Stage' }, { key: 'owner', label: 'Owner' },
  { key: 'due', label: 'Follow-up date' }, { key: 'source', label: 'Source' }
];

export async function send(method: 'PATCH' | 'POST', body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch('/api/admin/prospects', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      let why = ''; try { why = (await r.json())?.error ?? ''; } catch { /* */ }
      toast.bad(why ? `Not saved. ${why}` : 'That did not save. Please try again.');
      return false;
    }
    return true;
  } catch { toast.bad('No connection, so nothing was saved.'); return false; }
}

function inStage(p: Prospect, today: string): number | null {
  const at = p.stage_changed_at ?? p.created_at;
  if (!at) return null;
  return Math.max(0, dayDiff(at.slice(0, 10), today));
}

const Grip = () => (
  <svg className="hdl" viewBox="0 0 10 16" aria-hidden="true">
    {[3, 8, 13].flatMap(y => [<circle key={`a${y}`} cx="3" cy={y} r="1.2" fill="currentColor" />, <circle key={`b${y}`} cx="7" cy={y} r="1.2" fill="currentColor" />])}
  </svg>
);

type Section = { key: string; label: string; color: string; accept?: (p: Prospect) => Partial<Prospect> | null; addAs?: Partial<Prospect> };

export default function LeadWorkspace({ prospects, team, me, calendarOn, today, openId }: {
  prospects: Prospect[]; team: Member[]; me: string; calendarOn: boolean; today: string; openId?: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Prospect[]>(prospects);
  useEffect(() => { setRows(prospects); }, [prospects]);
  const [layout, setLayout] = useState<'list' | 'board'>('list');
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [fOwner, setFOwner] = useState<string[]>([]);
  const [fSource, setFSource] = useState<string[]>([]);
  const [fStage, setFStage] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [group, setGroup] = useState<GroupKey>('phase');
  const [hidden, setHidden] = useState<FieldKey[]>([]);
  const [closed, setClosed] = useState<Record<string, boolean>>({ decided: true });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(openId ?? null);
  const [adding, setAdding] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const tabArmed = useRef(0);
  const search = useRef<HTMLInputElement>(null);

  /* remember layout, grouping, fields and folded sections between visits */
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('ws-leads-2') ?? '{}');
      if (s.layout) setLayout(s.layout);
      if (s.closed) setClosed(s.closed);
      if (s.group) setGroup(s.group);
      if (Array.isArray(s.hidden)) setHidden(s.hidden);
    } catch { /* private window */ }
  }, []);
  useEffect(() => { try { localStorage.setItem('ws-leads-2', JSON.stringify({ layout, closed, group, hidden })); } catch { /* */ } }, [layout, closed, group, hidden]);

  const nameOf = useCallback((id: string | null) => { const m = team.find(t => t.user_id === id); return m ? cleanName(m.name) : null; }, [team]);
  const patch = (id: string, change: Partial<Prospect>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...change } : r)));

  /* ---------- the edits, each undoable ---------- */
  const moveStage = (p: Prospect, stage: string, quiet = false) => {
    if (p.stage === stage) return;
    const prev = { stage: p.stage, stage_changed_at: p.stage_changed_at };
    patch(p.id, { stage: stage as ProspectStage, stage_changed_at: new Date().toISOString() });
    send('PATCH', { id: p.id, stage, from: p.stage }).then(ok => {
      if (!ok) { patch(p.id, prev); return; }
      if (!quiet) toast.undo(stage === 'won' ? `${p.full_name} marked signed` : `${p.full_name} moved to ${stageLabel(stage)}`, () => {
        patch(p.id, prev); send('PATCH', { id: p.id, stage: prev.stage, from: stage });
      });
    });
  };
  const setOwner = (p: Prospect, owner: string | null, quiet = false) => {
    if (p.owner_id === owner) return;
    const prev = p.owner_id;
    patch(p.id, { owner_id: owner });
    send('PATCH', { id: p.id, owner_id: owner, from_owner: prev, subject_name: p.full_name }).then(ok => {
      if (!ok) { patch(p.id, { owner_id: prev }); return; }
      if (!quiet) toast.undo(owner ? `${p.full_name} assigned to ${owner === me ? 'you' : nameOf(owner)}` : `${p.full_name} unassigned`, () => {
        patch(p.id, { owner_id: prev }); send('PATCH', { id: p.id, owner_id: prev, from_owner: owner });
      });
    });
  };
  const setFollow = (p: Prospect, d: string | null, quiet = false) => {
    if (p.next_follow_up === d) return;
    const prev = p.next_follow_up;
    patch(p.id, { next_follow_up: d });
    send('PATCH', { id: p.id, next_follow_up: d }).then(ok => {
      if (!ok) { patch(p.id, { next_follow_up: prev }); return; }
      if (!quiet) toast.undo(d ? `Follow-up ${dueWords(d, today).text.toLowerCase()}` : 'Follow-up cleared', () => {
        patch(p.id, { next_follow_up: prev }); send('PATCH', { id: p.id, next_follow_up: prev });
      });
    });
  };
  const editField = (p: Prospect, change: Partial<Prospect>, field: string) => {
    const next = { ...p, ...change };
    if (!next.full_name.trim() || !next.email.includes('@')) { toast.bad('A lead needs a name and an email.'); return; }
    const prev: Partial<Prospect> = {};
    (Object.keys(change) as (keyof Prospect)[]).forEach(k => { (prev as any)[k] = p[k]; });
    patch(p.id, change);
    send('POST', { id: p.id, full_name: next.full_name, email: next.email, org_name: next.org_name, source: next.source,
      website: next.website, ...(change.note !== undefined ? { note: change.note } : {}), field }).then(ok => {
      if (!ok) patch(p.id, prev); else toast.saved('Saved');
    });
  };
  const applyChange = (p: Prospect, c: Partial<Prospect>) => {
    if (c.stage) moveStage(p, c.stage);
    if ('owner_id' in c) setOwner(p, c.owner_id ?? null);
    if ('next_follow_up' in c) setFollow(p, c.next_follow_up ?? null);
    if (c.source && c.source !== p.source) editField(p, { source: c.source }, 'source');
  };

  /* ---------- what is on screen ---------- */
  const counts = useMemo(() => ({
    all: rows.filter(p => isOpenStage(p.stage)).length,
    due: rows.filter(p => followUpDue(p, today)).length,
    mine: rows.filter(p => p.owner_id === me && isOpenStage(p.stage)).length,
    unassigned: rows.filter(p => !p.owner_id && isOpenStage(p.stage)).length,
    week: rows.filter(p => isOpenStage(p.stage) && p.next_follow_up && p.next_follow_up <= addDays(today, 7)).length,
    closed: rows.filter(p => !isOpenStage(p.stage)).length
  }), [rows, me, today]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = rows.filter(p => {
      if (view === 'due' && !followUpDue(p, today)) return false;
      if (view === 'mine' && p.owner_id !== me) return false;
      if (view === 'unassigned' && (p.owner_id || !isOpenStage(p.stage))) return false;
      if (view === 'week' && !(isOpenStage(p.stage) && p.next_follow_up && p.next_follow_up <= addDays(today, 7))) return false;
      if (view === 'closed' && isOpenStage(p.stage)) return false;
      if (fOwner.length && !fOwner.includes(p.owner_id ?? '__none')) return false;
      if (fSource.length && !fSource.includes(p.source)) return false;
      if (fStage.length && !fStage.includes(p.stage)) return false;
      if (s && ![p.full_name, p.email, p.org_name ?? '', p.website ?? '', nameOf(p.owner_id) ?? ''].join(' ').toLowerCase().includes(s)) return false;
      return true;
    });
    const by = sort ?? { key: 'follow' as SortKey, dir: 1 as const };
    const val = (p: Prospect): string | number => {
      switch (by.key) {
        case 'name': return p.full_name.toLowerCase();
        case 'stage': return ORDER.indexOf(p.stage);
        case 'owner': return (nameOf(p.owner_id) ?? 'zzz').toLowerCase();
        case 'touched': return p.last_touched_at ?? '0000';
        case 'age': return -(inStage(p, today) ?? 0);
        default: return p.next_follow_up ?? '9999-12-31';
      }
    };
    list = [...list].sort((a, b) => { const x = val(a), y = val(b); return x < y ? -by.dir : x > y ? by.dir : 0; });
    return list;
  }, [rows, view, q, fOwner, fSource, fStage, sort, me, today, nameOf]);

  /* ---------- sections, by whatever the list is grouped by ---------- */
  const sections: Section[] = useMemo(() => {
    switch (group) {
      case 'stage': return STAGES.map(s => ({ key: s.key, label: s.label, color: s.color, accept: () => ({ stage: s.key as ProspectStage }), addAs: { stage: s.key as ProspectStage } }));
      case 'owner': return [
        ...team.map(t => ({ key: t.user_id, label: t.user_id === me ? `${cleanName(t.name)} (you)` : cleanName(t.name), color: '#4E7A5C', accept: () => ({ owner_id: t.user_id }), addAs: { owner_id: t.user_id } })),
        { key: '__none', label: 'Unassigned', color: '#9AA39C', accept: () => ({ owner_id: null }), addAs: { owner_id: null } }
      ];
      case 'due': return [
        { key: 'over', label: 'Overdue', color: '#A4483A' },
        { key: 'today', label: 'Today', color: '#A7792F', accept: () => ({ next_follow_up: today }), addAs: { next_follow_up: today } },
        { key: 'week', label: 'Next seven days', color: '#4E7A5C', accept: () => ({ next_follow_up: addDays(today, 3) }), addAs: { next_follow_up: addDays(today, 3) } },
        { key: 'later', label: 'Later', color: '#6E8CA8', accept: () => ({ next_follow_up: addDays(today, 14) }), addAs: { next_follow_up: addDays(today, 14) } },
        { key: 'none', label: 'No date', color: '#9AA39C', accept: () => ({ next_follow_up: null }), addAs: { next_follow_up: null } }
      ];
      case 'source': return PROSPECT_SOURCES.map(s => ({ key: s.key, label: s.label, color: '#7A847D', accept: () => ({ source: s.key }), addAs: { source: s.key } }));
      default: return STAGE_GROUPS.map(g => {
        const first = PROSPECT_STAGES.find(s => s.group === g.key)!;
        return { key: g.key, label: g.label, color: stageColor(first.key),
          accept: (p: Prospect) => (stageGroup(p.stage) === g.key ? null : { stage: (g.key === 'decided' ? 'won' : first.key) as ProspectStage }),
          addAs: g.key === 'decided' ? undefined : { stage: first.key as ProspectStage } };
      });
    }
  }, [group, team, me, today]);
  const sectionOf = useCallback((p: Prospect): string => {
    switch (group) {
      case 'stage': return p.stage;
      case 'owner': return p.owner_id ?? '__none';
      case 'source': return p.source;
      case 'due': {
        if (!p.next_follow_up) return 'none';
        const n = dayDiff(today, p.next_follow_up);
        return n < 0 ? 'over' : n === 0 ? 'today' : n <= 7 ? 'week' : 'later';
      }
      default: return stageGroup(p.stage);
    }
  }, [group, today]);
  const isFolded = (k: string) => !!closed[`${group}:${k}`] && !q;
  const flat = useMemo(() => (layout === 'list'
    ? sections.flatMap(sec => (isFolded(sec.key) ? [] : shown.filter(p => sectionOf(p) === sec.key)))
    : STAGES.flatMap(s => shown.filter(p => p.stage === s.key))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [layout, sections, shown, closed, q, sectionOf]);
  const panelLead = rows.find(r => r.id === panel) ?? null;
  const panelIdx = panelLead ? flat.findIndex(r => r.id === panelLead.id) : -1;

  /* deep link: ?open=id keeps the pane in the address bar */
  useEffect(() => {
    const u = new URL(window.location.href);
    if (panel) u.searchParams.set('open', panel); else u.searchParams.delete('open');
    window.history.replaceState(null, '', u.toString());
  }, [panel]);

  /* ---------- selection, Asana's way ---------- */
  const clickSelect = (id: string, e: { shiftKey: boolean }) => {
    if (e.shiftKey && anchor) {
      const a = flat.findIndex(r => r.id === anchor), b = flat.findIndex(r => r.id === id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSel(s => { const n = new Set(s); flat.slice(lo, hi + 1).forEach(r => n.add(r.id)); return n; });
        return;
      }
    }
    setAnchor(id);
    setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selected = rows.filter(r => sel.has(r.id));

  /* ---------- keyboard ---------- */
  const current = rows.find(r => r.id === (panel ?? focus)) ?? null;
  const moveFocus = (d: number) => {
    if (!flat.length) return;
    const i = flat.findIndex(r => r.id === (panel ?? focus));
    const n = Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + d));
    if (panel) setPanel(flat[n].id); else setFocus(flat[n].id);
    requestAnimationFrame(() => document.querySelector(`[data-row="${flat[n].id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  const quickAdd = () => {
    setLayout('list'); setView('all');
    const target = sections.find(s => s.addAs) ?? sections[0];
    setClosed(c => ({ ...c, [`${group}:${target.key}`]: false }));
    setAdding(target.key);
  };
  const armed = () => performance.now() - tabArmed.current < 1200;
  useKeys({
    /* Tab arms a two-key shortcut only when nothing is focused, so tabbing
       through buttons and fields still works as usual */
    Tab: e => { const a = document.activeElement; if (a && a !== document.body) return; e.preventDefault(); tabArmed.current = performance.now(); },
    '/': e => { e.preventDefault(); search.current?.focus(); },
    q: e => { if (armed()) { e.preventDefault(); tabArmed.current = 0; quickAdd(); } },
    m: e => { if (armed() && current) { e.preventDefault(); tabArmed.current = 0; setOwner(current, me); } },
    n: e => { e.preventDefault(); quickAdd(); },
    j: () => moveFocus(1), k: () => moveFocus(-1),
    ArrowDown: e => { e.preventDefault(); moveFocus(1); }, ArrowUp: e => { e.preventDefault(); moveFocus(-1); },
    Enter: () => { if (focus && !panel) setPanel(focus); },
    x: () => { const id = panel ?? focus; if (id) clickSelect(id, { shiftKey: false }); },
    b: () => setLayout(l => (l === 'list' ? 'board' : 'list')),
    '?': () => setKeysOpen(o => !o),
    Escape: () => { if (keysOpen) { setKeysOpen(false); return; } if (panel) return; if (sel.size) setSel(new Set()); else if (q) setQ(''); else setFocus(null); }
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && panelLead) {
        e.preventDefault();
        moveStage(panelLead, panelLead.stage === 'won' ? 'proposal' : 'won');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  /* ---------- bulk ---------- */
  const bulkStage = (st: string) => { selected.forEach(p => moveStage(p, st, true)); toast.saved(`${selected.length} moved to ${stageLabel(st)}`); setSel(new Set()); };
  const bulkOwner = (o: string | null) => { selected.forEach(p => setOwner(p, o, true)); toast.saved(o ? `${selected.length} assigned to ${nameOf(o)}` : `${selected.length} unassigned`); setSel(new Set()); };
  const bulkFollow = (d: string | null) => { selected.forEach(p => setFollow(p, d, true)); toast.saved(`Follow-up set on ${selected.length}`); setSel(new Set()); };

  async function pull() {
    setPulling(true);
    try {
      const r = await fetch('/api/admin/prospects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'import' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) toast.bad(d.error ?? 'Could not read the calendar.');
      else if (d.reason) toast.bad(d.reason);
      else {
        const parts = [d.added ? `${d.added} from the calendar` : '', d.inboxAdded ? `${d.inboxAdded} from hello@` : ''].filter(Boolean);
        toast.saved(parts.length ? `${parts.join(' and ')} added` : 'Nothing new on the calendar or in hello@');
        router.refresh();
      }
    } catch { toast.bad('No connection.'); }
    setPulling(false);
  }

  const filters = fOwner.length + fSource.length + fStage.length;
  const fields = FIELDS.filter(f => !hidden.includes(f.key));
  const cols = `44px minmax(260px,2.6fr) ${fields.map(f => f.width).join(' ')}`;
  const views: { key: View; label: string; n: number; warn?: boolean }[] = [
    { key: 'all', label: 'All open', n: counts.all },
    { key: 'due', label: 'Follow up today', n: counts.due, warn: counts.due > 0 },
    { key: 'mine', label: 'My leads', n: counts.mine },
    { key: 'unassigned', label: 'Unassigned', n: counts.unassigned },
    { key: 'week', label: 'This week', n: counts.week },
    { key: 'closed', label: 'Signed and passed', n: counts.closed }
  ];
  const head = (key: SortKey | null, label: string) => key
    ? <button className={`sort${sort?.key === key ? ' on' : ''}`} onClick={() => setSort(s => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))}>
        {label}{sort?.key === key && <span aria-hidden="true">{sort.dir === 1 ? '↑' : '↓'}</span>}
      </button>
    : label;
  const fieldSort: Record<FieldKey, SortKey | null> = { stage: 'stage', owner: 'owner', follow: 'follow', touched: 'touched', age: 'age', source: null };

  /* ---------- one row ---------- */
  const cell = (p: Prospect, f: FieldKey) => {
    const age = inStage(p, today);
    switch (f) {
      case 'stage': return <StageChip stage={p.stage} stages={STAGES} onPick={s => moveStage(p, s)} />;
      case 'owner': return <OwnerPicker ownerId={p.owner_id} team={team} onPick={o => setOwner(p, o)} />;
      case 'follow': return <DateChip day={p.next_follow_up} today={today} onPick={d => setFollow(p, d)} muteWhenDone={!isOpenStage(p.stage)} />;
      case 'touched': return <><Fresh iso={p.last_touched_at} today={today} /><span className="ws-muted">{sinceWords(p.last_touched_at, today)}</span></>;
      case 'age': return <span className="ws-muted" title="Days in this stage">{age === null ? '' : age === 0 ? 'Today' : `${age} day${age === 1 ? '' : 's'}`}</span>;
      case 'source': return <span className="ws-tag">{sourceLabel(p.source)}</span>;
    }
  };
  const renderRow = (p: Prospect) => (
    <div key={p.id} className={`ws-row${sel.has(p.id) ? ' sel' : ''}${focus === p.id ? ' focus' : ''}${panel === p.id ? ' open' : ''}${drag?.id === p.id ? ' dragging' : ''}`}
      data-row={p.id} role="row"
      onClick={e => {
        if (e.metaKey || e.ctrlKey) { clickSelect(p.id, e); return; }
        if (e.shiftKey) { clickSelect(p.id, e); return; }
        setFocus(p.id); setPanel(p.id);
      }}>
      <div className="ws-grip" draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); setDrag({ id: p.id, over: null }); }}
        onDragEnd={() => setDrag(null)} onClick={e => e.stopPropagation()} title="Drag to another section">
        <Grip />
        <button className={`ws-cb${sel.has(p.id) ? ' on' : ''}`} aria-label={`Select ${p.full_name}`} aria-pressed={sel.has(p.id)}
          onClick={e => { e.stopPropagation(); clickSelect(p.id, e); }} />
      </div>
      <div>
        <div className="ws-name">
          <Avatar name={p.full_name} size="sm" />
          {renaming === p.id ? (
            <input className="inl" autoFocus defaultValue={p.full_name} aria-label="Name" onClick={e => e.stopPropagation()}
              onBlur={e => { const v = e.target.value.trim(); setRenaming(null); if (v && v !== p.full_name) editField(p, { full_name: v }, 'name'); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />
          ) : (
            <span className="t">
              <b className="editable" title="Click to rename" onClick={e => { e.stopPropagation(); setRenaming(p.id); }}>{p.full_name}</b>
              <small>{p.org_name ?? p.email}</small>
            </span>
          )}
        </div>
        <button className="ws-details" onClick={e => { e.stopPropagation(); setFocus(p.id); setPanel(p.id); }}>Details <Icon.chev /></button>
      </div>
      {fields.map(f => (
        <div key={f.key} className={f.key === 'stage' ? '' : 'opt'} onClick={e => { if ((e.target as HTMLElement).closest('button,a,input')) e.stopPropagation(); }}>
          {cell(p, f.key)}
        </div>
      ))}
    </div>
  );

  const renderQuick = (sec: Section) => {
    if (!sec.addAs) return null;
    if (adding !== sec.key) return (
      <div className="ws-quick"><button className="go" onClick={() => setAdding(sec.key)}><Icon.plus />Add lead…</button></div>
    );
    return (
      <div className="ws-quick">
        <form onSubmit={async e => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const full_name = String(f.get('n') ?? '').trim(), email = String(f.get('e') ?? '').trim().toLowerCase();
          const org_name = String(f.get('o') ?? '').trim() || null;
          const source = String(sec.addAs?.source ?? f.get('s') ?? 'linkedin');
          if (!full_name || !email.includes('@')) { toast.bad('A name and an email, please.'); return; }
          try {
            const r = await fetch('/api/admin/prospects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ full_name, email, org_name, source }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { toast.bad(d.error ?? 'That did not save.'); return; }
            const now = new Date().toISOString();
            const lead: Prospect = { id: d.id || `new-${now}`, full_name, email, org_name, source: source as any, call_at: null, stage: 'new', note: null, lost_reason: null,
              pending_id: null, next_follow_up: addDays(today, 1), last_touched_at: null, owner_id: me, website: null, created_at: now, updated_at: now, stage_changed_at: now,
              ...sec.addAs };
            setRows(rs => [lead, ...rs]);
            if (d.id) send('PATCH', { id: d.id, owner_id: lead.owner_id, next_follow_up: lead.next_follow_up, ...(lead.stage !== 'new' ? { stage: lead.stage } : {}) });
            toast.saved(`${full_name} added`);
            form.reset(); (form.elements.namedItem('n') as HTMLInputElement)?.focus();
          } catch { toast.bad('No connection.'); }
        }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(null); } }}>
          <input name="n" placeholder="Full name" autoFocus aria-label="Full name" />
          <input name="e" type="email" placeholder="Email" aria-label="Email" />
          <input name="o" placeholder="Company" aria-label="Company" />
          {!sec.addAs?.source && <select name="s" defaultValue="linkedin" aria-label="Source">{PROSPECT_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>}
          <button className="btn sm solid">Add</button>
          <button type="button" className="btn sm" onClick={() => setAdding(null)}>Done</button>
        </form>
      </div>
    );
  };

  const dropOn = (sec: Section) => {
    const p = rows.find(r => r.id === drag?.id);
    setDrag(null);
    if (!p || !sec.accept) return;
    const c = sec.accept(p);
    if (c) applyChange(p, c);
  };

  return (
    <div className={`ws ws-x${sel.size ? ' selecting' : ''}`} style={{ ['--cols' as any]: cols }}>
      <div className="ws-proj">
        <span className="ws-tile" aria-hidden="true">L</span>
        <div><h3>Leads</h3><div className="meta">{counts.all} open · {counts.due} to follow up today</div></div>
        <div className="end">
          <button className="ws-tbtn" onClick={() => setKeysOpen(o => !o)} title="Keyboard shortcuts (?)">?</button>
        </div>
      </div>
      <div className="ws-tabs-top" role="tablist" aria-label="Layout">
        <button role="tab" aria-selected={layout === 'list'} className={`ws-tab${layout === 'list' ? ' on' : ''}`} onClick={() => setLayout('list')}><Icon.list />List</button>
        <button role="tab" aria-selected={layout === 'board'} className={`ws-tab${layout === 'board' ? ' on' : ''}`} onClick={() => setLayout('board')}><Icon.board />Board</button>
      </div>
      <div className="ws-bar">
        <div className="ws-add">
          <button onClick={quickAdd}><Icon.plus />Add lead</button>
          <Menu className="" width={240} label="More ways to add" trigger={<Icon.chev />}>
            {close => (
              <>
                <button className="ws-opt" onClick={() => { close(); quickAdd(); }}>Add a lead<kbd>Tab Q</kbd></button>
                {calendarOn && <button className="ws-opt" onClick={() => { close(); pull(); }} disabled={pulling}>{pulling ? 'Reading…' : 'Import from calendar and hello@'}</button>}
              </>
            )}
          </Menu>
        </div>
        <span className="sp" />
        <label className="ws-search"><Icon.search />
          <input ref={search} type="search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search leads" />
          {!q && <kbd>/</kbd>}
        </label>
        <Menu className={`ws-tbtn${filters ? ' on' : ''}`} width={260} label="Filter"
          trigger={<><Icon.filter />Filter{filters > 0 && <span className="badge">{filters}</span>}</>}>
          {() => (
            <>
              <div className="ttl">Owner</div>
              {[{ user_id: '__none', name: 'Unassigned' }, ...team].map(t => (
                <button key={t.user_id} className="ws-opt" onClick={() => setFOwner(f => (f.includes(t.user_id) ? f.filter(x => x !== t.user_id) : [...f, t.user_id]))}>
                  <Avatar name={t.user_id === '__none' ? null : cleanName(t.name)} size="xs" />{t.user_id === '__none' ? 'Unassigned' : cleanName(t.name)}
                  {fOwner.includes(t.user_id) && <span className="ws-tk">✓</span>}</button>
              ))}
              <hr /><div className="ttl">Stage</div>
              {STAGES.map(s => (
                <button key={s.key} className="ws-opt" onClick={() => setFStage(f => (f.includes(s.key) ? f.filter(x => x !== s.key) : [...f, s.key]))}>
                  <span className="sw" style={{ background: s.color }} />{s.label}{fStage.includes(s.key) && <span className="ws-tk">✓</span>}</button>
              ))}
              <hr /><div className="ttl">Source</div>
              {PROSPECT_SOURCES.map(s => (
                <button key={s.key} className="ws-opt" onClick={() => setFSource(f => (f.includes(s.key) ? f.filter(x => x !== s.key) : [...f, s.key]))}>
                  {s.label}{fSource.includes(s.key) && <span className="ws-tk">✓</span>}</button>
              ))}
              {filters > 0 && <><hr /><button className="ws-opt" onClick={() => { setFOwner([]); setFSource([]); setFStage([]); }}>Clear filters</button></>}
            </>
          )}
        </Menu>
        <Menu className={`ws-tbtn${sort ? ' on' : ''}`} width={220} label="Sort"
          trigger={<><Icon.sort />{sort ? { name: 'Name', stage: 'Stage', follow: 'Follow-up', touched: 'Last touch', age: 'In stage', owner: 'Owner' }[sort.key] : 'Sort'}</>}>
          {close => (
            <>
              <div className="ttl">Sort by</div>
              {([['follow', 'Follow-up date'], ['touched', 'Last touch'], ['age', 'Time in stage'], ['stage', 'Stage'], ['owner', 'Owner'], ['name', 'Name']] as [SortKey, string][]).map(([k, l]) => (
                <button key={k} className="ws-opt" onClick={() => { close(); setSort(s => (s?.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: 1 })); }}>
                  {l}{sort?.key === k && <span className="ws-tk">{sort.dir === 1 ? '↑' : '↓'}</span>}</button>
              ))}
              {sort && <><hr /><button className="ws-opt" onClick={() => { close(); setSort(null); }}>Default order</button></>}
            </>
          )}
        </Menu>
        {layout === 'list' && (
          <Menu className={`ws-tbtn${group !== 'phase' ? ' on' : ''}`} width={220} label="Group by"
            trigger={<><Icon.board />Group: {GROUPS.find(g => g.key === group)?.label}</>}>
            {close => (
              <>
                <div className="ttl">Group by</div>
                {GROUPS.map(g => <button key={g.key} className="ws-opt" onClick={() => { close(); setGroup(g.key); }}>{g.label}{group === g.key && <span className="ws-tk">✓</span>}</button>)}
              </>
            )}
          </Menu>
        )}
        {layout === 'list' && (
          <Menu className={`ws-tbtn${hidden.length ? ' on' : ''}`} width={230} label="Fields" trigger={<><Icon.list />Fields</>}>
            {() => (
              <>
                <div className="ttl">Show fields</div>
                {FIELDS.map(f => (
                  <button key={f.key} className={`tog${hidden.includes(f.key) ? '' : ' on'}`} onClick={() => setHidden(h => (h.includes(f.key) ? h.filter(x => x !== f.key) : [...h, f.key]))}>
                    {f.label}<span className="box" />
                  </button>
                ))}
              </>
            )}
          </Menu>
        )}
      </div>
      <div className="ws-views" role="tablist" aria-label="Quick views">
        {views.map(v => (
          <button key={v.key} role="tab" aria-selected={view === v.key} className={`ws-view${view === v.key ? ' on' : ''}${v.warn ? ' warn' : ''}`} onClick={() => setView(v.key)}>
            {v.label}<span className="n">{v.n}</span>
          </button>
        ))}
      </div>
      {keysOpen && (
        <div className="ws-sheet" style={{ margin: '12px 24px 0', border: '1px solid var(--ws-line)', background: '#fff' }}>
          <span><kbd>/</kbd></span><span>Search</span>
          <span><kbd>j</kbd><kbd>k</kbd> or <kbd>↑</kbd><kbd>↓</kbd></span><span>Move between leads (also inside the pane)</span>
          <span><kbd>Enter</kbd></span><span>Open the lead</span>
          <span><kbd>Esc</kbd></span><span>Close the pane, clear the selection or search</span>
          <span><kbd>Tab</kbd> then <kbd>Q</kbd> or <kbd>n</kbd></span><span>Add a lead</span>
          <span><kbd>Tab</kbd> then <kbd>M</kbd></span><span>Assign the lead to me</span>
          <span><kbd>⌘</kbd><kbd>Enter</kbd></span><span>Mark the open lead signed</span>
          <span><kbd>x</kbd>, <kbd>Shift</kbd>-click</span><span>Select one, select a range</span>
          <span><kbd>b</kbd></span><span>Switch between list and board</span>
        </div>
      )}

      {layout === 'list' ? (
        <div className="ws-list" role="grid" aria-label="Leads">
          <div className="ws-head" role="row">
            <div />
            <div>{head('name', 'Name')}</div>
            {fields.map(f => <div key={f.key}>{head(fieldSort[f.key], f.label)}</div>)}
          </div>
          {sections.map(sec => {
            const list = shown.filter(p => sectionOf(p) === sec.key);
            if (!list.length && (view !== 'all' || q || filters) ) return null;
            if (!list.length && group !== 'phase' && group !== 'stage' && !sec.addAs) return null;
            const folded = isFolded(sec.key);
            return (
              <section key={`${group}:${sec.key}`} className={`ws-sec${folded ? ' closed' : ''}${drag && drag.over === sec.key ? ' drop' : ''}`}
                onDragOver={e => { if (!drag || !sec.accept) return; e.preventDefault(); if (drag.over !== sec.key) setDrag({ ...drag, over: sec.key }); }}
                onDrop={e => { e.preventDefault(); dropOn(sec); }}>
                <div className="ws-sec-head">
                  <button className="chev" aria-expanded={!folded} aria-label={folded ? `Show ${sec.label}` : `Hide ${sec.label}`}
                    onClick={() => setClosed(c => ({ ...c, [`${group}:${sec.key}`]: !c[`${group}:${sec.key}`] }))}><Icon.chev /></button>
                  <span className="sw" style={{ background: sec.color }} />
                  <h4 onClick={() => setClosed(c => ({ ...c, [`${group}:${sec.key}`]: !c[`${group}:${sec.key}`] }))}>{sec.label}</h4>
                  <span className="cnt">{list.length}</span>
                  {sec.addAs && <button className="add" title="Add a lead here" aria-label={`Add a lead to ${sec.label}`}
                    onClick={() => { setClosed(c => ({ ...c, [`${group}:${sec.key}`]: false })); setAdding(sec.key); }}><Icon.plus /></button>}
                </div>
                <div className="ws-sec-body">
                  {list.map(p => renderRow(p))}
                  {!list.length && !sec.addAs && <div className="ws-empty">Nobody here.</div>}
                  {renderQuick(sec)}
                </div>
              </section>
            );
          })}
          {!shown.length && <div className="ws-none"><h4>All clear</h4><p className="small">Nothing in this view right now.</p></div>}
        </div>
      ) : (
        <div className="ws-board" aria-label="Stages">
          {STAGES.map(s => {
            const list = shown.filter(p => p.stage === s.key);
            return (
              <div key={s.key} className={`ws-col${drag?.over === s.key ? ' drop' : ''}`}
                onDragOver={e => { e.preventDefault(); if (drag && drag.over !== s.key) setDrag({ ...drag, over: s.key }); }}
                onDrop={e => { e.preventDefault(); const p = rows.find(r => r.id === drag?.id); setDrag(null); if (p) moveStage(p, s.key); }}>
                <div className="ws-col-head"><span className="sw" style={{ background: s.color }} /><h5>{s.label}</h5><span className="cnt">{list.length}</span>
                  <button className="add" aria-label={`Add a lead to ${s.label}`} onClick={() => { setGroup('stage'); setLayout('list'); setView('all'); setClosed(c => ({ ...c, [`stage:${s.key}`]: false })); setAdding(s.key); }}><Icon.plus /></button></div>
                <div className="ws-col-body">
                  {list.map(p => {
                    const w = p.next_follow_up && isOpenStage(p.stage) ? dueWords(p.next_follow_up, today) : null;
                    return (
                      <div key={p.id} className={`ws-card${drag?.id === p.id ? ' dragging' : ''}`} draggable data-row={p.id}
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDrag({ id: p.id, over: null }); }}
                        onDragEnd={() => setDrag(null)} onClick={() => { setFocus(p.id); setPanel(p.id); }}>
                        <b>{p.full_name}</b><small>{p.org_name ?? p.email}</small>
                        <div className="meta">
                          {w ? <span className={w.tone}><Icon.cal /> {w.text}</span> : <span className="ws-faint">No follow-up</span>}
                          <Fresh iso={p.last_touched_at} today={today} />
                          <Avatar name={nameOf(p.owner_id)} size="xs" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button className="ws-col-foot" onClick={() => { setGroup('stage'); setLayout('list'); setView('all'); setClosed(c => ({ ...c, [`stage:${s.key}`]: false })); setAdding(s.key); }}>+ Add lead</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="ws-keys" aria-hidden="true">
        <span><kbd>/</kbd>search</span><span><kbd>Tab</kbd><kbd>Q</kbd>add</span><span><kbd>j</kbd><kbd>k</kbd>move</span>
        <span><kbd>Enter</kbd>open</span><span><kbd>Tab</kbd><kbd>M</kbd>assign to me</span><span><kbd>⌘</kbd><kbd>Enter</kbd>mark signed</span><span><kbd>?</kbd>all shortcuts</span>
      </div>

      {sel.size > 0 && (
        <div className="ws-bulk" role="toolbar" aria-label="Selected leads">
          <span className="n">{sel.size} selected</span>
          <Menu className="" width={220} label="Move selected" trigger={<>Move to…</>}>
            {close => STAGES.map(s => <button key={s.key} className="ws-opt" onClick={() => { close(); bulkStage(s.key); }}><span className="sw" style={{ background: s.color }} />{s.label}</button>)}
          </Menu>
          <Menu className="" width={240} label="Assign selected" trigger={<>Assign…</>}>
            {close => <>{team.map(t => <button key={t.user_id} className="ws-opt" onClick={() => { close(); bulkOwner(t.user_id); }}><Avatar name={cleanName(t.name)} size="sm" />{cleanName(t.name)}</button>)}
              <hr /><button className="ws-opt" onClick={() => { close(); bulkOwner(null); }}><Avatar name={null} size="sm" />Unassigned</button></>}
          </Menu>
          <Menu className="" width={220} label="Follow-up for selected" trigger={<>Follow up…</>}>
            {close => ([['Today', today], ['Tomorrow', addDays(today, 1)], ['In 3 days', addDays(today, 3)], ['In a week', addDays(today, 7)]] as [string, string][]).map(([l, v]) =>
              <button key={l} className="ws-opt" onClick={() => { close(); bulkFollow(v); }}>{l}</button>)}
          </Menu>
          <button className="x" onClick={() => setSel(new Set())} aria-label="Clear selection">×</button>
        </div>
      )}

      {panelLead && (
        <Panel crumb={`Lead · ${stageLabel(panelLead.stage)}`} onClose={() => setPanel(null)} fullHref={`/console/lead/${panelLead.id}`}
          copyHref={`/console/prospects?open=${panelLead.id}`}
          lead={<button className={`ws-mark${panelLead.stage === 'won' ? ' done' : ''}`} title="Mark signed (⌘ Enter)"
            onClick={() => moveStage(panelLead, panelLead.stage === 'won' ? 'proposal' : 'won')}>
            <Icon.star />{panelLead.stage === 'won' ? 'Signed' : 'Mark signed'}</button>}
          onPrev={panelIdx > 0 ? () => setPanel(flat[panelIdx - 1].id) : null}
          onNext={panelIdx >= 0 && panelIdx < flat.length - 1 ? () => setPanel(flat[panelIdx + 1].id) : null}>
          <LeadDetail key={panelLead.id} p={panelLead} team={team} today={today}
            onStage={s => moveStage(panelLead, s)} onOwner={o => setOwner(panelLead, o)} onFollow={d => setFollow(panelLead, d)}
            onField={(c, f) => editField(panelLead, c, f)}
            onTouched={next => patch(panelLead.id, { last_touched_at: new Date().toISOString(), ...(next ? { next_follow_up: next } : {}) })} />
        </Panel>
      )}
    </div>
  );
}

/* ---------- the lead, in full: used in the panel and on the lead's own page ---------- */
export function LeadDetail({ p, team, today, onStage, onOwner, onFollow, onField, onTouched, extra }: {
  p: Prospect; team: Member[]; today: string;
  onStage: (s: string) => void; onOwner: (o: string | null) => void; onFollow: (d: string | null) => void;
  onField: (change: Partial<Prospect>, field: string) => void; onTouched?: (next: string | null) => void; extra?: React.ReactNode;
}) {
  const [refresh, setRefresh] = useState(0);
  const open = ORDER.filter(k => k !== 'won' && k !== 'lost');
  const at = ORDER.indexOf(p.stage);
  const age = inStage(p, today);
  const field = (k: keyof Prospect, label: string, type = 'text', ph = 'Add') => (
    <input className="ws-edit" type={type} defaultValue={(p[k] as string) ?? ''} placeholder={ph} aria-label={label} key={`${p.id}-${k}-${p[k]}`}
      onBlur={e => { const v = e.target.value.trim(); if (v !== ((p[k] as string) ?? '')) onField({ [k]: v || null } as any, String(k)); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
  /* refresh the history after a stage, owner or follow-up change, but not on
     first open (that would read it twice) */
  const seen = useRef(`${p.stage}|${p.owner_id}|${p.next_follow_up}`);
  useEffect(() => {
    const now = `${p.stage}|${p.owner_id}|${p.next_follow_up}`;
    if (now === seen.current) return;
    seen.current = now;
    const id = window.setTimeout(() => setRefresh(r => r + 1), 700);
    return () => window.clearTimeout(id);
  }, [p.stage, p.owner_id, p.next_follow_up]);

  return (
    <>
      <div className="ws-p-hero">
        <Avatar name={p.full_name} size="lg" />
        <div className="nm">
          <input className="ws-edit h" defaultValue={p.full_name} aria-label="Name" key={`n-${p.full_name}`}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.full_name) onField({ full_name: v }, 'name'); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          <input className="ws-edit s" defaultValue={p.org_name ?? ''} placeholder="Company" aria-label="Company" key={`o-${p.org_name}`}
            onBlur={e => { const v = e.target.value.trim(); if (v !== (p.org_name ?? '')) onField({ org_name: v || null }, 'company'); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </div>
        {p.org_name && <Avatar name={p.org_name} company size="lg" title={p.org_name} />}
      </div>

      <div className="ws-steps" role="group" aria-label="Stage">
        {open.map(k => {
          const i = ORDER.indexOf(k);
          const done = isOpenStage(p.stage) ? i <= at : p.stage === 'won';
          return <button key={k} className={`ws-step${done ? ' done' : ''}${k === p.stage ? ' cur' : ''}`} title={`Move to ${stageLabel(k)}`} aria-label={stageLabel(k)}
            style={done ? { background: stageColor(p.stage === 'won' ? 'won' : p.stage) } : undefined} onClick={() => k !== p.stage && onStage(k)} />;
        })}
      </div>
      <div className="ws-step-say">
        <span><b>{stageLabel(p.stage)}</b>{isOpenStage(p.stage) ? ` · step ${at + 1} of ${open.length}` : ''}{age !== null ? ` · ${age === 0 ? 'since today' : `${age} day${age === 1 ? '' : 's'} in this stage`}` : ''}</span>
        <span className="end">
          <button className={`ws-chip${p.stage === 'lost' ? ' over' : ''}`} onClick={() => p.stage !== 'lost' && onStage('lost')}><Icon.close />Passed</button>
        </span>
      </div>

      <dl className="ws-props">
        <dt><Icon.user />Owner</dt><dd><OwnerPicker ownerId={p.owner_id} team={team} onPick={onOwner} /></dd>
        <dt><Icon.cal />Follow-up</dt><dd><DateChip day={p.next_follow_up} today={today} onPick={onFollow} muteWhenDone={!isOpenStage(p.stage)} /></dd>
        <dt><Icon.flag />Stage</dt><dd><StageChip stage={p.stage} stages={STAGES} onPick={onStage} />
          <span className="ws-faint" style={{ marginLeft: 10 }}>{age === null ? '' : age === 0 ? 'since today' : `for ${age} day${age === 1 ? '' : 's'}`}</span></dd>
        <dt><Icon.clock />Last touch</dt><dd><Fresh iso={p.last_touched_at} today={today} /><span style={{ marginLeft: 8 }}>{sinceWords(p.last_touched_at, today)}</span></dd>
        <dt><Icon.mail />Email</dt><dd>{field('email', 'Email', 'email')}</dd>
        <dt><Icon.link />Website</dt><dd>{field('website', 'Website', 'text', 'Add a website')}</dd>
        <dt><Icon.spark />Source</dt><dd>
          <Menu className="ws-chip" width={200} label="Source" trigger={<span className="ws-tag">{sourceLabel(p.source)}</span>}>
            {close => PROSPECT_SOURCES.map(s => <button key={s.key} className="ws-opt" onClick={() => { close(); if (s.key !== p.source) onField({ source: s.key }, 'source'); }}>{s.label}{s.key === p.source && <span className="ws-tk">✓</span>}</button>)}
          </Menu></dd>
        {p.call_at && <><dt><Icon.phone />Call</dt><dd>{new Date(p.call_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</dd></>}
        <dt><Icon.spark />Added</dt><dd className="ws-muted">{sinceWords(p.created_at, today)}</dd>
      </dl>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <a className="btn sm solid" href={`mailto:${p.email}`}><Icon.mail />&nbsp;Email {p.full_name.split(' ')[0]}</a>
        {p.stage === 'won' && <a className="btn sm" href={`/console/people?onboard=${encodeURIComponent(p.email)}&name=${encodeURIComponent(p.full_name)}`}>Send onboarding</a>}
        {!isOpenStage(p.stage) ? null : <button className="btn sm" onClick={() => onFollow(addDays(today, 3))}>Follow up in 3 days</button>}
      </div>

      <Sect title="What they told us">
        <textarea className="ws-edit" defaultValue={p.note ?? ''} placeholder="Their situation, what they need, what they said on the call." key={`note-${p.id}`}
          onBlur={e => { const v = e.target.value.trim(); if (v !== (p.note ?? '')) onField({ note: v || null }, 'note'); }} />
      </Sect>

      {extra}

      <Sect title="Activity">
        <Activity type="prospect" id={p.id} subjectName={p.full_name} team={team} today={today} stageLabel={stageLabel}
          onTouched={next => { onTouched?.(next); }} refreshKey={refresh} />
      </Sect>
    </>
  );
}
