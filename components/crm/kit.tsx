'use client';
import './crm.css';
import { createContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from '../Toast';
import { createPortal } from 'react-dom';

/* The workspace kit (2 November 2026): the small parts every Directory view
   is built from, so Leads, Executives and Talent read as one product.
   Avatars and company marks, the popover menus (stage, owner, date), the
   freshness dot, the progress ring, and the icons. */

/* ---------- icons, drawn once ---------- */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  search: () => <svg viewBox="0 0 16 16" {...P}><circle cx="7" cy="7" r="4.6" /><path d="M10.5 10.5 14 14" /></svg>,
  list: () => <svg viewBox="0 0 16 16" {...P}><path d="M5 4h9M5 8h9M5 12h9" /><circle cx="2" cy="4" r=".6" /><circle cx="2" cy="8" r=".6" /><circle cx="2" cy="12" r=".6" /></svg>,
  board: () => <svg viewBox="0 0 16 16" {...P}><rect x="1.5" y="2" width="3.6" height="12" /><rect x="6.2" y="2" width="3.6" height="8" /><rect x="10.9" y="2" width="3.6" height="10" /></svg>,
  filter: () => <svg viewBox="0 0 16 16" {...P}><path d="M2 3.5h12M4.5 8h7M7 12.5h2" /></svg>,
  sort: () => <svg viewBox="0 0 16 16" {...P}><path d="M5 2.5v11M2.5 11 5 13.5 7.5 11M11 13.5v-11M8.5 5 11 2.5 13.5 5" /></svg>,
  plus: () => <svg viewBox="0 0 16 16" {...P}><path d="M8 3v10M3 8h10" /></svg>,
  close: () => <svg viewBox="0 0 16 16" {...P}><path d="m4 4 8 8M12 4l-8 8" /></svg>,
  up: () => <svg viewBox="0 0 16 16" {...P}><path d="m4 10 4-4 4 4" /></svg>,
  down: () => <svg viewBox="0 0 16 16" {...P}><path d="m4 6 4 4 4-4" /></svg>,
  chev: () => <svg viewBox="0 0 16 16" {...P}><path d="m4 6 4 4 4-4" /></svg>,
  out: () => <svg viewBox="0 0 16 16" {...P}><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11 9.5v4H2.5V5h4" /></svg>,
  cal: () => <svg viewBox="0 0 16 16" {...P}><rect x="2" y="3" width="12" height="11" /><path d="M2 6.5h12M5 1.5v3M11 1.5v3" /></svg>,
  user: () => <svg viewBox="0 0 16 16" {...P}><circle cx="8" cy="5.5" r="2.8" /><path d="M2.5 14c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /></svg>,
  mail: () => <svg viewBox="0 0 16 16" {...P}><rect x="1.8" y="3.2" width="12.4" height="9.6" /><path d="m2 4 6 5 6-5" /></svg>,
  phone: () => <svg viewBox="0 0 16 16" {...P}><path d="M3 2.5h3l1.2 3-1.8 1.2a8 8 0 0 0 3.9 3.9l1.2-1.8 3 1.2v3c0 .6-.5 1-1 1C7.1 14 2 8.9 2 3.5c0-.5.4-1 1-1Z" /></svg>,
  note: () => <svg viewBox="0 0 16 16" {...P}><path d="M3 2.5h10v8l-3 3H3z" /><path d="M10 13.5v-3h3M5.5 6h5M5.5 8.5h3" /></svg>,
  chat: () => <svg viewBox="0 0 16 16" {...P}><path d="M2.5 3h11v8H6l-3.5 2.5z" /></svg>,
  meet: () => <svg viewBox="0 0 16 16" {...P}><circle cx="5.5" cy="6" r="2.2" /><circle cx="11" cy="6.5" r="1.8" /><path d="M1.8 13c.5-2.3 1.9-3.4 3.7-3.4s3.2 1.1 3.7 3.4M9.4 10.2c.5-.4 1-.6 1.6-.6 1.5 0 2.5.9 3 3" /></svg>,
  flag: () => <svg viewBox="0 0 16 16" {...P}><path d="M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8" /></svg>,
  link: () => <svg viewBox="0 0 16 16" {...P}><path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" /></svg>,
  bldg: () => <svg viewBox="0 0 16 16" {...P}><path d="M2.5 14V3h7v11M9.5 6.5h4V14M1.5 14h13M5 5.5h2M5 8h2M5 10.5h2" /></svg>,
  clock: () => <svg viewBox="0 0 16 16" {...P}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg>,
  spark: () => <svg viewBox="0 0 16 16" {...P}><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2 2M10.6 10.6l2 2M3.4 12.6l2-2M10.6 5.4l2-2" /></svg>,
  dot: () => <svg viewBox="0 0 16 16" {...P}><circle cx="8" cy="8" r="2.5" /></svg>,
  swap: () => <svg viewBox="0 0 16 16" {...P}><path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10L6 13" /></svg>,
  doc: () => <svg viewBox="0 0 16 16" {...P}><path d="M4 1.5h5.5L12.5 4.5V14.5H4z" /><path d="M9.5 1.5v3h3" /></svg>,
  star: () => <svg viewBox="0 0 16 16" {...P}><path d="m8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z" /></svg>
};

