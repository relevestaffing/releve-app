'use client';
import { useEffect, useState } from 'react';
import { ORIGINS, PRIORITIES, type Priority, type Task } from '@/lib/work-public';
import { saving, toast } from './Toast';

const PRI_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/* Overdue first regardless of priority — a low-priority task three days late
   still needs to outrank a high-priority one due next month. Inside each
   bucket, priority breaks the tie the way it always has. */
type Group = { label: string; tasks: Task[] };
function groupTasks(tasks: Task[]): Group[] {
  const today = new Date().toISOString().slice(0, 10);
  const weekOut = new Date(); weekOut.setDate(weekOut.getDate() + 7);
  const weekOutStr = weekOut.toISOString().slice(0, 10);
  const buckets = { overdue: [] as Task[], today: [] as Task[], week: [] as Task[], later: [] as Task[], none: [] as Task[] };
  for (const t of tasks) {
    if (!t.due_on) buckets.none.push(t);
    else if (t.due_on < today) buckets.overdue.push(t);
    else if (t.due_on === today) buckets.today.push(t);
    else if (t.due_on <= weekOutStr) buckets.week.push(t);
    else buckets.later.push(t);
  }
  const byPriority = (a: Task, b: Task) =>
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

function dueLabel(d: string | null) {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(d + 'T00:00:00');
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: days === -1 ? 'Yesterday' : `${-days} days late`, tone: 'late' };
  if (days === 0) return { text: 'Today', tone: 'now' };
  if (days === 1) return { text: 'Tomorrow', tone: 'now' };
  if (days <= 7) return { text: due.toLocaleDateString(undefined, { weekday: 'long' }), tone: '' };
  return { text: due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), tone: '' };
}

export default function TaskBoard({ placementId, me, side, counterpart, limit, seeAllHref }: {
  placementId: string; me: string; side: 'client' | 'talent' | 'admin'; counterpart: string;
  /* Cap how many open tasks render before the list hands off to a link — the
     dashboard's glance view sets this; the full Tasks page leaves it unset
     and shows everything. */
  limit?: number; seeAllHref?: string;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  async function load() {
    setFailed(false);
    try {
      const r = await fetch(`/api/tasks?placement=${placementId}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setTasks(d.tasks ?? []);
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

  async function toggle(t: Task) {
    if (toggling) return;                                                            // ignore taps while one is in flight
    setToggling(t.id);
    setTasks(list => list!.map(x => x.id === t.id ? { ...x, done: !x.done } : x));   // optimistic
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: t.id, done: !t.done })
      });
      if (!res.ok) { toast.bad('Could not update that task.'); load(); }        // server refused — resync to the truth
      else if (!t.done) toast.saved('Done');
    } catch {
      /* the connection dropped mid-request (common on a phone in Manila or
         Bogotá). fetch rejects rather than returning !ok, so without this the
         optimistic flip would stay on screen while the server never heard. */
      toast.bad('Could not reach the server — check your connection.');
      load();
    } finally {
      setToggling(null);
    }
  }

  const [confirmId, setConfirmId] = useState<string | null>(null);
  async function remove(t: Task) {
    if (confirmId !== t.id) { setConfirmId(t.id); return; }
    const ok = await saving(() => fetch(`/api/tasks?id=${t.id}`, { method: 'DELETE' }), 'Task removed');
    setConfirmId(null);
    if (ok) load();
  }

  if (failed) return (
    <div className="card">
      <div className="empty"><span className="tick" />
        <p className="small">Could not load {side === 'client' ? `${counterpart}'s tasks` : 'your tasks'}.</p>
        <button className="btn sm ghost" onClick={load}>Try again</button>
      </div>
    </div>
  );

  if (!tasks) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;

  const live = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  const groups = groupTasks(live);
  const truncated = limit != null && live.length > limit;

  /* Fill the cap group by group, in the order groupTasks already ranked
     them, so a glance view never cuts a group in half without saying so. */
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

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>{side === 'client' ? 'What you have handed over' : 'Your work'}</h3>
          <span className="pill">{live.length} open</span>
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
                ...g.tasks.map(t => {
                  const due = dueLabel(t.due_on);
                  const origin = ORIGINS.find(o => o.key === t.origin);
                  return (
                    <li key={t.id} className="task">
                      <button disabled={toggling === t.id} className="task-check" onClick={() => toggle(t)} aria-label={`Mark ${t.title} done`} />
                      <div className="task-body">
                        <div className="task-top">
                          <span className={`pri ${t.priority}`}>{PRIORITIES.find(p => p.key === t.priority)?.label}</span>
                          <span className="task-title">{t.title}</span>
                        </div>
                        {t.detail && <p className="small muted task-detail">{t.detail}</p>}
                        <div className="task-meta xs">
                          {due && <span className={`due ${due.tone}`}>{due.text}</span>}
                          {/* "Self-directed" with no note is the silent default — it fires for
                             every task the executive assigns straight through the app (there is
                             no "where did this come from" for them to answer) and adds nothing
                             next to "Added by you"/"From {counterpart}" below, so it only earns
                             its place when there is a real origin or a note to go with it. */}
                          {(origin && (origin.key !== 'self' || t.origin_note)) && (
                            <span className="muted">
                              {origin.label}{t.origin_note ? ` · ${t.origin_note}` : ''}
                            </span>
                          )}
                          <span className="muted">{t.created_by === me ? 'Added by you' : `From ${counterpart}`}</span>
                        </div>
                      </div>
                      {t.created_by === me && (confirmId === t.id
                        ? <span className="row" style={{ gap: 6 }}>
                            <button disabled={!!busy} className="btn sm solid" onClick={() => remove(t)}>Remove</button>
                            <button className="btn sm ghost" onClick={() => setConfirmId(null)}>Keep</button>
                          </span>
                        : <button disabled={!!busy} className="task-x" onClick={() => remove(t)}
                            aria-label={`Remove ${t.title}`}>×</button>
                      )}
                    </li>
                  );
                })
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
            <div className="ff"><label>What needs doing</label>
              <input name="title" required autoFocus placeholder="Rebuild the board pack for Thursday" /></div>
            <div className="ff"><label>Detail <span className="muted">— optional, but it saves a round trip</span></label>
              <textarea name="detail" rows={3}
                placeholder="Where the numbers come from, who has seen it before, what good looks like." /></div>
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label>Priority</label>
                <select name="priority" defaultValue="normal">
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select></div>
              <div className="ff"><label>Due</label><input type="date" name="due_on" /></div>
            </div>
            {/* "Where did this come from" is a talent-side question — it is how they
               log a request that reached them by call, email or a check-in before it
               became a task. An executive assigning something is typing it straight
               into the app; there is no source to name, so the fields don't ask. */}
            {side !== 'client' && (
              <div className="grid-2" style={{ gap: 14 }}>
                <div className="ff"><label>Where it came from</label>
                  <select name="origin" defaultValue="self">
                    {ORIGINS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select></div>
                <div className="ff"><label>Which one</label>
                  <input name="origin_note" placeholder="Tuesday board call" /></div>
              </div>
            )}
            <div className="row" style={{ gap: 12, marginTop: 6 }}>
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
                    {/* Who finished it, and when — recorded all along, shown nowhere. */}
                    <div className="task-meta xs">
                      <span className="muted">
                        Done{t.done_by ? (t.done_by === me ? ' by you' : ` by ${counterpart}`) : ''}
                        {t.done_at ? `, ${new Date(t.done_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
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
