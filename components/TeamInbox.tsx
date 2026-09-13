'use client';
import { useEffect, useState } from 'react';
import MessageThread from './MessageThread';
import TableSearch from './TableSearch';

type Thread = {
  subject_id: string; name: string; role: string; org_name: string | null;
  last: string; last_at: string; waiting: boolean; unread: number;
};

export default function TeamInbox({ me }: { me: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Thread | null>(null);

  function load() {
    setFailed(false);
    fetch('/api/messages')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => setThreads(d.threads ?? []))
      .catch(() => setFailed(true));
  }
  useEffect(() => { load(); }, []);

  if (failed) return (
    <div className="card"><div className="empty"><span className="tick" />
      <p className="small">Could not load your threads.</p>
      <button className="btn sm ghost" onClick={load}>Try again</button>
    </div></div>
  );
  if (!threads) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;
  if (!threads.length) return (
    <div className="card"><div className="empty"><span className="tick" />
      <p className="small">No one has written in yet.</p></div></div>
  );

  const unreadThreads = threads.filter(t => t.unread > 0).length;

  function openThread(t: Thread) {
    setOpen(t);
  }

  /* Opening a thread reads it — the server marks it the moment MessageThread
     actually fetches those messages, and the badge here only clears once
     that fetch has confirmed it happened (MessageThread's onLoaded, below).
     Clearing it the instant the thread is clicked meant a dropped connection
     or an expired session could leave a thread showing as read when nothing
     had actually been read. */
  function markRead(subjectId: string) {
    setThreads(ts => (ts ?? []).map(x => x.subject_id === subjectId ? { ...x, unread: 0 } : x));
  }

  return (
    <div className="inbox">
      <div className="card inbox-list">
        <div className="card-head">
          <h3>Threads</h3>
          <span className="pill">{unreadThreads} unread</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <TableSearch scope="inbox-threads" rows="li" placeholder="Search by name or keyword…" />
        </div>
        <ul id="inbox-threads">
          {threads.map(t => (
            <li key={t.subject_id}>
              <button className={open?.subject_id === t.subject_id ? 'on' : ''} onClick={() => openThread(t)}>
                <div className="row between">
                  <b>{t.name} — {t.role === 'client' ? 'Executive' : 'Talent'}</b>
                  {t.unread > 0 && <span className="thread-badge">{t.unread}</span>}
                </div>
                <div className="small clip">{t.last}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="inbox-thread">
        {open
          ? <MessageThread subject={open.subject_id} me={me} asTeam theirName={open.name}
              onLoaded={() => markRead(open.subject_id)} />
          : <div className="card"><div className="empty"><span className="tick" />
              <p className="small">Pick a thread to read it.</p></div></div>}
      </div>
    </div>
  );
}