/* ---------- people and companies ---------- */
const TONES = ['#4E7A5C', '#6E8CA8', '#8A6DA3', '#B07A4F', '#3E6B6E', '#9C6B6B', '#5F7F3F', '#7A6F5A', '#4B6A8A', '#A0845A'];
export function toneFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
export function initials(name: string): string {
  const parts = (name || '').replace(/[^\p{L}\p{N}\s'&-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
export function Avatar({ name, url, size = '', company = false, title }: {
  name: string | null; url?: string | null; size?: '' | 'sm' | 'xs' | 'lg'; company?: boolean; title?: string;
}) {
  if (!name) {
    return <span className={`ws-av ws-none-av ${size}`} title={title ?? 'Unassigned'} aria-hidden="true"><Icon.user /></span>;
  }
  const bg = url ? undefined : `linear-gradient(160deg, ${toneFor(name)} 0%, color-mix(in srgb, ${toneFor(name)} 78%, #0E1612) 100%)`;
  return (
    <span className={`ws-av ${size} ${company ? 'co' : ''}`} title={title ?? name}
      style={{ background: bg, backgroundImage: url ? `url(${url})` : bg }} aria-hidden="true">
      {url ? null : initials(name)}
    </span>
  );
}

/* A team member's name, tidied: accounts without a display name show the
   readable part of their address. */
export function cleanName(name: string | null | undefined): string {
  if (!name) return 'Someone';
  if (!name.includes('@')) return name;
  const local = name.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return local ? local.replace(/\b\w/g, c => c.toUpperCase()) : name;
}
export type Member = { user_id: string; name: string };

/* ---------- dates, said the way a person would ---------- */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function dayDiff(a: string, b: string): number {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dueWords(day: string, today: string): { text: string; tone: 'over' | 'today' | 'soon' | '' } {
  const n = dayDiff(today, day);
  if (n === 0) return { text: 'Today', tone: 'today' };
  if (n === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (n === -1) return { text: 'Yesterday', tone: 'over' };
  if (n < 0) return { text: `${-n} days late`, tone: 'over' };
  const [y, m, d] = day.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  if (n < 7) return { text: wd, tone: 'soon' };
  return { text: `${MON[m - 1]} ${d}`, tone: '' };
}
export function sinceWords(iso: string | null | undefined, today: string): string {
  if (!iso) return 'Never';
  const n = dayDiff(iso.slice(0, 10), today);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n < 7) return `${n} days ago`;
  if (n < 14) return 'Last week';
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}
export function freshness(iso: string | null | undefined, today: string): 'g' | 'a' | 'r' | 'n' {
  if (!iso) return 'n';
  const n = dayDiff(iso.slice(0, 10), today);
  return n <= 3 ? 'g' : n <= 10 ? 'a' : 'r';
}
export function whenWords(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24 && d.getDate() === now.getDate()) return `${hrs} hr ago`;
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 1) return `Yesterday, ${t}`;
  if (days < 7) return `${WD[d.getDay()]}, ${t}`;
  return `${MON[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : ''}`;
}

/* ---------- a popover anchored to the thing that opened it ---------- */
export function Popover({ anchor, onClose, children, width = 240 }: {
  anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = box.current?.offsetHeight ?? 260;
      const below = window.innerHeight - r.bottom;
      const top = below < h + 12 && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: Math.max(8, top), left });
    };
    place();
    const raf = requestAnimationFrame(place);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('resize', onClose);
    window.addEventListener('keydown', onKey, true);
    const onScroll = (e: Event) => { if (box.current && e.target instanceof Node && box.current.contains(e.target)) return; onClose(); };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor, onClose, width]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="ws-pop-scrim" onMouseDown={e => { e.stopPropagation(); onClose(); }} />
      <div ref={box} className="ws-pop" role="menu" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
        onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>{children}</div>
    </>, document.body);
}

