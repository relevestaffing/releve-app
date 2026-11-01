'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ORIGINS, PRIORITIES, googleCalendarLink, type Priority, type Task } from '@/lib/work-public';
import {
  TASK_STATUSES, addDays, daysFrom, statusLabel, todayIn,
  type TaskComment, type TaskFile, type TaskStatus
} from '@/lib/experience-public';
import { saving, toast } from './Toast';
import Portal from './Portal';
import { fmtShortDay, fmtWhen } from '@/lib/words';
import './experience.css';

/* The task board.
   --------------
   One list, read at a glance, and one panel that opens beside it with
   everything about a task: what it is, the files on it, the conversation,
   and the one action that moves it on. Built for an executive handing work
   to one person, not a team running a project:

   - the executive sees whether the task was seen, when it is due, and when
     it is ready for review; accepting or sending back is one tap
   - the talent sees what is on their plate today, acknowledges by opening
     the list, asks a question from the task itself, and finishes into review
   - overdue sits at the top for both, and Relève's nudges run on their own

   The board keeps the data; TaskPanel renders the open task from it. */

type TaskX = Task & { status?: TaskStatus };
type Summary = Record<string, { count: number; lastBy: string; question: boolean }>;
type Files = Record<string, TaskFile[]>;
type Side = 'client' | 'talent' | 'admin';

const PRI_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function useViewerTz(profileTz?: string | null): string | null {
  const [tz, setTz] = useState<string | null>(profileTz ?? null);
  useEffect(() => {
    if (profileTz) return;
    try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || null); } catch { /* local default */ }
  }, [profileTz]);
  return tz;
}

type Group = { key: string; label: string; tasks: TaskX[]; tone?: 'late' | 'warn' | 'review' };

/* Overdue first regardless of priority; then what needs this reader's
   answer; then by date. Inside each bucket, priority breaks the tie. */
function groupTasks(tasks: TaskX[], today: string, side: Side): Group[] {
  const weekOut = addDays(today, 7);
  const b = {
    late: [] as TaskX[], review: [] as TaskX[], waiting: [] as TaskX[],
    today: [] as TaskX[], week: [] as TaskX[], later: [] as TaskX[], none: [] as TaskX[]
  };
  for (const t of tasks) {
    const st = t.status ?? 'todo';
    if (st === 'review') b.review.push(t);
    else if (st === 'waiting') b.waiting.push(t);
    else if (t.due_on && t.due_on < today) b.late.push(t);
    else if (!t.due_on) b.none.push(t);
    else if (t.due_on === today) b.today.push(t);
    else if (t.due_on <= weekOut) b.week.push(t);
    else b.later.push(t);
  }
  const byPriority = (a: TaskX, c: TaskX) =>
    PRI_ORDER[a.priority] - PRI_ORDER[c.priority] || (a.due_on ?? '9999').localeCompare(c.due_on ?? '9999');
  Object.values(b).forEach(g => g.sort(byPriority));
  return [
    { key: 'late', label: 'Overdue', tasks: b.late, tone: 'late' as const },
    { key: 'review', label: side === 'client' ? 'Ready for your review' : side === 'admin' ? 'Awaiting the executive' : 'Finished, awaiting review', tasks: b.review, tone: 'review' as const },
    { key: 'waiting', label: side === 'client' ? 'Waiting on you' : 'Waiting on the executive', tasks: b.waiting, tone: 'warn' as const },
    { key: 'today', label: 'Due today', tasks: b.today },
    { key: 'week', label: 'This week', tasks: b.week },
    { key: 'later', label: 'Later', tasks: b.later },
    { key: 'none', label: 'No date', tasks: b.none }
  ].filter(g => g.tasks.length > 0);
}

