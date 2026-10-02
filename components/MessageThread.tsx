'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/work-public';
import type { Manager } from '@/lib/experience-public';
import { REPLY_PROMISE } from '@/lib/experience-public';
import { saving } from './Toast';
import ManagerLine from './ManagerLine';
import { firstName } from '@/lib/words';

const POLL_MS = 20_000;

export default function MessageThread({
  subject, placement, me, asTeam = false, theirName, onLoaded, manager, readOnly = false
}: {
  /* Exactly one of subject / placement is set by the caller: subject for
     the thread with a Success Manager, placement for the direct line
     between a client and the talent they're paired with. */
  subject?: string; placement?: string; me: string; asTeam?: boolean; theirName?: string;
  /* Fired once this thread's messages have genuinely loaded. The console
     uses this to clear the unread badge, rather than clearing it the instant
     a thread is clicked. */
  onLoaded?: () => void;
  /* Who answers this thread, named, for a client or talent. */
  manager?: Manager;
  /* The console reading a client and talent's own conversation: visible,
     never written into from here. */
  readOnly?: boolean;
}) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const foot = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const key = placement ? `placement:${placement}` : `subject:${subject}`;

  /* quiet = a background refresh: no spinner, no error screen over a
     conversation that is already on the page. */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setFailed(false);
    try {
      const qs = placement ? `placement=${placement}` : `subject=${subject}`;
      const r = await fetch(`/api/messages?${qs}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setMsgs(d.messages ?? []);
      setNames(d.names ?? {});
      if (!quiet) onLoaded?.();
      window.dispatchEvent(new Event('releve:read'));
    } catch {
      if (!quiet) setFailed(true);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [key]);

  useEffect(() => { setMsgs(null); lastCount.current = 0; load(); }, [key, load]);

  /* A reply used to appear only on a manual reload. Coming back to the tab
     refreshes at once; while the tab is visible, every twenty seconds. */
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') load(true); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, POLL_MS);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(t);
    };
  }, [load]);

  /* Scroll only when something new arrived, so a background refresh never
     yanks the page while someone is reading further up. */
  useEffect(() => {
    const n = msgs?.length ?? 0;
    if (n !== lastCount.current) foot.current?.scrollIntoView({ block: 'nearest' });
    lastCount.current = n;
  }, [msgs]);

  if (failed) return (
    <div className="card chat-card">
      <div className="empty" style={{ flex: 1 }}><span className="tick" />
        <p className="small">This conversation did not load.</p>
        <button className="btn sm ghost" onClick={() => load()}>Try again</button>
      </div>
    </div>
  );

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    setBusy(true);
    const ok = await saving(() => fetch('/api/messages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(placement ? { body, placement_id: placement } : { body, subject_id: subject })
    }), 'Sent');
    setBusy(false);
    if (ok) {
      form.reset();
      const ta = form.querySelector('textarea');
      if (ta) ta.style.height = 'auto';
      load(true);
    }
  }

  if (!msgs) return <div className="empty"><span className="tick" /><p className="small">Loading…</p></div>;

  /* Group by day so a long thread reads like a conversation, not a list. */
  const dayKey = (iso: string) => new Date(iso).toDateString();
  const dayLabel = (iso: string) => {
    const d = new Date(iso), now = new Date();
    const diff = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  };
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const groups: { day: string; items: Message[] }[] = [];
  msgs.forEach(m => {
    const k = dayKey(m.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === k) last.items.push(m);
    else groups.push({ day: k, items: [m] });
  });

  const who = (m: Message) => {
    if (m.sender_id === me) return 'You';
    if (m.from_team) return names[m.sender_id] ?? 'Relève';
    if (readOnly || asTeam) return names[m.sender_id] ?? theirName ?? 'Them';
    return theirName ?? 'Them';
  };

  const managerThread = !asTeam && !placement && !readOnly;

  return (
    <div className="card chat-card">
      <div className="card-head">
        {managerThread && manager
          ? <ManagerLine manager={manager} compact />
          : <h3>{asTeam || placement || readOnly ? theirName : 'Your Success Manager'}</h3>}
        <span className="xs muted">{msgs.length} message{msgs.length === 1 ? '' : 's'}</span>
      </div>
      {managerThread && <p className="xs muted chat-promise">{REPLY_PROMISE}</p>}

      {msgs.length === 0 ? (
        <div className="empty" style={{ flex: 1 }}><span className="tick" />
          <p className="small">
            {readOnly ? 'Nothing has been written here yet.'
              : asTeam ? 'Nothing here yet.'
              : placement ? `Nothing here yet. Write to ${theirName ?? 'them'} directly.`
              : 'Anything at all: a question, something that is not working, or something you want us to know. A person reads every message.'}
          </p></div>
      ) : (
        <div className="thread" aria-live="polite">
          {groups.map(g => (
            <div key={g.day}>
              <div className="thread-day"><span>{dayLabel(g.items[0].created_at)}</span></div>
              {g.items.map((m, i) => {
                const mine = m.sender_id === me;
                const prev = g.items[i - 1];
                const run = prev && (prev.sender_id === m.sender_id);
                return (
                  <div key={m.id} className={`bubble-row ${mine ? 'mine' : ''} ${run ? 'run' : ''}`}>
                    <div className={`bubble ${mine ? 'mine' : ''}`}>
                      {!run && <div className="bubble-who xs">{who(m)}</div>}
                      <p>{m.body}</p>
                      <span className="bubble-time">{time(m.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={foot} />
        </div>
      )}

      {readOnly ? (
        <p className="xs muted" style={{ marginTop: 14 }}>
          Read only. This is the executive and their talent writing to each other; reply from their own threads.
        </p>
      ) : (
        <form onSubmit={send} className="composer">
          <label htmlFor={`compose-${key}`} className="sr-only">Your message</label>
          <textarea id={`compose-${key}`} name="body" rows={1} required
            placeholder={asTeam ? 'Reply…' : placement ? `Write to ${theirName ?? 'them'}…`
              : manager?.id ? `Write to ${firstName(manager.name)}…` : 'Write to your Success Manager…'}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 160) + 'px';
            }}
            onKeyDown={e => {
              /* Enter sends, the way chat apps train people to expect; Shift+Enter
                 is the escape hatch for anyone who wants a line break. */
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
            }} />
          <button className="btn solid sm" disabled={busy} aria-label="Send">
            {busy ? '…' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
}