/* A button that opens a popover; the menu receives a close function. */
export function Menu({ trigger, children, width, className = 'ws-chip', label, title, style }: {
  trigger: React.ReactNode; children: (close: () => void) => React.ReactNode; width?: number;
  className?: string; label?: string; title?: string; style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" className={className} style={style} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={title}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>{trigger}</button>
      {open && <Popover anchor={ref.current} onClose={() => setOpen(false)} width={width}>{children(() => setOpen(false))}</Popover>}
    </>
  );
}

/* ---------- stage ---------- */
export type StageDef = { key: string; label: string; color: string };
export function StageChip({ stage, stages, onPick, readOnly = false }: {
  stage: string; stages: StageDef[]; onPick?: (s: string) => void; readOnly?: boolean;
}) {
  const s = stages.find(x => x.key === stage) ?? { key: stage, label: stage, color: '#6E8073' };
  if (readOnly || !onPick) return <span className="ws-stage" style={{ ['--c' as any]: s.color, cursor: 'default' }}>{s.label}</span>;
  return (
    <Menu className="ws-stage" style={{ ['--c' as any]: s.color }} label={`Stage: ${s.label}`} width={220}
      trigger={<><span>{s.label}</span><span className="car" aria-hidden="true">▾</span></>}>
      {close => (
        <>
          <div className="ttl">Move to</div>
          {stages.map(o => (
            <button key={o.key} className="ws-opt" role="menuitem" onClick={() => { close(); if (o.key !== stage) onPick(o.key); }}>
              <span className="sw" style={{ background: o.color }} />{o.label}{o.key === stage && <span className="ws-tk">✓</span>}
            </button>
          ))}
        </>
      )}
    </Menu>
  );
}

/* ---------- owner ---------- */
export function OwnerPicker({ ownerId, team, onPick, label = 'Owner', showName = true }: {
  ownerId: string | null; team: Member[]; onPick: (id: string | null) => void; label?: string; showName?: boolean;
}) {
  const [q, setQ] = useState('');
  const m = team.find(x => x.user_id === ownerId);
  const name = m ? cleanName(m.name) : null;
  return (
    <Menu label={`${label}: ${name ?? 'unassigned'}`} width={250} className={`ws-chip${name ? '' : ' ph'}`}
      trigger={<><Avatar name={name} size="xs" />{showName && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name ?? 'Unassigned'}</span>}</>}>
      {close => {
        const list = team.filter(t => cleanName(t.name).toLowerCase().includes(q.toLowerCase()));
        return (
          <>
            <div className="pad"><input type="search" autoFocus placeholder="Assign to…" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && list[0]) { close(); onPick(list[0].user_id); } }} /></div>
            {list.map(t => (
              <button key={t.user_id} className="ws-opt" onClick={() => { close(); if (t.user_id !== ownerId) onPick(t.user_id); }}>
                <Avatar name={cleanName(t.name)} size="sm" />{cleanName(t.name)}{t.user_id === ownerId && <span className="ws-tk">✓</span>}
              </button>
            ))}
            <hr />
            <button className="ws-opt" onClick={() => { close(); if (ownerId) onPick(null); }}>
              <Avatar name={null} size="sm" />Unassigned{!ownerId && <span className="ws-tk">✓</span>}
            </button>
          </>
        );
      }}
    </Menu>
  );
}

/* ---------- a date, picked the quick way ---------- */
export function DateChip({ day, today, onPick, placeholder = 'Set date', label = 'Follow-up', muteWhenDone = false }: {
  day: string | null; today: string; onPick: (d: string | null) => void; placeholder?: string; label?: string; muteWhenDone?: boolean;
}) {
  const w = day ? dueWords(day, today) : null;
  const tone = muteWhenDone ? '' : w?.tone ?? '';
  const nextMon = (() => { const [y, m, d] = today.split('-').map(Number); const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return addDays(today, ((8 - wd) % 7) || 7); })();
  const quick: [string, string][] = [['Today', today], ['Tomorrow', addDays(today, 1)], ['In 3 days', addDays(today, 3)], ['Next Monday', nextMon], ['In 2 weeks', addDays(today, 14)]];
  return (
    <Menu label={`${label}: ${w ? w.text : 'not set'}`} width={240} className={`ws-chip ${day ? tone : 'ph'}`}
      trigger={<><Icon.cal /><span>{w ? w.text : placeholder}</span></>}>
      {close => (
        <>
          <div className="ttl">{label}</div>
          {quick.map(([t, v]) => (
            <button key={t} className="ws-opt" onClick={() => { close(); onPick(v); }}>{t}<span className="hint">{dueWords(v, today).text === t ? '' : dueWords(v, today).text}</span></button>
          ))}
          <hr />
          <div className="pad"><input type="date" defaultValue={day ?? ''} aria-label="Pick a date"
            onChange={e => { if (e.target.value) { close(); onPick(e.target.value); } }} /></div>
          {day && <><hr /><button className="ws-opt" onClick={() => { close(); onPick(null); }}>Clear date</button></>}
        </>
      )}
    </Menu>
  );
}

