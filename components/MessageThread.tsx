'use client';
import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/work-public';
import { saving } from './Toast';

export default function MessageThread({ subject, placement, me, asTeam = false, theirName, onLoaded }: {
  /* Exactly one of subject / placement is set by the caller — subject for
     the thread with a Success Manager, placement for the direct line
     between a client and the talent they're paired with. */
  subject?: string; placement?: string; me: string; asTeam?: boolean; theirName?: string;
  /* Fired once this thread's messages have genuinely loaded — the console
     uses this to clear the unread badge, rather than clearing it the instant
     a thread is clicked. A click that never actually loads (a dropped
     connection, an expired session) used to leave the badge saying "read"
     while nothing had actually been read. */
  onLoaded?: () => void;
}) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const foot = useRef<HTMLDivElement>(null);
  const key = placement ? `placement:${placement}` : `subject:${subject}`;

  async function load() {
    setFailed(false);
    try {
      const qs = placement ? `placement=${placement}` : `subject=${subject}`;
      const r = await fetch(`/api/messages?${qs}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setMsgs(d.messages ?? []);
      onLoaded?.();
    } catch {
      setFailed(true);
    }
  }
  useEffect(() => { setMsgs(null); load(); /* eslint-disable-next-line */ }, [key]);
  useEffect(() => { foot.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);

  if (failed) return (
    <div className="card chat-card">
      <div className="empty" style={{ flex: 1 }}><span className="tick" />
        <p className="small">Could not load this conversation.</p>
        <button className="btn sm ghost" onClick={load}>Try again</button>
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
    if (ok) { form.reset(); load(); }
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

  return (
    <div className="card chat-card">
      <div className="card-head">
        <h3>{asTeam || placement ? theirName : 'Your Success Manager'}</h3>
        <span className="xs muted">{msgs.length} message{msgs.length === 1 ? '' : 's'}</span>
      </div>

      {msgs.length === 0 ? (
        <div className="empty" style={{ flex: 1 }}><span className="tick" />
          <p className="small">
            {asTeam ? 'Nothing here yet.'
              : placement ? `Nothing here yet — write to ${theirName ?? 'them'} directly.`
              : 'Anything at all — a question, something that is not working, or something you want us to know. A person reads these.'}
          </p></div>
      ) : (
        <div className="thread">
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
                      {!run && (
                        <div className="bubble-who xs">
                          {m.from_team ? 'Relève' : (mine ? 'You' : theirName ?? 'Them')}
                        </div>
                      )}
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

      <form onSubmit={send} className="composer">
        <textarea name="body" rows={1} required
          placeholder={asTeam ? 'Reply…' : placement ? `Write to ${theirName ?? 'them'}…` : 'Write to your Success Manager…'}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 160) + 'px';
          }}
          onKeyDown={e => {
            /* Enter sends, the way chat apps train people to expect — Shift+Enter
               is the escape hatch for anyone who actually wants a line break. */
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
          }} />
        <button className="btn solid sm" disabled={busy} aria-label="Send">
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
