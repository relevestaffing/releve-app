'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from './Toast';

/* Ask Relève.
   -----------
   A conversation with Relève that behaves like the best person on a client
   desk: it speaks first (a greeting built from the account), it is seen
   typing, its words arrive as they are written, and the thread is kept on
   the server so the window opens where it left off. What differs by seat
   is the knowledge the server answers from. The founder also gets proposal
   cards: Confirm runs the change through the console's own handler and
   logs it; Not now logs that too. */

type Proposal = { id: string; kind: string; summary: string; status: 'proposed' | 'done' | 'failed' | 'dismissed'; result?: any };
type Msg = { role: 'user' | 'assistant'; content: string; at: string; proposals?: Proposal[]; greeting?: boolean; live?: boolean; status?: string };

const CACHE = 'releve_ask_v2';
const SEND_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10M8.5 3.5L13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function dayKey(iso: string) { return new Date(iso).toDateString(); }
function dayLabel(iso: string) {
  const d = new Date(iso); const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}
function clock(iso: string) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

/* Plain text with the two things the assistant is allowed to format:
   links to pages in the app, and the odd emphasis. Nothing else. */
function Rich({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)|\*\*([^*\n]+)\*\*/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[3] != null) out.push(<b key={i++}>{m[3]}</b>);
    else {
      const href = m[2];
      const external = /^https?:/.test(href);
      out.push(<a key={i++} href={href} className="ask-link" {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{m[1]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export default function AskReleve({ who, founder, starters, managerHref, compact = false }: {
  who: 'client' | 'talent' | 'admin'; founder: boolean; starters: string[]; managerHref: string; compact?: boolean;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<string[]>(starters);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  /* Open on the cached thread at once, then on the server's. */
  useEffect(() => {
    let alive = true;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null');
      if (c?.msgs?.length) { setMsgs(c.msgs); setChips(c.chips ?? starters); setReady(true); }
    } catch {}
    (async () => {
      try {
        const r = await fetch('/api/ai/chat', { cache: 'no-store' });
        const j = await r.json();
        if (!alive || !r.ok) return;
        const thread: Msg[] = (j.thread ?? []).map((m: any) => ({ role: m.role, content: m.content, at: m.at, proposals: m.proposals }));
        const greeting: Msg = { role: 'assistant', content: j.greeting?.text ?? 'What can I help with?', at: new Date().toISOString(), greeting: true };
        setMsgs(cur => {
          /* Keep anything said in this window since the cache was written. */
          const unsent = cur.filter(m => m.live);
          return [...thread, greeting, ...unsent];
        });
        setChips(j.greeting?.chips?.length ? j.greeting.chips : starters);
      } catch { /* the window still works without the opener */ }
      if (alive) { setReady(true); setTimeout(() => box.current?.focus(), 80); }
    })();
    return () => { alive = false; abort.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(CACHE, JSON.stringify({ msgs: msgs.slice(-40).map(m => ({ ...m, live: false })), chips })); } catch {}
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [msgs, chips]);

  async function send(q?: string) {
    const content = (q ?? text).trim();
    if (!content || busy) return;
    const now = new Date().toISOString();
    const mine: Msg = { role: 'user', content, at: now, live: true };
    const pending: Msg = { role: 'assistant', content: '', at: now, live: true, status: '' };
    const history = [...msgs, mine];
    setMsgs([...history, pending]); setText(''); setBusy(true);
    if (box.current) box.current.style.height = 'auto';

    const patchLast = (f: (m: Msg) => Msg) => setMsgs(ms => { const c = ms.slice(); c[c.length - 1] = f(c[c.length - 1]); return c; });
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
        body: JSON.stringify({ stream: true, messages: history.map(m => ({ role: m.role, content: m.content })) })
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'The assistant did not answer.');
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let ev: any; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.t === 'text') patchLast(m => ({ ...m, content: m.content + ev.d, status: '' }));
          else if (ev.t === 'status') patchLast(m => ({ ...m, status: ev.d }));
          else if (ev.t === 'done') { finished = true; patchLast(m => ({ ...m, content: ev.reply || m.content, proposals: ev.proposals ?? [], status: '', at: new Date().toISOString() })); }
          else if (ev.t === 'error') throw new Error(ev.d || 'The assistant did not answer.');
        }
      }
      if (!finished) patchLast(m => ({ ...m, status: '' }));
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        const why = e?.message ?? 'The assistant did not answer.';
        patchLast(m => ({ ...m, status: '', content: m.content || `${why} If it keeps happening, your Success Manager can help from Messages.` }));
      }
    }
    setBusy(false);
    setTimeout(() => box.current?.focus(), 50);
  }

  async function decide(p: Proposal, decision: 'confirm' | 'dismiss') {
    setActing(p.id + decision);
    try {
      const r = await fetch('/api/ai/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p.id, decision }) });
      const j = await r.json().catch(() => ({}));
      const status: Proposal['status'] = r.ok ? j.status : 'failed';
      setMsgs(ms => [
        ...ms.map(m => ({ ...m, proposals: m.proposals?.map(x => x.id === p.id ? { ...x, status, result: r.ok ? j.result : { error: j.error } } : x) })),
        { role: 'assistant', at: new Date().toISOString(), live: true,
          content: !r.ok ? `That did not go through: ${j.error || 'no reason given'}. Nothing changed.`
            : decision === 'dismiss' ? 'Left as it was. Anything else?'
            : `Done. ${p.summary.replace(/\.$/, '')}. Anything else while I am here?` }
      ]);
      if (!r.ok) toast.bad(j.error || 'That did not work.');
    } catch { toast.bad('No connection. Nothing changed.'); }
    setActing('');
  }

  const askedToday = msgs.some(m => m.role === 'user' && m.live);
  const showChips = ready && !busy && !askedToday && chips.length > 0;

  return (
    <div className={compact ? 'ask ask-compact' : 'card chat-card ask'}>
      <div className="thread ask-thread" style={{ padding: '4px 2px 10px' }}>
        {!ready && !msgs.length && (
          <div className="ask-msg"><div className="ask-mark" aria-hidden="true">R</div><div className="ask-bubble"><span className="ask-typing"><i /><i /><i /></span></div></div>
        )}
        {msgs.map((m, i) => {
          const divider = i === 0 || dayKey(msgs[i - 1].at) !== dayKey(m.at);
          const run = i > 0 && !divider && msgs[i - 1].role === m.role && !msgs[i - 1].greeting;
          if (m.role === 'user') return (
            <div key={i}>
              {divider && <div className="ask-day"><span>{dayLabel(m.at)}</span></div>}
              <div className={`ask-msg mine${run ? ' run' : ''}`}>
                <div className="ask-bubble mine"><p><Rich text={m.content} /></p><span className="ask-time">{clock(m.at)}</span></div>
              </div>
            </div>
          );
          const typing = m.live && busy && i === msgs.length - 1 && !m.content.trim();
          return (
            <div key={i}>
              {divider && <div className="ask-day"><span>{dayLabel(m.at)}</span></div>}
              <div className={`ask-msg${run ? ' run' : ''}`}>
                {!run ? <div className="ask-mark" aria-hidden="true">R</div> : <div className="ask-mark gap" aria-hidden="true" />}
                <div className="ask-bubble">
                  {!run && <div className="ask-who">Relève<span>{typing ? '' : clock(m.at)}</span></div>}
                  {typing
                    ? <span className="ask-typing" aria-label={m.status || 'Relève is typing'}><i /><i /><i />{m.status && <em>{m.status}</em>}</span>
                    : <p><Rich text={m.content} />{m.live && busy && i === msgs.length - 1 && <span className="ask-caret" aria-hidden="true" />}</p>}
                  {!!m.status && !typing && <div className="ask-status">{m.status}</div>}
                  {!!m.proposals?.length && (
                    <div className="stack" style={{ gap: 10, marginTop: 12 }}>
                      {m.proposals.map(p => (
                        <div key={p.id} className={`ask-proposal ${p.status}`}>
                          <div className="ask-proposal-tag">
                            {p.status === 'proposed' ? 'Waiting for you' : p.status === 'done' ? 'Done' : p.status === 'failed' ? 'Did not work' : 'Not now'}
                          </div>
                          <div className="small" style={{ marginBottom: p.status === 'proposed' ? 12 : 0 }}>{p.summary}</div>
                          {p.status === 'failed' && p.result?.error && <div className="xs" style={{ color: 'var(--crit)', marginTop: 4 }}>{String(p.result.error)}</div>}
                          {p.status === 'proposed' && founder && (
                            <div className="row" style={{ gap: 8 }}>
                              <button type="button" className="btn sm solid" disabled={!!acting} onClick={() => decide(p, 'confirm')}>{acting === p.id + 'confirm' ? 'Working…' : 'Confirm'}</button>
                              <button type="button" className="btn sm ghost" disabled={!!acting} onClick={() => decide(p, 'dismiss')}>Not now</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {showChips && (
          <div className="ask-chips">
            {chips.slice(0, 4).map(s => <button key={s} type="button" className="ask-chip" onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        <div ref={end} />
      </div>
      <form className="ask-compose" onSubmit={e => { e.preventDefault(); send(); }}>
        <div className="ask-compose-row">
          <textarea ref={box} value={text} rows={1} placeholder="Message Relève" disabled={!ready}
            onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button type="submit" className="ask-send" aria-label="Send" disabled={busy || !text.trim()}>{SEND_ICON}</button>
        </div>
        <div className="ask-foot">
          <span className="xs muted">
            {who === 'admin'
              ? (founder ? (compact ? 'Proposals wait for your confirmation. All logged.' : 'Changes are proposals until you confirm them, and every one is logged.') : 'Read only here; changes are made from the console pages.')
              : <>Relève answers here. For a decision on your account, <a href={managerHref}>message your Success Manager</a>.</>}
          </span>
          {msgs.some(m => m.role === 'user') && !compact && <button type="button" className="ask-clear" disabled={busy} onClick={() => { setMsgs(ms => ms.filter(m => m.greeting)); try { sessionStorage.removeItem(CACHE); } catch {} }}>Clear the window</button>}
        </div>
      </form>
    </div>
  );
}
