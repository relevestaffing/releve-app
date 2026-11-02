'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Icon, Menu, OwnerPicker, Panel, Sect, useKeys, cleanName, type Member } from './kit';
import { Activity } from './Activity';
import { toast } from '../Toast';

/* Executives and Talent in the same workspace as Leads (2 November 2026):
   saved views, search, sections that fold, a dense list with an owner you
   can change in place, and the same slide-in panel with the account, the
   things you can do, and the full history. The page hands over each row's
   cells and panel contents already rendered, so the existing editors (role
   brief, agreement, pay) keep working unchanged inside the panel. */

export type PersonRow = {
  id: string; name: string; sub: string; photo?: string | null; company?: string | null;
  section: string; stage: { label: string; color: string };
  cells: Record<string, React.ReactNode>; search: string; tags: string[];
  ownerId?: string | null; fullHref?: string | null;
  props: { k: string; v: React.ReactNode }[]; headline?: React.ReactNode;
  tabs?: { key: string; label: string; body: React.ReactNode }[];
};
export type Col = { key: string; label: string; width: string; opt?: boolean };

export default function PeopleWorkspace({ title, noun, rows, cols, sections, views, team, today, side, activityType, toolbar, openId, empty }: {
  title: string; noun: string; rows: PersonRow[]; cols: Col[]; sections: { key: string; label: string; color: string }[];
  views: { key: string; label: string; warn?: boolean }[]; team: Member[]; today: string;
  side?: 'client' | 'talent'; activityType: 'client' | 'talent'; toolbar?: React.ReactNode; openId?: string | null;
  empty: { title: string; text: string };
}) {
  const [owners, setOwners] = useState<Record<string, string | null>>(() => Object.fromEntries(rows.map(r => [r.id, r.ownerId ?? null])));
  useEffect(() => { setOwners(Object.fromEntries(rows.map(r => [r.id, r.ownerId ?? null]))); }, [rows]);
  const [view, setView] = useState(views[0]?.key ?? 'all');
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [panel, setPanel] = useState<string | null>(openId ?? null);
  const [focus, setFocus] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const search = useRef<HTMLInputElement>(null);
  const store = `ws-${activityType}`;

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(store) ?? '{}'); if (s.closed) setClosed(s.closed); } catch { /* */ } }, [store]);
  useEffect(() => { try { localStorage.setItem(store, JSON.stringify({ closed })); } catch { /* */ } }, [closed, store]);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (panel) u.searchParams.set('open', panel); else u.searchParams.delete('open');
    window.history.replaceState(null, '', u.toString());
  }, [panel]);
  useEffect(() => { setTab('overview'); }, [panel]);

  const counts = useMemo(() => Object.fromEntries(views.map(v => [v.key, v.key === 'all' ? rows.length : rows.filter(r => r.tags.includes(v.key)).length])), [rows, views]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => (view === 'all' || r.tags.includes(view)) && (!s || r.search.toLowerCase().includes(s)));
  }, [rows, view, q]);
  const flat = useMemo(() => sections.flatMap(sec => (closed[sec.key] && !q && view === 'all' ? [] : shown.filter(r => r.section === sec.key))), [sections, shown, closed, q, view]);
  const current = rows.find(r => r.id === panel) ?? null;
  const idx = current ? flat.findIndex(r => r.id === current.id) : -1;

  async function setOwner(r: PersonRow, next: string | null) {
    const prev = owners[r.id] ?? null;
    setOwners(o => ({ ...o, [r.id]: next }));
    const save = async (v: string | null) => {
      try {
        const res = await fetch('/api/care', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'assign_account_manager', person_id: r.id, side, manager_id: v }) });
        return res.ok;
      } catch { return false; }
    };
    if (!(await save(next))) { setOwners(o => ({ ...o, [r.id]: prev })); toast.bad('That did not save. Please try again.'); return; }
    const who = team.find(t => t.user_id === next);
    toast.undo(next ? `${r.name} is now with ${cleanName(who?.name)}` : `${r.name} has no manager`, async () => {
      setOwners(o => ({ ...o, [r.id]: prev })); await save(prev);
    });
  }

  const moveFocus = (d: number) => {
    if (!flat.length) return;
    const i = flat.findIndex(r => r.id === (panel ?? focus));
    const n = Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + d));
    if (panel) setPanel(flat[n].id); else setFocus(flat[n].id);
    requestAnimationFrame(() => document.querySelector(`[data-row="${flat[n].id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  useKeys({
    '/': e => { e.preventDefault(); search.current?.focus(); },
    j: () => moveFocus(1), k: () => moveFocus(-1),
    ArrowDown: e => { if (!panel) { e.preventDefault(); moveFocus(1); } }, ArrowUp: e => { if (!panel) { e.preventDefault(); moveFocus(-1); } },
    Enter: () => { if (focus && !panel) setPanel(focus); },
    Escape: () => { if (!panel && q) setQ(''); }
  });

  const gridCols = `14px minmax(220px,2.2fr) ${cols.map(c => c.width).join(' ')}`;
  const ownerCol = side ? 'minmax(136px,.9fr)' : '';

  return (
    <div className="ws ws-x" style={{ ['--cols' as any]: `${gridCols} ${ownerCol}`.trim() }}>
      <div className="ws-bar">
        <div className="ws-title"><h3>{title}</h3><span className="ws-count">{rows.length} on file</span></div>
        <div className="ws-tools">
          <label className="ws-search"><Icon.search />
            <input ref={search} type="search" placeholder={`Search ${noun}`} value={q} onChange={e => setQ(e.target.value)} aria-label={`Search ${noun}`} />
            {!q && <kbd>/</kbd>}
          </label>
          {toolbar}
        </div>
        <div className="ws-views" role="tablist" aria-label="Saved views">
          {views.map(v => (
            <button key={v.key} role="tab" aria-selected={view === v.key} className={`ws-view${view === v.key ? ' on' : ''}${v.warn && counts[v.key] ? ' warn' : ''}`} onClick={() => setView(v.key)}>
              {v.label}<span className="n">{counts[v.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {!rows.length ? <div className="ws-none"><h4>{empty.title}</h4><p className="small">{empty.text}</p></div> : (
        <div className="ws-list" role="grid" aria-label={title}>
          <div className="ws-head" role="row">
            <div /><div>{noun === 'executives' ? 'Executive' : 'Talent'}</div>
            {cols.map(c => <div key={c.key}>{c.label}</div>)}
            {side && <div>{side === 'client' ? 'Success manager' : 'Talent manager'}</div>}
          </div>
          {sections.map(sec => {
            const list = shown.filter(r => r.section === sec.key);
            if (!list.length && (view !== 'all' || q)) return null;
            const isClosed = !!closed[sec.key] && !q && view === 'all';
            return (
              <section key={sec.key} className={`ws-sec${isClosed ? ' closed' : ''}`}>
                <div className="ws-sec-head" role="button" aria-expanded={!isClosed} onClick={() => setClosed(c => ({ ...c, [sec.key]: !c[sec.key] }))}>
                  <span className="chev"><Icon.chev /></span><span className="sw" style={{ background: sec.color }} />
                  <h4>{sec.label}</h4><span className="cnt">{list.length}</span>
                </div>
                <div className="ws-sec-body">
                  {list.map(r => (
                    <div key={r.id} data-row={r.id} role="row" className={`ws-row${focus === r.id ? ' focus' : ''}${panel === r.id ? ' open' : ''}`}
                      onClick={() => { setFocus(r.id); setPanel(r.id); }}>
                      <div className="ws-check" />
                      <div>
                        <div className="ws-name"><Avatar name={r.name} url={r.photo} />
                          <div className="t"><b>{r.name}</b><small>{r.sub}</small></div></div>
                        <span className="open-hint">Open <Icon.out /></span>
                      </div>
                      {cols.map(c => <div key={c.key} className={c.opt ? 'opt' : ''} onClick={e => { if ((e.target as HTMLElement).closest('button,a,input,select,label')) e.stopPropagation(); }}>{r.cells[c.key]}</div>)}
                      {side && <div className="opt" onClick={e => e.stopPropagation()}><OwnerPicker ownerId={owners[r.id] ?? null} team={team} onPick={o => setOwner(r, o)} label="Manager" /></div>}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {!shown.length && <div className="ws-none"><h4>Nothing matches</h4><p className="small">Try another view or search.</p></div>}
        </div>
      )}

      <div className="ws-keys" aria-hidden="true">
        <span><kbd>/</kbd>search</span><span><kbd>j</kbd><kbd>k</kbd>move</span><span><kbd>Enter</kbd>open</span><span><kbd>Esc</kbd>close</span>
      </div>

      {current && (
        <Panel crumb={`${noun === 'executives' ? 'Executive' : 'Talent'} · ${current.stage.label}`} onClose={() => setPanel(null)}
          fullHref={current.fullHref ?? undefined}
          onPrev={idx > 0 ? () => setPanel(flat[idx - 1].id) : null}
          onNext={idx >= 0 && idx < flat.length - 1 ? () => setPanel(flat[idx + 1].id) : null}>
          <div className="ws-p-hero">
            <Avatar name={current.name} url={current.photo} size="lg" />
            <div className="nm">
              <div style={{ fontFamily: "'Marcellus',serif", fontSize: 28, lineHeight: 1.2 }}>{current.name}</div>
              <div className="ws-muted" style={{ fontSize: 14, marginTop: 2 }}>{current.sub}</div>
            </div>
            {current.company && <Avatar name={current.company} company size="lg" title={current.company} />}
          </div>
          <div className="ws-step-say" style={{ marginBottom: 14 }}>
            <span className="ws-stage" style={{ background: current.stage.color, cursor: 'default' }}>{current.stage.label}</span>
            {current.headline && <span>{current.headline}</span>}
            {current.fullHref && <span className="end"><a className="ws-chip" href={current.fullHref} style={{ border: '1px solid rgba(53,68,58,.12)', background: '#fff' }}><Icon.out />Full record</a></span>}
          </div>
          {current.tabs && current.tabs.length > 0 && (
            <div className="ws-tabs" role="tablist">
              <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
              {current.tabs.map(t => <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
              <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>Activity</button>
            </div>
          )}
          {(tab === 'overview' || !current.tabs?.length) && (
            <>
              <dl className="ws-props">
                {side && <><dt><Icon.user />{side === 'client' ? 'Success manager' : 'Talent manager'}</dt>
                  <dd><OwnerPicker ownerId={owners[current.id] ?? null} team={team} onPick={o => setOwner(current, o)} label="Manager" /></dd></>}
                {current.props.map(({ k, v }) => <FragmentPair key={k} k={k} v={v} />)}
              </dl>
              {!current.tabs?.length && (
                <Sect title="Activity">
                  <Activity type={activityType} id={current.id} subjectName={current.name} team={team} today={today} />
                </Sect>
              )}
            </>
          )}
          {current.tabs?.map(t => tab === t.key ? <div key={t.key} className="detail-slot">{t.body}</div> : null)}
          {tab === 'activity' && <Activity type={activityType} id={current.id} subjectName={current.name} team={team} today={today} />}
        </Panel>
      )}
    </div>
  );
}

function FragmentPair({ k, v }: { k: string; v: React.ReactNode }) {
  return <><dt>{k}</dt><dd>{v}</dd></>;
}
