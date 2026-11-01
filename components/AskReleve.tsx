'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from './Toast';

/* Ask Relève.
   -----------
   The same conversation for everyone; what differs is the seat the server
   answers from. A client or a talent gets answers and a hand-off to their
   Success Manager. The founder also gets proposal cards: Confirm runs the
   change through the console's own handler and logs it; Dismiss logs that
   too. The conversation lives in this browser only (sessionStorage), so
   nothing here depends on a table existing. */

type Msg = { role: 'user' | 'assistant'; content: string; proposals?: Proposal[] };
type Proposal = { id: string; kind: string; summary: string; status: 'proposed' | 'done' | 'failed' | 'dismissed'; result?: any };

const KEY = 'releve_ask_v1';

export default function AskReleve({ who, founder, starters, managerHref, compact = false }: {
  who: 'client' | 'talent' | 'admin'; founder: boolean; starters: string[]; managerHref: string; compact?: boolean;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch {} end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);

  async function send(q?: string) {
    const content = (q ?? text).trim();
    if (!content || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'The assistant did not answer.');
      setMsgs([...next, { role: 'assistant', content: j.reply, proposals: j.proposals ?? [] }]);
    } catch (e: any) {
      setMsgs([...next, { role: 'assistant', content: `${e?.message ?? 'The assistant did not answer.'} If it keeps happening, your Success Manager can help from Messages.` }]);
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
      setMsgs(ms => ms.map(m => ({ ...m, proposals: m.proposals?.map(x => x.id === p.id ? { ...x, status, result: r.ok ? j.result : { error: j.error } } : x) })));
      if (!r.ok) toast.bad(j.error || 'That did not work.');
      else if (decision === 'confirm') toast.ok('Done.');
    } catch { toast.bad('No connection. Nothing changed.'); }
    setActing('');
  }

  const label = who === 'admin' ? (founder ? 'Ask, or tell it what to fix.' : 'Ask about anything in the console.') : 'Ask anything about Relève or your account.';

  return (
    <div className={compact ? 'ask ask-compact' : 'card chat-card ask'}>
      <div className="thread" style={{ padding: '4px 2px 10px' }}>
        {!msgs.length && (
          <div className="ask-empty">
            <p className="small muted" style={{ margin: '0 0 14px' }}>{label}</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {starters.map(s => <button key={s} type="button" className="btn sm ghost" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble-row${m.role === 'user' ? ' mine' : ''}`}>
            <div className={`bubble${m.role === 'user' ? ' mine' : ''}`} style={{ paddingBottom: 11 }}>
              {m.role === 'assistant' && <div className="bubble-who xs">Relève</div>}
              <p>{m.content}</p>
              {!!m.proposals?.length && (
                <div className="stack" style={{ gap: 10, marginTop: 12 }}>
                  {m.proposals.map(p => (
                    <div key={p.id} className="ask-proposal">
                      <div className="xs" style={{ letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--sage)', marginBottom: 4 }}>
                        {p.status === 'proposed' ? 'Proposed' : p.status === 'done' ? 'Done' : p.status === 'failed' ? 'Did not work' : 'Dismissed'}
                      </div>
                      <div className="small" style={{ marginBottom: p.status === 'proposed' ? 10 : 0 }}>{p.summary}</div>
                      {p.status === 'failed' && p.result?.error && <div className="xs" style={{ color: 'var(--crit)', marginTop: 4 }}>{String(p.result.error)}</div>}
                      {p.status === 'proposed' && founder && (
                        <div className="row" style={{ gap: 8 }}>
                          <button type="button" className="btn sm solid" disabled={!!acting} onClick={() => decide(p, 'confirm')}>{acting === p.id + 'confirm' ? 'Working…' : 'Confirm'}</button>
                          <button type="button" className="btn sm ghost" disabled={!!acting} onClick={() => decide(p, 'dismiss')}>Dismiss</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="bubble-row"><div className="bubble" style={{ paddingBottom: 11 }}><div className="bubble-who xs">Relève</div><p className="muted">Thinking…</p></div></div>}
        <div ref={end} />
      </div>
      <form className="ask-compose" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea ref={box} value={text} rows={2} placeholder={label} disabled={busy}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="row between" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <span className="xs muted">
            {who === 'admin'
              ? (founder ? 'Changes are proposals until you confirm them. Every confirmed action is logged.' : 'Read-only here; changes are made from their console pages.')
              : <>Answers come from Relève, not a person. For anything on your account, <a href={managerHref} style={{ textDecoration: 'underline' }}>message your Success Manager</a>.</>}
          </span>
          <div className="row" style={{ gap: 8 }}>
            {msgs.length > 0 && <button type="button" className="btn sm ghost" disabled={busy} onClick={() => { setMsgs([]); try { sessionStorage.removeItem(KEY); } catch {} }}>Start over</button>}
            <button type="submit" className="btn sm solid" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Ask'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
