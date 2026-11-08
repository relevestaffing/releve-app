'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import Overlay from './Overlay';
import { toast } from './Toast';
import type { ChatMsg, EmailDraft } from '@/lib/studio-core';

/* The studio: an interview on the left, the document building on the right.
   -------------------------------------------------------------------------
   One screen serves both the business audit (after a discovery call) and the
   90-Day Plan (after onboarding). Claude opens by reading what Relève already
   knows and asking only what it still needs. Answer in the chat; the document
   writes itself on the right. Ask for any change in the same chat, or edit the
   text by hand. When it is right, the email that carries it is prepared, with
   the PDF attached, and nothing leaves until you confirm. */

type Doc = {
  id: string; title: string; content: string; chat: ChatMsg[];
  state: 'idle' | 'working' | 'error'; error: string | null;
  status: 'draft' | 'sent' | 'published'; email: EmailDraft | null; done_at: string | null;
};
type Kind = 'audit' | 'plan';

const API = '/api/admin/studio';
async function post(body: Record<string, unknown>): Promise<{ ok: boolean; d: any }> {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok, d: await r.json().catch(() => ({})) };
  } catch { return { ok: false, d: { error: 'No connection, so nothing was sent.' } }; }
}
const fmt = (iso: string | null) => {
  try { return iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : ''; } catch { return ''; }
};

function defaultEmail(kind: Kind, first: string): EmailDraft {
  const hi = first ? `${first},` : 'Hello,';
  return kind === 'plan'
    ? { subject: 'Your 90-Day Success Plan', body: `${hi}\n\nYour 90-Day Success Plan is attached. It sets out what happens in your first 30, 60 and 90 days, who is responsible for each part, and what we need from you.\n\nThe plan is the start of onboarding, not the end. Relève keeps watching the work for as long as we work together.\n\nRelève` }
    : { subject: 'Your Business Audit', body: `${hi}\n\nThank you for the conversation. Attached is your Business Audit: where your business is today and exactly how a virtual assistant steps in.\n\nWhen you are ready to move, reply to this email and we will send your onboarding the same day.\n\nRelève` };
}