function dueLabel(d: string | null, today: string) {
  if (!d) return null;
  const days = daysFrom(today, d);
  const due = new Date(d + 'T00:00:00Z');
  if (days < 0) return { text: days === -1 ? 'Due yesterday' : `${-days} days late`, tone: 'late' };
  if (days === 0) return { text: 'Due today', tone: 'now' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'now' };
  if (days <= 7) return { text: due.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }), tone: '' };
  return { text: fmtShortDay(d), tone: '' };
}

const kb = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function TaskBoard({ placementId, me, side, counterpart, limit, seeAllHref, tz: profileTz }: {
  placementId: string; me: string; side: Side; counterpart: string;
  limit?: number; seeAllHref?: string; tz?: string | null;
}) {
  const [tasks, setTasks] = useState<TaskX[] | null>(null);
  const [summary, setSummary] = useState<Summary>({});
  const [files, setFiles] = useState<Files>({});
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const tz = useViewerTz(profileTz);
  const today = useMemo(() => todayIn(tz), [tz]);
  const seenOnce = useRef(false);

  async function load() {
    setFailed(false);
    try {
      const [r, s, f] = await Promise.all([
        fetch(`/api/tasks?placement=${placementId}`, { cache: 'no-store' }),
        fetch(`/api/tasks/comments?placement=${placementId}`, { cache: 'no-store' }).catch(() => null),
        fetch(`/api/tasks/files?placement=${placementId}`, { cache: 'no-store' }).catch(() => null)
      ]);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const list: TaskX[] = d.tasks ?? [];
      setTasks(list);
      if (s && s.ok) setSummary((await s.json()).summary ?? {});
      if (f && f.ok) setFiles((await f.json()).files ?? {});
      /* Opening the list is the acknowledgment. Once per visit. */
      if (side === 'talent' && !seenOnce.current) {
        seenOnce.current = true;
        const unseen = list.filter(t => !t.done && !t.seen_at && t.created_by !== me).map(t => t.id);
        if (unseen.length) fetch('/api/tasks/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: unseen }) }).catch(() => null);
      }
    } catch { setFailed(true); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [placementId]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
    /* eslint-disable-next-line */
  }, [placementId]);
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const ok = await saving(() => fetch('/api/tasks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        placement_id: placementId,
        title: f.get('title'), detail: f.get('detail'),
        priority: f.get('priority'), due_on: f.get('due_on'),
        due_time: f.get('due_time') || null, repeat_weekly: f.get('repeat_weekly') === 'on',
        origin: f.get('origin'), origin_note: f.get('origin_note')
      })
    }), side === 'client' ? `Assigned to ${counterpart}` : 'Added');
    setBusy(false);
    if (ok) { form.reset(); setComposing(false); load(); }
  }

  async function patch(t: TaskX, body: Record<string, unknown>, word?: string): Promise<boolean> {
    try {
      const res = await fetch('/api/tasks/item', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: t.id, ...body })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.bad(d.error ?? 'That task did not update.');
        load();
        return false;
      }
      if (word) toast.saved(word);
      return true;
    } catch {
      toast.bad('No connection, so nothing was saved.');
      load();
      return false;
    }
  }

  /* The tick: for a talent finishing someone else's task, this is "send for
     review"; for everyone else it closes the task. The server decides. */
  async function finish(t: TaskX) {
    if (toggling) return;
    setToggling(t.id);
    const toReview = side === 'talent' && t.created_by !== me && t.status !== 'review';
    setTasks(list => list!.map(x => x.id === t.id
      ? (toReview ? { ...x, status: 'review' } : { ...x, done: true, status: 'done' }) : x));
    const ok = await patch(t, { status: 'done' }, toReview ? `Sent to ${counterpart} for review` : 'Done');
    if (ok) load();
    setToggling(null);
  }
  async function reopen(t: TaskX) {
    if (toggling) return;
    setToggling(t.id);
    setTasks(list => list!.map(x => x.id === t.id ? { ...x, done: false, status: 'todo' } : x));
    const ok = await patch(t, { status: 'todo' }, 'Back on the list');
    if (ok) load();
    setToggling(null);
  }
  async function setStatus(t: TaskX, status: TaskStatus) {
    setTasks(list => list!.map(x => x.id === t.id ? { ...x, status, done: status === 'done' } : x));
    const ok = await patch(t, { status }, status === 'done' ? 'Done' : 'Updated');
    if (ok) load();
  }
  async function sendBack(t: TaskX, note: string) {
    try {
      const res = await fetch('/api/tasks/item', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, action: 'send_back', note }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.bad(d.error ?? 'That did not go back.'); return false; }
      toast.saved(`Sent back to ${counterpart}`); load(); return true;
    } catch { toast.bad('No connection, so nothing was saved.'); return false; }
  }
  async function remove(t: TaskX) {
    const ok = await saving(() => fetch(`/api/tasks?id=${t.id}`, { method: 'DELETE' }), 'Task removed');
    if (ok) { setOpenId(null); load(); }
  }

  if (failed) return (
    <div className="card">
      <div className="empty"><span className="tick" />
        <p className="small">{side === 'client' ? `${counterpart}'s tasks did not load.` : 'Your tasks did not load.'}</p>
        <button className="btn sm ghost" onClick={load}>Try again</button>
      </div>
    </div>
  );
  if (!tasks) return <div className="card"><div className="empty"><span className="tick" /><p className="small">Loading…</p></div></div>;

  const live = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  const groups = groupTasks(live, today, side);
  const truncated = limit != null && live.length > limit;
  const waitingOnClient = live.filter(t => t.status === 'waiting').length;
  const inReview = live.filter(t => t.status === 'review').length;
  const overdue = live.filter(t => t.due_on && t.due_on < today && t.status !== 'review' && t.status !== 'waiting').length;

  const visibleGroups: Group[] = [];
  if (limit != null) {
    let shown = 0;
    for (const g of groups) {
      if (shown >= limit) break;
      const slice = g.tasks.slice(0, limit - shown);
      visibleGroups.push({ ...g, tasks: slice });
      shown += slice.length;
    }
  } else visibleGroups.push(...groups);

  const canEdit = (t: TaskX) => t.created_by === me || side === 'client' || side === 'admin';
  const openTask = openId ? tasks.find(t => t.id === openId) ?? null : null;

  return (
    <>
      <div className="card tb">
        <div className="card-head tb-head">
          <h3>{side === 'client' ? 'What you have handed over' : side === 'admin' ? 'The task list' : 'Your work'}</h3>
          <span className="row tb-pills">
            {overdue > 0 && <span className="pill crit"><span className="dot" />{overdue} overdue</span>}
            {side === 'client' && inReview > 0 && <span className="pill good"><span className="dot" />{inReview} to review</span>}
            {side === 'client' && waitingOnClient > 0 && <span className="pill warn"><span className="dot" />{waitingOnClient} waiting on you</span>}
            <span className="pill">{live.length} open</span>
          </span>
        </div>

        {!composing ? (
          <button className="tb-add" onClick={() => setComposing(true)}>
            <span className="tb-add-plus" aria-hidden="true">+</span>
            {side === 'client' ? `Assign something to ${counterpart}` : 'Add a task'}
          </button>
        ) : (
          <form onSubmit={add} className="task-form tb-compose">
            <div className="ff"><label htmlFor={`tf-title-${placementId}`}>What needs doing</label>
              <input id={`tf-title-${placementId}`} name="title" required autoFocus placeholder="Rebuild the board pack for Thursday" /></div>
            <div className="ff"><label htmlFor={`tf-detail-${placementId}`}>Detail <span className="muted">(what good looks like, where things are, who has seen it before)</span></label>
              <textarea id={`tf-detail-${placementId}`} name="detail" rows={3}
                placeholder="The numbers come from the Stripe dashboard. Last month's version is in Drive under Board. One page, plain English." /></div>
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label htmlFor={`tf-pri-${placementId}`}>Priority</label>
                <select id={`tf-pri-${placementId}`} name="priority" defaultValue="normal">
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select></div>
              <div className="ff"><label htmlFor={`tf-due-${placementId}`}>Due</label>
                <input id={`tf-due-${placementId}`} type="date" name="due_on" min={today} /></div>
            </div>
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label htmlFor={`tf-time-${placementId}`}>At a time <span className="muted">(optional)</span></label>
                <input id={`tf-time-${placementId}`} type="time" name="due_time" step="900" /></div>
              <label className="log-share" style={{ alignSelf: 'end', marginBottom: 14 }}>
                <input type="checkbox" name="repeat_weekly" />
                <span>Repeats every week</span>
              </label>
            </div>
            {side !== 'client' && (
              <div className="grid-2" style={{ gap: 14 }}>
                <div className="ff"><label htmlFor={`tf-origin-${placementId}`}>Where it came from</label>
                  <select id={`tf-origin-${placementId}`} name="origin" defaultValue="self">
                    {ORIGINS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select></div>
                <div className="ff"><label htmlFor={`tf-on-${placementId}`}>Which one</label>
                  <input id={`tf-on-${placementId}`} name="origin_note" placeholder="Tuesday board call" /></div>
              </div>
            )}
            <p className="xs muted" style={{ margin: '-4px 0 10px' }}>Files can be attached once the task is on the list.</p>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : side === 'client' ? `Assign to ${counterpart}` : 'Add to the list'}</button>
              <button type="button" className="btn ghost sm" onClick={() => setComposing(false)}>Cancel</button>
            </div>
          </form>
        )}

        {live.length === 0 ? (
          <div className="empty" style={{ paddingTop: 10 }}><span className="tick" />
            <p className="small">
              {side === 'client'
                ? `Nothing on ${counterpart}'s list yet. The first week goes best with three small, finishable things.`
                : 'Nothing open. Anything you pick up yourself can go on here too.'}
            </p>
          </div>
        ) : (
          <ul className="tb-list">
            {visibleGroups.flatMap(g => [
              <li key={`h-${g.key}`} className={`tb-group ${g.tone ?? ''}`}>{g.label}<span className="tb-count">{g.tasks.length}</span></li>,
              ...g.tasks.map(t => (
                <TaskLine key={t.id} t={t} me={me} side={side} counterpart={counterpart} today={today} tz={tz}
                  summary={summary[t.id]} fileCount={(files[t.id] ?? []).length}
                  toggling={toggling === t.id} open={openId === t.id}
                  onOpen={() => setOpenId(openId === t.id ? null : t.id)}
                  onFinish={() => finish(t)} />
              ))
            ])}
          </ul>
        )}
        {truncated && seeAllHref && (
          <a href={seeAllHref} className="btn sm ghost" style={{ marginTop: 10 }}>See all {live.length} open tasks →</a>
        )}
      </div>

      {done.length > 0 && (
        <div className="card tb">
          <div className="card-head">
            <h3>Finished</h3>
            <button className="btn ghost sm" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : `Show ${done.length}`}</button>
          </div>
          {showDone && (
            <ul className="tb-list done">
              {done.map(t => (
                <li key={t.id} className="tb-row done">
                  <button disabled={toggling === t.id} className="tb-check on" onClick={() => reopen(t)} aria-label={`Reopen ${t.title}`}>✓</button>
                  <button className="tb-main" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                    <span className="tb-title">{t.title}</span>
                    <span className="tb-sub">Done{t.done_by ? (t.done_by === me ? ' by you' : ` by ${counterpart}`) : ''}{t.done_at ? `, ${fmtWhen(t.done_at, tz)}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {openTask && (
        <TaskPanel t={openTask} me={me} side={side} counterpart={counterpart} today={today} tz={tz}
          files={files[openTask.id] ?? []} canEdit={canEdit(openTask)}
          onClose={() => setOpenId(null)} onChanged={load}
          onFinish={() => finish(openTask)} onReopen={() => reopen(openTask)}
          onStatus={s => setStatus(openTask, s)} onSendBack={note => sendBack(openTask, note)}
          onRemove={() => remove(openTask)}
          onEdit={async body => { const ok = await patch(openTask, body, 'Saved'); if (ok) load(); return ok; }} />
      )}
    </>
  );
}

/* One line in the list: tick, title, the two or three things worth seeing
   before opening it. The whole line opens the panel. */
function TaskLine({ t, me, side, counterpart, today, tz, summary, fileCount, toggling, open, onOpen, onFinish }: {
  t: TaskX; me: string; side: Side; counterpart: string; today: string; tz: string | null;
  summary?: { count: number; lastBy: string; question: boolean }; fileCount: number;
  toggling: boolean; open: boolean; onOpen: () => void; onFinish: () => void;
}) {
  const due = dueLabel(t.due_on, today);
  const status: TaskStatus = t.status ?? 'todo';
  const theyAsked = !!summary?.question && summary.lastBy !== me;
  const mine = t.created_by === me;
  const seenLine = side === 'client' && mine
    ? (t.seen_at ? `Seen ${fmtWhen(t.seen_at, tz)}` : 'Not seen yet')
    : side === 'admin' && !mine && t.seen_at ? `Seen ${fmtWhen(t.seen_at, tz)}` : null;
  return (
    <li className={`tb-row${open ? ' open' : ''}${status === 'review' ? ' review' : ''}`}>
      <button disabled={toggling || status === 'review'} className={`tb-check${status === 'review' ? ' half' : ''}`}
        onClick={onFinish} aria-label={status === 'review' ? `${t.title} is awaiting review` : `Mark ${t.title} finished`} />
      <button className="tb-main" onClick={onOpen} aria-expanded={open}>
        <span className="tb-titlerow">
          {(t.priority === 'urgent' || t.priority === 'high') && <span className={`pri ${t.priority}`}>{t.priority}</span>}
          <span className="tb-title">{t.title}</span>
        </span>
        <span className="tb-sub">
          {due && <span className={`due ${due.tone}`}>{due.text}{t.due_time ? ` · ${String(t.due_time).slice(0, 5)}` : ''}</span>}
          {status === 'in_progress' && <span>In progress</span>}
          {status === 'review' && <span className="tb-review">{side === 'client' ? 'Ready for your review' : 'Awaiting review'}</span>}
          {theyAsked && <span className="tb-q">{side === 'client' ? `${counterpart} asked a question` : side === 'admin' ? 'A question is waiting' : 'A question for you'}</span>}
          {seenLine && <span className="muted">{seenLine}</span>}
          {!mine && side !== 'admin' && <span className="muted">From {counterpart}</span>}
          {side === 'admin' && <span className="muted">{mine ? 'Added by Relève' : 'From the placement'}</span>}
        </span>
      </button>
      <span className="tb-marks" aria-hidden="true">
        {fileCount > 0 && <span className="tb-mark" title={`${fileCount} file${fileCount === 1 ? '' : 's'}`}>&#9741; {fileCount}</span>}
        {(summary?.count ?? 0) > 0 && <span className="tb-mark" title={`${summary!.count} comment${summary!.count === 1 ? '' : 's'}`}>&#9643; {summary!.count}</span>}
      </span>
    </li>
  );
}

/* Everything about one task, beside the list. */
function TaskPanel({ t, me, side, counterpart, today, tz, files, canEdit, onClose, onChanged, onFinish, onReopen, onStatus, onSendBack, onRemove, onEdit }: {
  t: TaskX; me: string; side: Side; counterpart: string; today: string; tz: string | null;
  files: TaskFile[]; canEdit: boolean;
  onClose: () => void; onChanged: () => void; onFinish: () => void; onReopen: () => void;
  onStatus: (s: TaskStatus) => void; onSendBack: (note: string) => Promise<boolean>; onRemove: () => void;
  onEdit: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const status: TaskStatus = t.status ?? 'todo';
  const due = dueLabel(t.due_on, today);
  const origin = ORIGINS.find(o => o.key === t.origin);
  const mine = t.created_by === me;
  const executiveSide = side === 'client' || side === 'admin';

  useEffect(() => { setEditing(false); setAsking(false); setSendingBack(false); setNote(''); setConfirmRemove(false); }, [t.id]);

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingEdit) return;
    const f = new FormData(e.currentTarget);
    setSavingEdit(true);
    const ok = await onEdit({
      title: f.get('title'), detail: f.get('detail'), priority: f.get('priority'), due_on: f.get('due_on'),
      due_time: f.get('due_time') || null, repeat_weekly: f.get('repeat_weekly') === 'on'
    });
    setSavingEdit(false);
    if (ok) setEditing(false);
  }

  async function upload(list: FileList | null) {
    if (!list || !list.length) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const fd = new FormData(); fd.append('task_id', t.id); fd.append('file', file);
      try {
        const r = await fetch('/api/tasks/files', { method: 'POST', body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) toast.bad(d.error ?? `${file.name} did not upload.`);
        else toast.saved(`${file.name} attached`);
      } catch { toast.bad('No connection. Nothing was uploaded.'); }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
    onChanged();
  }
  async function removeFile(f: TaskFile) {
    const r = await fetch(`/api/tasks/files?id=${f.id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); toast.bad(d.error ?? 'That file was not removed.'); return; }
    toast.saved('File removed'); onChanged();
  }

  return (
    <Portal>
    <div className="tb-panel-wrap" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="tb-panel" role="dialog" aria-label={t.title}>
        <div className="tb-panel-top">
          <span className="eyebrow">{t.done ? 'Finished' : statusLabel(status, side)}</span>
          <button className="tb-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {!editing ? (
          <>
            <h3 className="tb-panel-title">{t.title}</h3>
            {t.detail ? <p className="tb-panel-detail">{t.detail}</p> : <p className="tb-panel-detail muted">No detail was added.</p>}
          </>
        ) : (
          <form className="task-edit" onSubmit={saveEdit}>
            <label className="sr-only" htmlFor={`et-${t.id}`}>Title</label>
            <input id={`et-${t.id}`} name="title" defaultValue={t.title} required />
            <label className="sr-only" htmlFor={`ed-${t.id}`}>Detail</label>
            <textarea id={`ed-${t.id}`} name="detail" rows={4} defaultValue={t.detail ?? ''} placeholder="Detail" />
            <div className="grid-2" style={{ gap: 10 }}>
              <div><label className="xs muted" htmlFor={`ep-${t.id}`}>Priority</label>
                <select id={`ep-${t.id}`} name="priority" defaultValue={t.priority}>{PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
              <div><label className="xs muted" htmlFor={`edue-${t.id}`}>Due</label>
                <input id={`edue-${t.id}`} type="date" name="due_on" defaultValue={t.due_on ?? ''} /></div>
              <div><label className="xs muted" htmlFor={`etime-${t.id}`}>At a time</label>
                <input id={`etime-${t.id}`} type="time" name="due_time" step="900" defaultValue={(t.due_time ?? '').slice(0, 5)} /></div>
              <label className="log-share" style={{ alignSelf: 'end' }}>
                <input type="checkbox" name="repeat_weekly" defaultChecked={!!t.repeat_weekly} /><span>Repeats every week</span>
              </label>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn sm solid" disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn sm ghost" disabled={savingEdit} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        )}

        <dl className="tb-facts">
          <dt>Priority</dt><dd><span className={`pri ${t.priority}`}>{PRIORITIES.find(p => p.key === t.priority)?.label}</span></dd>
          <dt>Due</dt><dd>{due ? <span className={`due ${due.tone}`}>{due.text}{t.due_time ? ` at ${String(t.due_time).slice(0, 5)}` : ''}</span> : <span className="muted">No date</span>}{t.repeat_weekly ? <span className="muted"> · every week</span> : null}</dd>
          <dt>From</dt><dd>{mine ? 'You' : side === 'admin' ? 'The placement' : counterpart}{origin && origin.key !== 'self' ? <span className="muted"> · {origin.label}{t.origin_note ? `, ${t.origin_note}` : ''}</span> : null}</dd>
          {(executiveSide) && !mine && side === 'admin' ? null : (executiveSide && mine) ? (
            <><dt>Seen</dt><dd>{t.seen_at ? `${counterpart}, ${fmtWhen(t.seen_at, tz)}` : <span className="muted">Not opened by {counterpart} yet</span>}</dd></>
          ) : null}
          {t.review_note && !t.done && <><dt>Sent back</dt><dd>“{t.review_note}”</dd></>}
        </dl>

        {/* the one action that moves it on */}
        {!t.done && (
          <div className="tb-actions">
            {status === 'review' && executiveSide ? (
              !sendingBack ? (
                <>
                  <button className="btn sm solid" onClick={onFinish}>Accept, it is done</button>
                  <button className="btn sm ghost" onClick={() => setSendingBack(true)}>Send it back</button>
                </>
              ) : (
                <form className="tb-sendback" onSubmit={async e => { e.preventDefault(); if (await onSendBack(note)) { setSendingBack(false); setNote(''); } }}>
                  <label className="xs muted" htmlFor={`sb-${t.id}`}>What needs changing</label>
                  <textarea id={`sb-${t.id}`} rows={3} value={note} onChange={e => setNote(e.target.value)} required placeholder="One more pass on the numbers: use net revenue, not gross." />
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn sm solid" disabled={!note.trim()}>Send back to {counterpart}</button>
                    <button type="button" className="btn sm ghost" onClick={() => setSendingBack(false)}>Cancel</button>
                  </div>
                </form>
              )
            ) : status === 'review' ? (
              <p className="small muted" style={{ margin: 0 }}>Finished and with {counterpart} to review. You will hear when it is accepted or needs another pass.</p>
            ) : (
              <>
                <button className="btn sm solid" onClick={onFinish}>
                  {side === 'talent' && !mine ? 'Finished, send for review' : 'Mark it done'}
                </button>
                <select className={`task-status ${status}`} value={status} aria-label="Status" onChange={e => onStatus(e.target.value as TaskStatus)}>
                  {TASK_STATUSES.filter(s => s.key !== 'done' && s.key !== 'review').map(s => <option key={s.key} value={s.key}>{statusLabel(s.key, side)}</option>)}
                </select>
                {side === 'talent' && <button className="btn sm ghost" onClick={() => setAsking(a => !a)}>{asking ? 'Not now' : 'Ask a question'}</button>}
              </>
            )}
          </div>
        )}
        {t.done && <div className="tb-actions"><button className="btn sm ghost" onClick={onReopen}>Put it back on the list</button></div>}

        {/* files */}
        <div className="tb-section">
          <div className="tb-section-head"><span className="eyebrow">Files</span>
            {!t.done && (
              <>
                <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={e => upload(e.target.files)} />
                <button className="task-link" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? 'Uploading…' : '+ Attach a file'}</button>
              </>
            )}
          </div>
          {files.length === 0 ? (
            <p className="xs muted" style={{ margin: 0 }}>{side === 'talent' ? 'Nothing attached. Add the finished work here when it is ready.' : `Nothing attached. A document, a screenshot or last time's version saves ${counterpart} a round trip.`}</p>
          ) : (
            <ul className="tb-files">
              {files.map(f => (
                <li key={f.id}>
                  <a href={`/api/tasks/files?id=${f.id}`} target="_blank" rel="noopener">{f.file_name}</a>
                  <span className="xs muted">{kb(f.size_bytes)} · {f.uploaded_by === me ? 'you' : side === 'admin' ? 'the placement' : counterpart}, {fmtWhen(f.created_at, tz)}</span>
                  {(f.uploaded_by === me || side === 'admin') && !t.done && <button className="task-link" onClick={() => removeFile(f)}>Remove</button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* the conversation */}
        <div className="tb-section">
          <div className="tb-section-head"><span className="eyebrow">Conversation</span></div>
          <TaskTalk task={t} me={me} side={side} counterpart={counterpart} question={asking}
            onSent={() => { onChanged(); setAsking(false); }} />
        </div>

        <div className="tb-panel-foot">
          {canEdit && !t.done && <button className="task-link" onClick={() => setEditing(v => !v)}>{editing ? 'Close edit' : 'Edit the task'}</button>}
          {!t.done && googleCalendarLink(t) && <a className="task-link" href={googleCalendarLink(t)!} target="_blank" rel="noopener">Add to Google Calendar</a>}
          {mine && (confirmRemove
            ? <span className="row" style={{ gap: 6 }}><button className="btn sm solid" onClick={onRemove}>Remove it</button><button className="btn sm ghost" onClick={() => setConfirmRemove(false)}>Keep</button></span>
            : <button className="task-link danger" onClick={() => setConfirmRemove(true)}>Remove</button>)}
        </div>
      </aside>
    </div>
    </Portal>
  );
}

/* The conversation under one task. A question from the talent moves the
   task to "waiting on the executive" on the server, and tells them. */
function TaskTalk({ task, me, side, counterpart, question, onSent }: {
  task: TaskX; me: string; side: Side; counterpart: string; question: boolean; onSent: () => void;
}) {
  const [items, setItems] = useState<TaskComment[] | null>(null);
  const [sides, setSides] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  async function load() {
    try {
      const r = await fetch(`/api/tasks/comments?task=${task.id}`, { cache: 'no-store' });
      const d = r.ok ? await r.json() : {};
      setItems(d.comments ?? []);
      setSides(d.sides ?? {});
    } catch { setItems([]); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [task.id]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    setSending(true);
    const ok = await saving(() => fetch('/api/tasks/comments', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task_id: task.id, body, question })
    }), question ? `Question sent to ${counterpart}` : 'Added');
    setSending(false);
    if (ok) { form.reset(); load(); onSent(); }
  }

  return (
    <div className="task-thread tb-thread">
      {items === null ? <p className="xs muted">Loading…</p>
        : items.length === 0 ? <p className="xs muted" style={{ margin: '0 0 10px' }}>Nothing yet. Anything about this task goes here, so it stays with the task.</p>
        : items.map(c => (
          <div key={c.id} className={`c${c.is_question ? ' question' : ''}`}>
            <span className="who">{c.author_id === me ? 'You'
              : sides[c.author_id] === 'team' ? 'Relève'
              : side === 'admin' ? (sides[c.author_id] === 'client' ? 'Executive' : 'Talent')
              : counterpart} · {fmtWhen(c.created_at)}</span>
            <p>{c.body}</p>
          </div>
        ))}
      <form onSubmit={send}>
        <label className="sr-only" htmlFor={`tc-${task.id}`}>{question ? 'Your question' : 'Your comment'}</label>
        <textarea id={`tc-${task.id}`} name="body" rows={2} required
          placeholder={question ? `What do you need from ${counterpart} to move this on?` : side === 'client' ? `A note for ${counterpart}` : 'Add a comment'} />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm solid" disabled={sending}>{sending ? 'Sending…' : question ? 'Send the question' : 'Add'}</button>
        </div>
      </form>
    </div>
  );
}