/* ---------- small marks ---------- */
export function Fresh({ iso, today }: { iso: string | null | undefined; today: string }) {
  const f = freshness(iso, today);
  const t = f === 'g' ? 'Touched recently' : f === 'a' ? 'Getting quiet' : f === 'r' ? 'Gone quiet' : 'Never touched';
  return <span className={`ws-fresh ${f}`} title={t} aria-label={t} />;
}
export function Ring({ done, total, size = 22 }: { done: number; total: number; size?: number }) {
  const r = (size - 4) / 2, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <svg className="ws-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${done} of ${total}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(53,68,58,.12)" strokeWidth="2.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? '#4E7A5C' : '#B98A3E'} strokeWidth="2.5"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="butt" />
    </svg>
  );
}

/* ---------- keyboard ---------- */
export function useKeys(map: Record<string, (e: KeyboardEvent) => void>, on = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!on) return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing && e.key !== 'Escape') return;
      const fn = ref.current[e.key];
      if (fn) fn(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [on]);
}

/* ---------- the detail pane ----------
   Asana's task pane (2 November 2026): it opens beside the list without
   dimming or blocking it, so the list stays usable and clicking another row
   just swaps what the pane shows. A header with the main action on the left
   (Mark signed) and copy link, previous, next, full page and close on the
   right; the record scrolls; the comment box stays pinned at the bottom. */
export const PaneFoot = createContext<HTMLElement | null>(null);
export function Panel({ onClose, onPrev, onNext, crumb, fullHref, copyHref, lead, children, page = false }: {
  onClose?: () => void; onPrev?: (() => void) | null; onNext?: (() => void) | null; crumb: string;
  fullHref?: string; copyHref?: string; lead?: React.ReactNode; children: React.ReactNode; page?: boolean;
}) {
  const [foot, setFoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (page || !onClose) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { t.blur(); return; }
      if (document.querySelector('.ws-pop')) return;
      onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, page]);
  const copy = async () => {
    const url = window.location.origin + (copyHref ?? fullHref ?? window.location.pathname);
    try { await navigator.clipboard.writeText(url); toast.saved('Link copied'); } catch { toast.bad('Could not copy the link.'); }
  };
  const body = (
    <aside className={`ws-panel ws-x${page ? ' page' : ''}`} aria-label={crumb}>
      <div className="ws-p-top">
        {lead ?? <span className="crumb">{crumb}</span>}
        <span className="sp" />
        {(copyHref || fullHref) && <button className="ws-icon" onClick={copy} aria-label="Copy link" title="Copy link"><Icon.link /></button>}
        {!page && <button className="ws-icon" onClick={() => onPrev?.()} disabled={!onPrev} aria-label="Previous" title="Previous (k)"><Icon.up /></button>}
        {!page && <button className="ws-icon" onClick={() => onNext?.()} disabled={!onNext} aria-label="Next" title="Next (j)"><Icon.down /></button>}
        {!page && fullHref && <a className="ws-icon" href={fullHref} aria-label="Open full page" title="Open full page"><Icon.out /></a>}
        {!page && onClose && <button className="ws-icon" onClick={onClose} aria-label="Close" title="Close (Esc)"><Icon.close /></button>}
      </div>
      <PaneFoot.Provider value={foot}>
        <div className="ws-p-body">{children}</div>
      </PaneFoot.Provider>
      <div className="ws-p-foot" ref={setFoot} />
    </aside>
  );
  if (page) return body;
  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}

export function Sect({ title, children, right }: { title: string; children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <>
      <div className="ws-sect"><h4>{title}</h4><span className="line" />{right}</div>
      {children}
    </>
  );
}