export default function StudioDesk({ kind, initial, ownerName, ownerEmail, company, viewUrl }: {
  kind: Kind; initial: Doc; ownerName: string; ownerEmail: string | null; company: string | null; viewUrl: string;
}) {
  const [doc, setDoc] = useState<Doc>(initial);
  const [text, setText] = useState('');
  const [pane, setPane] = useState<'chat' | 'doc'>('chat');
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const first = ownerName.trim().split(/\s+/)[0] || '';
  const working = doc.state === 'working';
  const hasDoc = content.trim().length > 0;

  /* While Claude is writing, check every couple of seconds. */
  useEffect(() => {
    if (doc.state !== 'working') return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`${API}?kind=${kind}&id=${doc.id}`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (stop || !r.ok || !j.doc) return;
        setDoc(j.doc);
        if (!dirtyRef.current) { setContent(j.doc.content); setTitle(j.doc.title); }
      } catch { /* keep waiting */ }
    };
    const t = setInterval(tick, 2500);
    return () => { stop = true; clearInterval(t); };
  }, [doc.state, doc.id, kind]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [doc.chat.length, doc.state]);

  async function say(t: string) {
    const msg = t.trim();
    if (!msg || working) return;
    const prev = doc;
    setText('');
    setDoc(d => ({ ...d, chat: [...d.chat, { role: 'user', text: msg, at: new Date().toISOString() }], state: 'working', error: null }));
    const { ok, d } = await post({ action: 'say', kind, id: doc.id, text: msg });
    if (!ok) { setDoc(prev); setText(msg); toast.bad(d.error ?? 'That did not send.'); }
  }
  async function retry() {
    setDoc(d => ({ ...d, state: 'working', error: null }));
    const { ok, d } = await post({ action: 'retry', kind, id: doc.id });
    if (!ok) { setDoc(x => ({ ...x, state: 'error', error: d.error ?? 'That did not send.' })); }
  }
  async function save(): Promise<boolean> {
    setSaving(true);
    const { ok, d } = await post({ action: 'save', kind, id: doc.id, title, content });
    setSaving(false);
    if (!ok) { toast.bad(d.error ?? 'That did not save.'); return false; }
    /* Saved means locked: back to reading, never left open and editable. */
    setDirty(false); setMode('read'); setDoc(x => ({ ...x, title, content })); toast.saved('Saved');
    return true;
  }

  const html = useMemo(() => {
    const safe = (content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const raw = marked.parse(safe, { gfm: true, breaks: false, async: false }) as string;
    return raw.replace(/href="([^"]*)"/g, (_m, u: string) =>
      /^(https?:|mailto:)/i.test(u.replace(/&amp;/g, '&').trim()) ? `href="${u}" target="_blank" rel="noopener noreferrer"` : 'href="#"');
  }, [content]);

  const statusText = doc.status === 'sent' ? `Sent ${fmt(doc.done_at)}` : doc.status === 'published' ? `Published ${fmt(doc.done_at)}` : 'Draft';
  const pdfHref = `${API}?kind=${kind}&id=${doc.id}&pdf=1`;
  const publicLive = kind === 'audit' || doc.status === 'published';

  return (
    <div className="studio">
      <div className="studio-tabs" role="tablist">
        <button role="tab" aria-selected={pane === 'chat'} className={pane === 'chat' ? 'on' : ''} onClick={() => setPane('chat')}>Chat</button>
        <button role="tab" aria-selected={pane === 'doc'} className={pane === 'doc' ? 'on' : ''} onClick={() => setPane('doc')}>
          {kind === 'audit' ? 'Audit' : 'Plan'}
        </button>
      </div>

      <div className="studio-grid">
        <section className={`studio-chat${pane === 'chat' ? ' on' : ''}`} aria-label="Interview">
          <div className="studio-head">
            <div className="crumb">{kind === 'audit' ? 'Audit interview' : 'Plan interview'}</div>
            <p className="studio-sub">Answer here. Ask for any change in the same place.</p>
          </div>
          <div className="studio-msgs" role="log" aria-live="polite">
            {doc.chat.map((m, i) => (
              <div key={i} className={`msg ${m.role === 'user' ? 'me' : 'ai'}`}>
                <div className="msg-who">{m.role === 'user' ? 'You' : 'Relève'}</div>
                <div className="msg-text">{m.text}</div>
              </div>
            ))}
            {working && (
              <div className="msg ai working">
                <div className="msg-who">Relève</div>
                <div className="msg-text">{doc.chat.length === 0 ? `Reading what we have on ${ownerName}…` : 'Writing…'}</div>
              </div>
            )}
            {doc.state === 'error' && (
              <div className="studio-err" role="alert">
                <span>{doc.error ?? 'That could not be written.'}</span>
                <button type="button" className="btn sm ghost" onClick={retry}>Try again</button>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form className="studio-input" onSubmit={e => { e.preventDefault(); say(text); }}>
            <textarea value={text} rows={3} disabled={working && doc.chat.length === 0}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); say(text); } }}
              placeholder={hasDoc ? 'Ask for a change, or add what you know.' : 'Answer the questions, or add anything from the call.'}
              aria-label="Your message" />
            <div className="studio-input-row">
              {!hasDoc && doc.chat.length > 0 && !working && (
                <button type="button" className="btn sm ghost" onClick={() => say('Draft it now with what you have. List anything you assumed under open items.')}>
                  Draft it now
                </button>
              )}
              <button className="btn sm solid" disabled={!text.trim() || working}>Send</button>
            </div>
          </form>
        </section>

        <section className={`studio-doc${pane === 'doc' ? ' on' : ''}`} aria-label={kind === 'audit' ? 'The audit' : 'The plan'}>
          <div className="studio-bar">
            {mode === 'edit'
              ? <input className="studio-title" value={title} aria-label="Title"
                  onChange={e => { setTitle(e.target.value); setDirty(true); }} />
              : <h2 className="studio-title-read">{title}</h2>}
            <div className="studio-actions">
              <span className="studio-status">{statusText}</span>
              <div className="studio-seg" role="group" aria-label="View">
                <button type="button" className={mode === 'read' ? 'on' : ''} onClick={() => setMode('read')}>Read</button>
                <button type="button" className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit text</button>
              </div>
              {dirty && <button type="button" className="btn sm solid" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>}
              {hasDoc && !dirty && <a className="btn sm ghost" href={pdfHref} target="_blank" rel="noreferrer">Preview PDF</a>}
              {hasDoc && !dirty && publicLive && <a className="btn sm ghost" href={viewUrl} target="_blank" rel="noreferrer">Open client link</a>}
              <button type="button" className="btn sm solid" disabled={!hasDoc || dirty || working}
                title={dirty ? 'Save your changes first' : undefined} onClick={() => setMailOpen(true)}>
                {kind === 'audit' ? 'Prepare email' : 'Publish to client'}
              </button>
            </div>
          </div>

          {mode === 'edit'
            ? <textarea className="studio-edit" value={content} spellCheck
                onChange={e => { setContent(e.target.value); setDirty(true); }} aria-label="Document text" />
            : hasDoc
              ? <article className="studio-prose" dangerouslySetInnerHTML={{ __html: html }} />
              : <div className="studio-empty">
                  <h4>{kind === 'audit' ? 'Your audit builds here' : 'The plan builds here'}</h4>
                  <p>Answer the questions on the left. The document writes itself as you go, and you can ask for a draft at any point.</p>
                </div>}
        </section>
      </div>

      {mailOpen && (
        <MailSheet kind={kind} id={doc.id} to={ownerEmail} first={first} company={company}
          seed={doc.email ?? defaultEmail(kind, first)} pdfHref={pdfHref}
          onClose={() => setMailOpen(false)}
          onDone={() => { setMailOpen(false); setDoc(d => ({ ...d, status: kind === 'plan' ? 'published' : 'sent', done_at: new Date().toISOString() })); }} />
      )}
    </div>
  );
}

