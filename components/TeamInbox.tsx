'use client';
import { useEffect, useState } from 'react';
import MessageThread from './MessageThread';

type Thread = {
  subject_id: string; name: string; role: string; org_name: string | null;
  last: string; last_at: string; waiting: boolean;
};

export default function TeamInbox({ me }: { me: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [open, setOpen] = useState<Thread | null>(null);

  useEffect(() => {
    fetch('/api/messages').then(r => r.json()).then(d => setThreads(d.threads ?? []));
  }, []);

  if (!threads) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;
  if (!threads.length) return (
    <div className="card"><div className="empty"><span className="tick" />
      <p className="small">No one has written in yet.</p></div></div>
  );

  return (
    <div className="inbox">
      <div className="card inbox-list">
        <div className="card-head"><h3>Threads</h3>
          <span className="pill">{threads.filter(t => t.waiting).length} waiting</span></div>
        <ul>
          {threads.map(t => (
            <li key={t.subject_id}>
              <button className={open?.subject_id === t.subject_id ? 'on' : ''} onClick={() => setOpen(t)}>
                <div className="row between">
                  <b>{t.name}</b>
                  {t.waiting && <span className="dot" aria-label="waiting on a reply" />}
                </div>
                <div className="xs muted">{t.role === 'client' ? (t.org_name ?? 'Executive') : 'Talent'}</div>
                <div className="small clip">{t.last}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="inbox-thread">
        {open
          ? <MessageThread subject={open.subject_id} me={me} asTeam theirName={open.name} />
          : <div className="card"><div className="empty"><span className="tick" />
              <p className="small">Pick a thread to read it.</p></div></div>}
      </div>
    </div>
  );
}
