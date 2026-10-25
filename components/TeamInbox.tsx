'use client';
import { useEffect, useState } from 'react';
import MessageThread from './MessageThread';
import TableSearch from './TableSearch';

type Thread = {
  subject_id: string; name: string; role: string; org_name: string | null;
  last: string; last_at: string; waiting: boolean; unread: number;
};
type Direct = {
  placement_id: string; client_name: string; org_name: string | null; talent_name: string;
  last: string; last_at: string; total: number;
};
type Open = { kind: 'subject'; t: Thread } | { kind: 'direct'; d: Direct };

/* The Relève inbox. Two kinds of conversation:
   - people writing to Relève (their Success Manager line), answered here;
   - an executive and their talent writing to each other, which the team can
     read (to spot trouble early) but never writes into from this screen.
   "Mine" narrows both to the placements the signed-in manager looks after. */
export default function TeamInbox({ me, initialThread, initialMine = false, initialName = null, initialRole = 'client' }: {
  me: string; initialThread?: string | null; initialMine?: boolean;
  /* From a "Message them" link: who the thread is with, for the case where
     they have never written in and so are not in the list yet. */
  initialName?: string | null; initialRole?: 'client' | 'talent';
}) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [direct, setDirect] = useState<Direct[]>([]);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [mine, setMine] = useState(initialMine);
  const [view, setView] = useState<'us' | 'direct'>('us');

  function load(m = mine) {
    setFailed(false);
    fetch(`/api/messages${m ? '?mine=1' : ''}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => {
        let ts: Thread[] = d.threads ?? [];
        if (initialThread && !open) {
          let hit = ts.find(x => x.subject_id === initialThread);
          /* "Message them" from a request used to land here and open nothing
             when the executive had never written in. An empty thread for that
             person is listed at the top instead, so the composer is there. */
          if (!hit) {
            hit = {
              subject_id: initialThread, name: initialName?.trim() || (initialRole === 'talent' ? 'Talent' : 'Executive'),
              role: initialRole, org_name: null, last: 'Nothing written yet', last_at: new Date().toISOString(),
              waiting: false, unread: 0
            };
            ts = [hit, ...ts];
          }
          setOpen({ kind: 'subject', t: hit });
        } else if (open?.kind === 'subject' && !ts.some(x => x.subject_id === open.t.subject_id)) {
          ts = [open.t, ...ts];   // keep a placeholder thread listed across a reload
        }
        setThreads(ts);
        setDirect(d.placementThreads ?? []);
      })
      .catch(() => setFailed(true));
  }
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  useEffect(() => { load(mine); }, [mine]);

  function toggleMine() {
    const next = !mine;
    setMine(next);
    setOpen(null);
    try {
      const u = new URL(window.location.href);
      if (next) u.searchParams.set('mine', '1'); else u.searchParams.delete('mine');
      window.history.replaceState(null, '', u.toString());
    } catch { /* convenience only */ }
  }

  if (failed) return (
    <div className="card"><div className="empty"><span className="tick" />
      <p className="small">Your threads did not load.</p>
      <button className="btn sm ghost" onClick={() => load()}>Try again</button>
    </div></div>
  );
  if (!threads) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;

  const unreadThreads = threads.filter(t => t.unread > 0).length;

  /* The badge clears only once MessageThread confirms the messages loaded. */
  function markRead(subjectId: string) {
    setThreads(ts => (ts ?? []).map(x => x.subject_id === subjectId ? { ...x, unread: 0 } : x));
  }

  /* The two kinds of conversation are tabs, the same strip every other
     console section uses; Mine/Everyone is a filter and sits beside them. */
  const filterBar = (
    <div className="dir-head inbox-filter">
      <nav className="tabs" role="tablist" aria-label="Which conversations">
        <button type="button" role="tab" className={view === 'us' ? 'on' : ''} aria-selected={view === 'us'} onClick={() => setView('us')}>
          Writing to us{unreadThreads ? <span className="tab-n">{unreadThreads}</span> : null}
        </button>
        <button type="button" role="tab" className={view === 'direct' ? 'on' : ''} aria-selected={view === 'direct'} onClick={() => setView('direct')}>
          Executive and talent
        </button>
      </nav>
      <div className="dir-aside">
        <button type="button" className={`btn sm ${mine ? 'solid' : 'ghost'}`} aria-pressed={mine} onClick={toggleMine}>
          {mine ? 'Mine' : 'Everyone'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {filterBar}
      <div className="inbox">
        <div className="card inbox-list">
          <div className="card-head">
            <h3>{view === 'us' ? 'Threads' : 'Direct lines'}</h3>
            {view === 'us'
              ? (unreadThreads > 0 && <span className="pill">{unreadThreads} unread</span>)
              : <span className="pill">Read only</span>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <TableSearch scope="inbox-threads" rows="li" placeholder="Search by name or keyword…" />
          </div>
          {view === 'us' ? (
            !threads.length ? (
              <p className="small muted">{mine ? 'Nobody you look after has written in yet.' : 'No one has written in yet.'}</p>
            ) : (
              <ul id="inbox-threads">
                {threads.map(t => (
                  <li key={t.subject_id}>
                    <button className={open?.kind === 'subject' && open.t.subject_id === t.subject_id ? 'on' : ''} aria-pressed={open?.kind === 'subject' && open.t.subject_id === t.subject_id}
                      onClick={() => setOpen({ kind: 'subject', t })}>
                      <div className="row between">
                        <b>{t.name} · {t.role === 'client' ? 'Executive' : 'Talent'}</b>
                        {t.unread > 0 && <span className="thread-badge">{t.unread}</span>}
                      </div>
                      <div className="small clip">{t.last}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            !direct.length ? (
              <p className="small muted">No executive and talent have written to each other yet.</p>
            ) : (
              <ul id="inbox-threads">
                {direct.map(d => (
                  <li key={d.placement_id}>
                    <button className={open?.kind === 'direct' && open.d.placement_id === d.placement_id ? 'on' : ''} aria-pressed={open?.kind === 'direct' && open.d.placement_id === d.placement_id}
                      onClick={() => setOpen({ kind: 'direct', d })}>
                      <div className="row between">
                        <b>{d.org_name ?? d.client_name} · {d.talent_name}</b>
                        <span className="xs muted">{d.total}</span>
                      </div>
                      <div className="small clip">{d.last}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
        <div className="inbox-thread">
          {open?.kind === 'subject'
            ? <MessageThread subject={open.t.subject_id} me={me} asTeam theirName={open.t.name}
                onLoaded={() => markRead(open.t.subject_id)} />
            : open?.kind === 'direct'
              ? <MessageThread placement={open.d.placement_id} me={me} readOnly
                  theirName={`${open.d.org_name ?? open.d.client_name} and ${open.d.talent_name}`} />
              : <div className="card inbox-unchosen"><div className="empty"><span className="tick" />
                  <p className="small">Choose a thread to read it.</p></div></div>}
        </div>
      </div>
    </>
  );
}