/* The email that carries the document. Nothing is sent until the button is
   pressed and confirmed; the PDF is built from the saved text at that moment. */
function MailSheet({ kind, id, to, first, company, seed, pdfHref, onClose, onDone }: {
  kind: Kind; id: string; to: string | null; first: string; company: string | null;
  seed: EmailDraft; pdfHref: string; onClose: () => void; onDone: () => void;
}) {
  const [addr, setAddr] = useState(to ?? '');
  const [subject, setSubject] = useState(seed.subject);
  const [body, setBody] = useState(seed.body);
  const [link, setLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const word = kind === 'audit' ? 'audit' : 'plan';
  const pdfName = `${kind === 'audit' ? 'Business Audit' : '90-Day Success Plan'}${company ? `, ${company}` : ''}.pdf`;

  async function saveDraft() {
    const { ok, d } = await post({ action: 'save', kind, id, email: { subject, body } });
    if (!ok) { toast.bad(d.error ?? 'That did not save.'); return false; }
    return true;
  }
  async function go() {
    if (!addr.includes('@')) { toast.bad('Add an email address to send to.'); return; }
    const ask = kind === 'audit' ? `Email this audit to ${addr}?` : `Publish this plan and email it to ${addr}? The client link opens as soon as it is sent.`;
    if (!confirm(ask)) return;
    setBusy(true);
    const { ok, d } = await post({ action: kind === 'audit' ? 'send' : 'publish', kind, id, to: addr, subject, body, include_link: link });
    setBusy(false);
    if (!ok) { toast.bad(d.error ?? 'The email did not send.'); return; }
    toast.saved(kind === 'audit' ? `Audit sent to ${addr}` : `Plan published and sent to ${addr}`);
    onDone();
  }

  return (
    <Overlay onClose={onClose} label={kind === 'audit' ? 'Prepare email' : 'Publish to client'}>
      <div className="card-head">
        <h3>{kind === 'audit' ? 'Your audit email' : 'Publish the plan'}</h3>
        <button type="button" className="x-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <p className="small muted" style={{ marginTop: 0, marginBottom: 18, maxWidth: 560 }}>
        Read it once more. To change the wording, close this and ask in the chat. Nothing is sent until you confirm.
      </p>
      <div className="ff"><label htmlFor="ms-to">To</label>
        <input id="ms-to" type="email" value={addr} onChange={e => setAddr(e.target.value)} placeholder="name@company.com" /></div>
      <div className="ff"><label htmlFor="ms-sub">Subject</label>
        <input id="ms-sub" value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div className="ff"><label htmlFor="ms-body">Message</label>
        <textarea id="ms-body" rows={9} value={body} onChange={e => setBody(e.target.value)} /></div>
      <div className="studio-attach">
        <span>{pdfName}</span>
        <a href={pdfHref} target="_blank" rel="noreferrer">Preview</a>
      </div>
      <label className="check-line" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={link} onChange={e => setLink(e.target.checked)} />
        <span>Include a private link to read the {word} online</span>
      </label>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        <button className="btn solid" disabled={busy} onClick={go}>
          {busy ? 'Sending…' : kind === 'audit' ? `Send to ${first || 'them'}` : `Publish and email ${first || 'them'}`}
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={async () => { if (await saveDraft()) { toast.saved('Draft saved'); onClose(); } }}>Save draft</button>
      </div>
    </Overlay>
  );
}
