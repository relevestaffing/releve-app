'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Prospect, ProspectStage } from '@/lib/prospects-public';
import { PROSPECT_STAGES, PROSPECT_SOURCES, STAGE_GROUPS, stageLabel, stageColor, stageGroup, sourceLabel, followUpDue, isOpenStage } from '@/lib/prospects-public';
import {
  Avatar, Icon, Menu, StageChip, OwnerPicker, DateChip, Fresh, Panel, Sect, useKeys,
  cleanName, sinceWords, dayDiff, addDays, type Member
} from './crm/kit';
import { Activity } from './crm/Activity';
import { toast } from './Toast';

/* Leads, at Asana quality (2 November 2026). Nona: the CRM "feels cheap and
   not very detailed". One workspace: saved views across the top (all, due,
   mine, unassigned, this week), search, filters and sort; a list grouped by
   where each lead is, with sections that fold, or a board of stages to drag
   between; and a panel that slides in with every field editable, the next
   step and the full history. Every change shows at once, saves in the
   background, and can be undone from the toast. */

type View = 'all' | 'due' | 'mine' | 'unassigned' | 'week' | 'closed';
type SortKey = 'name' | 'stage' | 'follow' | 'touched' | 'age' | 'owner';
const STAGES = PROSPECT_STAGES.map(s => ({ key: s.key, label: s.label, color: s.color }));
const ORDER = PROSPECT_STAGES.map(s => s.key);
const COLS = '40px minmax(200px,2.2fr) 142px minmax(128px,1fr) 128px 132px 92px 110px';

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
  const [closed, setClosed] = useState<Record<string, boolean>>({ decided: true });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(openId ?? null);
  const [adding, setAdding] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const search = useRef<HTMLInputElement>(null);

  /* remember the layout and the folded sections between visits */
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('ws-leads') ?? '{}');
      if (s.layout) setLayout(s.layout);
      if (s.closed) setClosed(s.closed);
    } catch { /* private window */ }
  }, []);
  useEffect(() => { try { localStorage.setItem('ws-leads', JSON.stringify({ layout, closed })); } catch { /* */ } }, [layout, closed]);

  const nameOf = useCallback((id: string | null) => { const m = team.find(t => t.user_id === id); return m ? cleanName(m.name) : null; }, [team]);
  const patch = (id: string, change: Partial<Prospect>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...change } : r)));

  /* ---------- the edits, each undoable ---------- */
  const moveStage = (p: Prospect, stage: string, quiet = false) => {
    const prev = { stage: p.stage, stage_changed_at: p.stage_changed_at };
    patch(p.id, { stage: stage as ProspectStage, stage_changed_at: new Date().toISOString() });
    send('PATCH', { id: p.id, stage, from: p.stage }).then(ok => {
      if (!ok) { patch(p.id, prev); return; }
      if (!quiet) toast.undo(`${p.full_name} moved to ${stageLabel(stage)}`, () => {
        patch(p.id, prev); send('PATCH', { id: p.id, stage: prev.stage, from: stage });
      });
    });
  };
  const setOwner = (p: Prospect, owner: string | null, quiet = false) => {
    const prev = p.owner_id;
    patch(p.id, { owner_id: owner });
    send('PATCH', { id: p.id, owner_id: owner, from_owner: prev, subject_name: p.full_name }).then(ok => {
      if (!ok) { patch(p.id, { owner_id: prev }); return; }
      if (!quiet) toast.undo(owner ? `${p.full_name} assigned to ${nameOf(owner)}` : `${p.full_name} unassigned`, () => {
        patch(p.id, { owner_id: prev }); send('PATCH', { id: p.id, owner_id: prev, from_owner: owner });
      });
    });
  };
  const setFollow = (p: Prospect, d: string | null, quiet = false) => {
    const prev = p.next_follow_up;
    patch(p.id, { next_follow_up: d });
    send('PATCH', { id: p.id, next_follow_up: d }).then(ok => {
      if (!ok) { patch(p.id, { next_follow_up: prev }); return; }
      if (!quiet) toast.undo(d ? `Follow-up set` : 'Follow-up cleared', () => {
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

  const flat = useMemo(() => (layout === 'list'
    ? STAGE_GROUPS.flatMap(g => (closed[g.key] && view === 'all' && !q ? [] : shown.filter(p => stageGroup(p.stage) === g.key)))
    : shown), [layout, shown, closed, view, q]);
  const panelLead = rows.find(r => r.id === panel) ?? null;
  const panelIdx = panelLead ? flat.findIndex(r => r.id === panelLead.id) : -1;

  /* deep link: ?open=id keeps the panel in the address bar */
  useEffect(() => {
    const u = new URL(window.location.href);
    if (panel) u.searchParams.set('open', panel); else u.searchParams.delete('open');
    window.history.replaceState(null, '', u.toString());
  }, [panel]);

  /* ---------- keyboard ---------- */
  const moveFocus = (d: number) => {
    if (!flat.length) return;
    const i = flat.findIndex(r => r.id === (panel ?? focus));
    const n = Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + d));
    if (panel) setPanel(flat[n].id); else setFocus(flat[n].id);
    requestAnimationFrame(() => document.querySelector(`[data-row="${flat[n].id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  useKeys({
    '/': e => { e.preventDefault(); search.current?.focus(); },
    n: e => { e.preventDefault(); setLayout('list'); setClosed(c => ({ ...c, leads: false })); setAdding('leads'); },
    j: () => moveFocus(1), k: () => moveFocus(-1), ArrowDown: e => { if (!panel) { e.preventDefault(); moveFocus(1); } }, ArrowUp: e => { if (!panel) { e.preventDefault(); moveFocus(-1); } },
    Enter: () => { if (focus && !panel) setPanel(focus); },
    x: () => { if (focus) toggle(focus); },
    b: () => setLayout(l => (l === 'list' ? 'board' : 'list')),
    Escape: () => { if (panel) return; if (sel.size) setSel(new Set()); else if (q) setQ(''); }
  });

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selected = rows.filter(r => sel.has(r.id));

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
  const views: { key: View; label: string; n: number; warn?: boolean }[] = [
    { key: 'all', label: 'All leads', n: counts.all },
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

  /* ---------- one row ---------- */
  const renderRow = (p: Prospect) => {
    const age = inStage(p, today);
    return (
      <div key={p.id} className={`ws-row${sel.has(p.id) ? ' sel' : ''}${focus === p.id ? ' focus' : ''}${panel === p.id ? ' open' : ''}`}
        data-row={p.id} role="row" onClick={() => { setFocus(p.id); setPanel(p.id); }}>
        <div className="ws-check" onClick={e => { e.stopPropagation(); toggle(p.id); }}>
          <button className={`ws-cb${sel.has(p.id) ? ' on' : ''}`} aria-label={`Select ${p.full_name}`} aria-pressed={sel.has(p.id)} />
        </div>
        <div>
          <div className="ws-name">
            <Avatar name={p.full_name} />
            <div className="t"><b>{p.full_name}</b><small>{[p.org_name, p.email].filter(Boolean).join(' · ')}</small></div>
          </div>
          <span className="open-hint">Open <Icon.out /></span>
        </div>
        <div onClick={e => e.stopPropagation()}><StageChip stage={p.stage} stages={STAGES} onPick={s => moveStage(p, s)} /></div>
        <div className="opt" onClick={e => e.stopPropagation()}><OwnerPicker ownerId={p.owner_id} team={team} onPick={o => setOwner(p, o)} /></div>
        <div onClick={e => e.stopPropagation()}><DateChip day={p.next_follow_up} today={today} onPick={d => setFollow(p, d)} muteWhenDone={!isOpenStage(p.stage)} /></div>
        <div className="opt"><Fresh iso={p.last_touched_at} today={today} /><span className="ws-muted">{sinceWords(p.last_touched_at, today)}</span></div>
        <div className="opt"><span className={`ws-muted`} title="Days in this stage">{age === null ? '—' : age === 0 ? 'Today' : `${age} day${age === 1 ? '' : 's'}`}</span></div>
        <div className="opt"><span className="ws-tag">{sourceLabel(p.source)}</span></div>
      </div>
    );
  };

  const renderQuick = (group: string) => {
    if (adding !== group) return (
      <div className="ws-quick"><button className="go" onClick={() => setAdding(group)}>+ Add a lead</button></div>
    );
    return (
      <div className="ws-quick">
        <form onSubmit={async e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const full_name = String(f.get('n') ?? '').trim(), email = String(f.get('e') ?? '').trim().toLowerCase();
          const org_name = String(f.get('o') ?? '').trim() || null, source = String(f.get('s') ?? 'linkedin');
          if (!full_name || !email.includes('@')) { toast.bad('A name and an email, please.'); return; }
          const form = e.currentTarget;
          try {
            const r = await fetch('/api/admin/prospects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ full_name, email, org_name, source }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { toast.bad(d.error ?? 'That did not save.'); return; }
            const now = new Date().toISOString();
            const stage: ProspectStage = group === 'conversation' ? 'booked' : 'new';
            const lead: Prospect = { id: d.id || `new-${now}`, full_name, email, org_name, source: source as any, call_at: null, stage, note: null, lost_reason: null,
              pending_id: null, next_follow_up: addDays(today, 1), last_touched_at: null, owner_id: me, website: null, created_at: now, updated_at: now, stage_changed_at: now };
            setRows(rs => [lead, ...rs]);
            if (d.id) { send('PATCH', { id: d.id, owner_id: me, next_follow_up: lead.next_follow_up, ...(stage !== 'new' ? { stage } : {}) }); }
            toast.saved(`${full_name} added, yours, follow up tomorrow`);
            form.reset(); (form.elements.namedItem('n') as HTMLInputElement)?.focus();
          } catch { toast.bad('No connection.'); }
        }}>
          <input name="n" placeholder="Full name" autoFocus aria-label="Full name" />
          <input name="e" type="email" placeholder="Email" aria-label="Email" />
          <input name="o" placeholder="Company" aria-label="Company" />
          <select name="s" defaultValue="linkedin" aria-label="Source">{PROSPECT_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <button className="btn sm solid">Add</button>
          <button type="button" className="btn sm" onClick={() => setAdding(null)}>Done</button>
        </form>
      </div>
    );
  };

  return (
    <div className={`ws ws-x${sel.size ? ' selecting' : ''}`} style={{ ['--cols' as any]: COLS }}>
      <div className="ws-bar">
        <div className="ws-title"><h3>Leads</h3><span className="ws-count">{counts.all} open</span></div>
        <div className="ws-tools">
          <label className="ws-search"><Icon.search />
            <input ref={search} type="search" placeholder="Search leads" value={q} onChange={e => setQ(e.target.value)} aria-label="Search leads" />
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
            trigger={<><Icon.sort />{sort ? { name: 'Name', stage: 'Stage', follow: 'Follow-up', touched: 'Last touch', age: 'Time in stage', owner: 'Owner' }[sort.key] : 'Sort'}</>}>
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
          <div className="ws-seg" role="group" aria-label="Layout">
            <button className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')} aria-pressed={layout === 'list'}><Icon.list />List</button>
            <button className={layout === 'board' ? 'on' : ''} onClick={() => setLayout('board')} aria-pressed={layout === 'board'}><Icon.board />Board</button>
          </div>
          {calendarOn && <button className="ws-tbtn" onClick={pull} disabled={pulling}><Icon.cal />{pulling ? 'Reading…' : 'Import'}</button>}
          <button className="btn sm solid" onClick={() => { setLayout('list'); setView('all'); setClosed(c => ({ ...c, leads: false })); setAdding('leads'); }}><Icon.plus />&nbsp;Add lead</button>
        </div>
        <div className="ws-views" role="tablist" aria-label="Saved views">
          {views.map(v => (
            <button key={v.key} role="tab" aria-selected={view === v.key} className={`ws-view${view === v.key ? ' on' : ''}${v.warn ? ' warn' : ''}`} onClick={() => setView(v.key)}>
              {v.label}<span className="n">{v.n}</span>
            </button>
          ))}
        </div>
      </div>

      {layout === 'list' ? (
        <div className="ws-list" role="grid" aria-label="Leads">
          <div className="ws-head" role="row">
            <div />
            <div>{head('name', 'Lead')}</div><div>{head('stage', 'Stage')}</div><div>{head('owner', 'Owner')}</div>
            <div>{head('follow', 'Follow-up')}</div><div>{head('touched', 'Last touch')}</div><div>{head('age', 'In stage')}</div><div>Source</div>
          </div>
          {STAGE_GROUPS.map(g => {
            const list = shown.filter(p => stageGroup(p.stage) === g.key);
            if (view !== 'all' && !list.length) return null;
            const isClosed = !!closed[g.key] && !q && view === 'all';
            const accent = stageColor(PROSPECT_STAGES.find(s => s.group === g.key)!.key);
            return (
              <section key={g.key} className={`ws-sec${isClosed ? ' closed' : ''}`}>
                <div className="ws-sec-head" onClick={() => setClosed(c => ({ ...c, [g.key]: !c[g.key] }))} role="button" aria-expanded={!isClosed}>
                  <span className="chev"><Icon.chev /></span><span className="sw" style={{ background: accent }} />
                  <h4>{g.label}</h4><span className="cnt">{list.length}</span>
                  {g.key !== 'decided' && <button className="add" onClick={e => { e.stopPropagation(); setClosed(c => ({ ...c, [g.key]: false })); setAdding(g.key); }}>+ Add</button>}
                </div>
                <div className="ws-sec-body">
                  {list.map(p => renderRow(p))}
                  {!list.length && <div className="ws-empty">{q || filters ? 'Nothing matches.' : g.key === 'leads' ? 'No new leads. Add one, or import from the calendar.' : 'Nobody here yet.'}</div>}
                  {g.key !== 'decided' && renderQuick(g.key)}
                </div>
              </section>
            );
          })}
          {!shown.length && view !== 'all' && <div className="ws-none"><h4>All clear</h4><p className="small">Nothing in this view right now.</p></div>}
        </div>
      ) : (
        <div className="ws-board" aria-label="Stages">
          {STAGES.map(s => {
            const list = shown.filter(p => p.stage === s.key);
            return (
              <div key={s.key} className={`ws-col${drag?.over === s.key ? ' drop' : ''}`}
                onDragOver={e => { e.preventDefault(); if (drag && drag.over !== s.key) setDrag({ ...drag, over: s.key }); }}
                onDragLeave={() => drag && setDrag({ ...drag, over: null })}
                onDrop={e => { e.preventDefault(); const p = rows.find(r => r.id === drag?.id); setDrag(null); if (p && p.stage !== s.key) moveStage(p, s.key); }}>
                <div className="ws-col-head"><span className="sw" style={{ background: s.color }} /><h5>{s.label}</h5><span className="cnt">{list.length}</span></div>
                <div className="ws-col-body">
                  {list.map(p => {
                    const w = p.next_follow_up && isOpenStage(p.stage) ? (dayDiff(today, p.next_follow_up)) : null;
                    return (
                      <div key={p.id} className={`ws-card${drag?.id === p.id ? ' dragging' : ''}`} draggable
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDrag({ id: p.id, over: null }); }}
                        onDragEnd={() => setDrag(null)} onClick={() => setPanel(p.id)} data-row={p.id}>
                        <div className="top"><Avatar name={p.full_name} size="sm" /><div style={{ minWidth: 0 }}><b>{p.full_name}</b><small>{p.org_name ?? p.email}</small></div></div>
                        <div className="meta">
                          <Fresh iso={p.last_touched_at} today={today} />
                          {w !== null ? <span className={w < 0 ? 'over' : w === 0 ? 'today' : ''}><Icon.cal /> {w < 0 ? `${-w}d late` : w === 0 ? 'Today' : w === 1 ? 'Tomorrow' : `In ${w}d`}</span>
                            : <span>{sinceWords(p.last_touched_at, today)}</span>}
                          <Avatar name={nameOf(p.owner_id)} size="xs" />
                        </div>
                      </div>
                    );
                  })}
                  {!list.length && <div className="ws-faint" style={{ padding: '14px 6px', fontSize: 12.5 }}>Drop a lead here</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="ws-keys" aria-hidden="true">
        <span><kbd>/</kbd>search</span><span><kbd>n</kbd>new lead</span><span><kbd>j</kbd><kbd>k</kbd>move</span>
        <span><kbd>Enter</kbd>open</span><span><kbd>x</kbd>select</span><span><kbd>b</kbd>board or list</span><span><kbd>Esc</kbd>close</span>
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
  useEffect(() => { setRefresh(r => r + 1); }, [p.stage, p.owner_id, p.next_follow_up]);

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
          <button className={`ws-chip${p.stage === 'won' ? ' soon' : ''}`} onClick={() => p.stage !== 'won' && onStage('won')}><Icon.star />Signed</button>
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
