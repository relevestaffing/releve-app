'use client';
import { useEffect, useState } from 'react';
import { ORIGINS, PRIORITIES, type Priority, type Task } from '@/lib/work-public';
import { saving, toast } from './Toast';

const PRI_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

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

export default function TaskBoard({ placementId, me, side, counterpart }: {
  placementId: string; me: string; side: 'client' | 'talent' | 'admin'; counterpart: string;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  async function load() {
    const r = await fetch(`/api/tasks?placement=${placementId}`);
    const d = await r.json();
    setTasks(d.tasks ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [placementId]);

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
    setTasks(list => list!.map(x => x.id === t.id ? { ...x, done: !x.done } : x));   // optimistic
    const res = await fetch('/api/tasks', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: t.id, done: !t.done })
    });
    if (!res.ok) { toast.bad('Could not update that task.'); load(); }
    else if (!t.done) toast.saved('Done');
  }

  async function remove(t: Task) {
    const ok = await saving(() => fetch(`/api/tasks?id=${t.id}`, { method: 'DELETE' }), 'Task removed');
    if (ok) load();
  }

  if (!tasks) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;

  const live = tasks.filter(t => !t.done).sort((a, b) =>
    PRI_ORDER[a.priority] - PRI_ORDER[b.priority] ||
    (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  const done = tasks.filter(t => t.done);

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
          <ul className="task-list">
            {live.map(t => {
              const due = dueLabel(t.due_on);
              const origin = ORIGINS.find(o => o.key === t.origin);
              return (
                <li key={t.id} className="task">
                  <button disabled={!!busy} className="task-check" onClick={() => toggle(t)} aria-label={`Mark ${t.title} done`} />
                  <div className="task-body">
                    <div className="task-top">
                      <span className={`pri ${t.priority}`}>{PRIORITIES.find(p => p.key === t.priority)?.label}</span>
                      <span className="task-title">{t.title}</span>
                    </div>
                    {t.detail && <p className="small muted task-detail">{t.detail}</p>}
                    <div className="task-meta xs">
                      {due && <span className={`due ${due.tone}`}>{due.text}</span>}
                      <span className="muted">
                        {origin?.label ?? 'Self-directed'}{t.origin_note ? ` · ${t.origin_note}` : ''}
                      </span>
                      <span className="muted">{t.created_by === me ? 'Added by you' : `From ${counterpart}`}</span>
                    </div>
                  </div>
                  {t.created_by === me && (
                    <button disabled={!!busy} className="task-x" onClick={() => remove(t)} aria-label="Remove task">×</button>
                  )}
                </li>
              );
            })}
          </ul>
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
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label>Where it came from</label>
                <select name="origin" defaultValue={side === 'client' ? 'meeting' : 'self'}>
                  {ORIGINS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select></div>
              <div className="ff"><label>Which one</label>
                <input name="origin_note" placeholder="Tuesday board call" /></div>
            </div>
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
                  <button disabled={!!busy} className="task-check on" onClick={() => toggle(t)} aria-label={`Reopen ${t.title}`}>✓</button>
                  <div className="task-body"><span className="task-title">{t.title}</span></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
