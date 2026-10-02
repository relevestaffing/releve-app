'use client';
import { useEffect, useMemo, useState } from 'react';
import { ORIGINS, PRIORITIES, type Priority, type Task } from '@/lib/work-public';
import {
  TASK_STATUSES, addDays, dayIn, daysFrom, statusLabel, todayIn,
  type TaskComment, type TaskStatus
} from '@/lib/experience-public';
import { saving, toast } from './Toast';
import './experience.css';

type TaskX = Task & { status?: TaskStatus };
type Summary = Record<string, { count: number; lastBy: string; question: boolean }>;
type Side = 'client' | 'talent' | 'admin';

const PRI_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/* The reader's timezone: the one on their profile when it is set, otherwise
   whatever their browser says. Grouping by a UTC date while labelling in
   local time put Thursday's tasks under "Due today" on a Wednesday evening
   in Los Angeles. */
function useViewerTz(profileTz?: string | null): string | null {
  const [tz, setTz] = useState<string | null>(profileTz ?? null);
  useEffect(() => {
    if (profileTz) return;
    try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || null); } catch { /* local default */ }
  }, [profileTz]);
  return tz;
}

/* Overdue first regardless of priority: a low-priority task three days late
   still needs to outrank a high-priority one due next month. Inside each
   bucket, priority breaks the tie. */
type Group = { label: string; tasks: TaskX[] };
function groupTasks(tasks: TaskX[], today: string): Group[] {
  const weekOut = addDays(today, 7);
  const buckets = { overdue: [] as TaskX[], today: [] as TaskX[], week: [] as TaskX[], later: [] as TaskX[], none: [] as TaskX[] };
  for (const t of tasks) {
    if (!t.due_on) buckets.none.push(t);
    else if (t.due_on < today) buckets.overdue.push(t);
    else if (t.due_on === today) buckets.today.push(t);
    else if (t.due_on <= weekOut) buckets.week.push(t);
    else buckets.later.push(t);
  }
  const byPriority = (a: TaskX, b: TaskX) =>
    PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999');
  Object.values(buckets).forEach(g => g.sort(byPriority));
  return [
    { label: 'Overdue', tasks: buckets.overdue },
    { label: 'Due today', tasks: buckets.today },
    { label: 'This week', tasks: buckets.week },
    { label: 'Later', tasks: buckets.later },
    { label: 'No date', tasks: buckets.none }
  ].filter(g => g.tasks.length > 0);
}

function dueLabel(d: string | null, today: string) {
  if (!d) return null;
  const days = daysFrom(today, d);
  const due = new Date(d + 'T00:00:00Z');
  if (days < 0) return { text: days === -1 ? 'Yesterday' : `${-days} days late`, tone: 'late' };
  if (days === 0) return { text: 'Today', tone: 'now' };
  if (days === 1) return { text: 'Tomorrow', tone: 'now' };
  if (days <= 7) return { text: due.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' }), tone: '' };
  return { text: due.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }), tone: '' };
}

export default function TaskBoard({ placementId, me, side, counterpart, limit, seeAllHref, tz: profileTz }: {
  placementId: string; me: string; side: Side; counterpart: string;
  /* Cap how many open tasks render before the list hands off to a link: the
     dashboard's glance view sets this; the full Tasks page shows everything. */
  limit?: number; seeAllHref?: string;
  /* The viewer's own timezone from their profile, when it is known. */
  tz?: string | null;
}) {
  const [tasks, setTasks] = useState<TaskX[] | null>(null);
  const [summary, setSummary] = useState<Summary>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const tz = useViewerTz(profileTz);
  const today = useMemo(() => todayIn(tz), [tz]);

  async function load() {
    setFailed(false);
    try {
      const [r, s] = await Promise.all([
        fetch(`/api/tasks?placement=${placementId}`, { cache: 'no-store' }),
        fetch(`/api/tasks/comments?placement=${placementId}`, { cache: 'no-store' }).catch(() => null)
      ]);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setTasks(d.tasks ?? []);
      if (s && s.ok) setSummary((await s.json()).summary ?? {});
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [placementId]);
  /* The other side's activity showed up only on a manual refresh. Coming
     back to the tab is the moment somebody expects to see what changed. */
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
    /* eslint-disable-next-line */
  }, [placementId]);

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
        origin: f.get('origin'), origin_note: f.get('origin_note')
      })
    }), side === 'client' ? 'Task assigned' : 'Task added');
    setBusy(false);
    if (ok) { form.reset(); setOpen(false); load(); }
  }

  /* Every change goes through /api/tasks/item, which reports a refusal as a
     refusal: a tick that row level security turned down used to look saved. */
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
      /* the connection dropped mid-request (common on a phone in Manila or
         Bogotá); without this the optimistic change would stay on screen
         while the server never heard. */
      toast.bad('Could not reach the server. Check your connection.');
      load();
      return false;
    }
  }

  async function toggle(t: TaskX) {
    if (toggling) return;
    setToggling(t.id);
    setTasks(list => list!.map(x => x.id === t.id
      ? { ...x, done: !x.done, status: !x.done ? 'done' : 'todo' } : x));
    const ok = await patch(t, { done: !t.done }, !t.done ? 'Done' : undefined);
    if (ok) load();
    setToggling(null);
  }

  async function setStatus(t: TaskX, status: TaskStatus) {
    setTasks(list => list!.map(x => x.id === t.id ? { ...x, status, done: status === 'done' } : x));
    const ok = await patch(t, { status }, status === 'done' ? 'Done' : 'Updated');
    if (ok) load();
  }

  const [confirmId, setConfirmId] = useState<string | null>(null);
  async function remove(t: TaskX) {
    if (confirmId !== t.id) { setConfirmId(t.id); return; }
    const ok = await saving(() => fetch(`/api/tasks?id=${t.id}`, { method: 'DELETE' }), 'Task removed');
    setConfirmId(null);
    if (ok) load();
  }

  if (failed) return (
    <div className="card">
      <div className="empty"><span className="tick" />
        <p className="small">{side === 'client' ? `${counterpart}'s tasks did not load.` : 'Your tasks did not load.'}</p>
        <button className="btn sm ghost" onClick={load}>Try again</button>
      </div>
    </div>
  );

  if (!tasks) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;

  const live = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  const groups = groupTasks(live, today);
  const truncated = limit != null && live.length > limit;
  const waitingOnClient = live.filter(t => t.status === 'waiting').length;

  const visibleGroups: Group[] = [];
  if (limit != null) {
    let shown = 0;
    for (const g of groups) {
      if (shown >= limit) break;
      const slice = g.tasks.slice(0, limit - shown);
      visibleGroups.push({ label: g.label, tasks: slice });
      shown += slice.length;
    }
  } else {
    visibleGroups.push(...groups);
  }

  /* Who may rewrite what a task says: whoever wrote it, the executive, or
     Relève. Moving it along (its status) is open to both sides. The same
     rule is enforced in the database. */
  const canEdit = (t: TaskX) => t.created_by === me || side === 'client' || side === 'admin';

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>{side === 'client' ? 'What you have handed over' : 'Your work'}</h3>
          <span className="row" style={{ gap: 8 }}>
            {side === 'client' && waitingOnClient > 0 && (
              <span className="pill warn"><span className="dot" />{waitingOnClient} waiting on you</span>
            )}
            <span className="pill">{live.length} open</span>
          </span>
        </div>

        {live.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">
              {side === 'client'
                ? `Nothing on ${counterpart}'s list. Add the first thing you want off your plate.`
                : 'Nothing open. Anything you pick up yourself can go on here too.'}
            </p>
          </div>
        ) : (
          <>
            <ul className="task-list">
              {visibleGroups.flatMap(g => [
                <li key={`h-${g.label}`} className="task-group">{g.label}</li>,
                ...g.tasks.map(t => (
                  <TaskRow key={t.id} t={t} me={me} side={side} counterpart={counterpart} today={today}
                    summary={summary[t.id]} toggling={toggling === t.id} busy={busy}
                    canEdit={canEdit(t)} confirming={confirmId === t.id}
                    onToggle={() => toggle(t)} onStatus={s => setStatus(t, s)}
                    onRemove={() => remove(t)} onKeep={() => setConfirmId(null)}
                    onSaved={load}
                    onEdit={async body => { const ok = await patch(t, body, 'Saved'); if (ok) load(); return ok; }} />
                ))
              ])}
            </ul>

            {truncated && seeAllHref && (
              <a href={seeAllHref} className="btn sm ghost" style={{ marginTop: 4, marginBottom: 4 }}>
                See all {live.length} open tasks →
              </a>
            )}
          </>
        )}

        {!open ? (
          <button className="btn solid" style={{ marginTop: 20 }} onClick={() => setOpen(true)}>
            {side === 'client' ? `Assign something to ${counterpart}` : 'Add a task'}
          </button>
        ) : (
          <form onSubmit={add} className="task-form">
            <div className="ff"><label htmlFor={`tf-title-${placementId}`}>What needs doing</label>
              <input id={`tf-title-${placementId}`} name="title" required autoFocus placeholder="Rebuild the board pack for Thursday" /></div>
            <div className="ff"><label htmlFor={`tf-detail-${placementId}`}>Detail <span className="muted">(optional, but it saves a round trip)</span></label>
              <textarea id={`tf-detail-${placementId}`} name="detail" rows={3}
                placeholder="Where the numbers come from, who has seen it before, what good looks like." /></div>
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label htmlFor={`tf-pri-${placementId}`}>Priority</label>
                <select id={`tf-pri-${placementId}`} name="priority" defaultValue="normal">
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select></div>
              <div className="ff"><label htmlFor={`tf-due-${placementId}`}>Due</label>
                <input id={`tf-due-${placementId}`} type="date" name="due_on" min={today} /></div>
            </div>
            {/* "Where did this come from" is a talent-side question: it is how they
               log a request that reached them by call, email or a check-in. */}
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
            <div className="row" style={{ gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Add to the list'}</button>
              <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {done.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>Finished</h3>
            <button className="btn ghost sm" onClick={() => setShowDone(!showDone)}>
              {showDone ? 'Hide' : `Show ${done.length}`}
            </button>
          </div>
          {showDone && (
            <ul className="task-list done">
              {done.map(t => (
                <li key={t.id} className="task">
                  <button disabled={toggling === t.id} className="task-check on" onClick={() => toggle(t)} aria-label={`Reopen ${t.title}`}>✓</button>
                  <div className="task-body">
                    <span className="task-title">{t.title}</span>
                    {/* Who finished it, and when. */}
                    <div className="task-meta xs">
                      <span className="muted">
                        Done{t.done_by ? (t.done_by === me ? ' by you' : ` by ${counterpart}`) : ''}
                        {t.done_at ? `, ${new Date(t.done_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: tz ?? undefined })}` : ''}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/* One open task: tick, status, edit, and its comments. */
function TaskRow({
  t, me, side, counterpart, today, summary, toggling, busy, canEdit, confirming,
  onToggle, onStatus, onRemove, onKeep, onEdit, onSaved
}: {
  t: TaskX; me: string; side: Side; counterpart: string; today: string;
  summary?: { count: number; lastBy: string; question: boolean };
  toggling: boolean; busy: boolean; canEdit: boolean; confirming: boolean;
  onToggle: () => void; onStatus: (s: TaskStatus) => void;
  onRemove: () => void; onKeep: () => void;
  onEdit: (body: Record<string, unknown>) => Promise<boolean>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [talk, setTalk] = useState<null | 'comment' | 'question'>(null);
  const due = dueLabel(t.due_on, today);
  const origin = ORIGINS.find(o => o.key === t.origin);
  const status: TaskStatus = t.status ?? 'todo';
  const count = summary?.count ?? 0;
  const theyAsked = !!summary?.question && summary.lastBy !== me;

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await onEdit({
      title: f.get('title'), detail: f.get('detail'),
      priority: f.get('priority'), due_on: f.get('due_on')
    });
    if (ok) setEditing(false);
  }

  return (
    <li className="task">
      <button disabled={toggling} className="task-check" onClick={onToggle} aria-label={`Mark ${t.title} done`} />
      <div className="task-body">
        <div className="task-top">
          <span className={`pri ${t.priority}`}>{PRIORITIES.find(p => p.key === t.priority)?.label}</span>
          <span className="task-title">{t.title}</span>
        </div>
        {t.detail && !editing && <p className="small muted task-detail">{t.detail}</p>}
        <div className="task-meta xs">
          {due && <span className={`due ${due.tone}`}>{due.text}</span>}
          {(origin && (origin.key !== 'self' || t.origin_note)) && (
            <span className="muted">{origin.label}{t.origin_note ? ` · ${t.origin_note}` : ''}</span>
          )}
          <span className="muted">{t.created_by === me ? 'Added by you' : `From ${side === 'admin' ? 'the placement' : counterpart}`}</span>
          {theyAsked && <span className="due late">{side === 'client' ? `${counterpart} asked a question` : 'A question for you'}</span>}
        </div>

        <div className="task-actions">
          <label className="sr-only" htmlFor={`st-${t.id}`}>Status of {t.title}</label>
          <select id={`st-${t.id}`} className={`task-status ${status}`} value={status}
            onChange={e => onStatus(e.target.value as TaskStatus)}>
            {TASK_STATUSES.map(s => <option key={s.key} value={s.key}>{statusLabel(s.key, side)}</option>)}
          </select>
          {canEdit && (
            <button type="button" className="task-link" onClick={() => setEditing(v => !v)} aria-expanded={editing}>
              {editing ? 'Close' : 'Edit'}
            </button>
          )}
          <button type="button" className="task-link" onClick={() => setTalk(v => v === 'comment' ? null : 'comment')}
            aria-expanded={talk === 'comment'}>
            {count ? `Comments (${count})` : 'Comment'}
          </button>
          {side === 'talent' && (
            <button type="button" className="task-link" onClick={() => setTalk(v => v === 'question' ? null : 'question')}
              aria-expanded={talk === 'question'}>
              <span className="q">Ask a question</span>
            </button>
          )}
        </div>

        {editing && (
          <form className="task-edit" onSubmit={saveEdit}>
            <label className="sr-only" htmlFor={`et-${t.id}`}>Title</label>
            <input id={`et-${t.id}`} name="title" defaultValue={t.title} required />
            <label className="sr-only" htmlFor={`ed-${t.id}`}>Detail</label>
            <textarea id={`ed-${t.id}`} name="detail" rows={3} defaultValue={t.detail ?? ''} placeholder="Detail" />
            <div className="grid-2" style={{ gap: 10 }}>
              <div>
                <label className="xs muted" htmlFor={`ep-${t.id}`}>Priority</label>
                <select id={`ep-${t.id}`} name="priority" defaultValue={t.priority}>
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="xs muted" htmlFor={`edue-${t.id}`}>Due</label>
                <input id={`edue-${t.id}`} type="date" name="due_on" defaultValue={t.due_on ?? ''} />
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn sm solid">Save</button>
              <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        )}

        {talk && <TaskTalk task={t} me={me} side={side} counterpart={counterpart} question={talk === 'question'}
          onSent={() => { onSaved(); if (talk === 'question') setTalk('comment'); }} />}
      </div>
      {t.created_by === me && (confirming
        ? <span className="row" style={{ gap: 6 }}>
            <button disabled={busy} className="btn sm solid" onClick={onRemove}>Remove</button>
            <button className="btn sm ghost" onClick={onKeep}>Keep</button>
          </span>
        : <button disabled={busy} className="task-x" onClick={onRemove} aria-label={`Remove ${t.title}`}>×</button>
      )}
    </li>
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
    }), question ? 'Question sent' : 'Comment added');
    setSending(false);
    if (ok) { form.reset(); load(); onSent(); }
  }

  return (
    <div className="task-thread">
      {items === null ? <p className="xs muted">Loading…</p>
        : items.map(c => (
          <div key={c.id} className={`c${c.is_question ? ' question' : ''}`}>
            <span className="who">{c.author_id === me ? 'You'
              : sides[c.author_id] === 'team' ? 'Relève'
              : side === 'admin' ? (sides[c.author_id] === 'client' ? 'Executive' : 'Talent')
              : counterpart} · {new Date(c.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            <p>{c.body}</p>
          </div>
        ))}
      <form onSubmit={send}>
        <label className="sr-only" htmlFor={`tc-${task.id}`}>{question ? 'Your question' : 'Your comment'}</label>
        <textarea id={`tc-${task.id}`} name="body" rows={2} required
          placeholder={question ? `What do you need from ${counterpart} to move this on?` : 'Add a comment'} />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm solid" disabled={sending}>{sending ? 'Sending…' : question ? 'Send the question' : 'Add comment'}</button>
        </div>
      </form>
    </div>
  );
}
