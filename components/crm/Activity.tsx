'use client';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, Icon, cleanName, whenWords, dueWords, addDays, PaneFoot, type Member } from './kit';
import { toast } from '../Toast';

/* The history of one lead, executive or talent, and the box to add to it
   (2 November 2026). A note can name a teammate with @, which tells them on
   their phone. For a lead, a logged call, email, message or meeting also
   moves "last touched" and can set the next follow-up. */

export type Item = {
  id: string; at: string; by: string | null; kind: string;
  body: string | null; meta: Record<string, any>; mentions: string[]; source: 'activity' | 'touch';
};
type Kind = 'note' | 'call' | 'email' | 'meeting' | 'message';
const KINDS: { key: Kind; label: string; icon: () => React.ReactElement }[] = [
  { key: 'note', label: 'Comment', icon: Icon.chat },
  { key: 'call', label: 'Call', icon: Icon.phone },
  { key: 'email', label: 'Email', icon: Icon.mail },
  { key: 'meeting', label: 'Meeting', icon: Icon.meet },
  { key: 'message', label: 'Message', icon: Icon.note }
];
const ICON: Record<string, () => React.ReactElement> = {
  call: Icon.phone, email: Icon.mail, meeting: Icon.meet, message: Icon.note, note: Icon.chat,
  stage: Icon.swap, owner: Icon.user, follow_up: Icon.cal, created: Icon.spark, field: Icon.note
};

export function Activity({ type, id, subjectName, team, today, stageLabel, onTouched, refreshKey = 0 }: {
  type: 'prospect' | 'client' | 'talent'; id: string; subjectName: string; team: Member[]; today: string;
  stageLabel?: (k: string) => string; onTouched?: (next: string | null) => void; refreshKey?: number;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [ready, setReady] = useState(true);
  const [kind, setKind] = useState<Kind>('note');
  const [text, setText] = useState('');
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mention, setMention] = useState<{ q: string; at: number } | null>(null);
  const [picked, setPicked] = useState<Member[]>([]);
  const ta = useRef<HTMLTextAreaElement>(null);

  const nameOf = (uid: string | null) => {
    if (!uid) return null;
    const m = team.find(t => t.user_id === uid);
    return m ? cleanName(m.name) : 'A teammate';
  };

  useEffect(() => {
    let live = true;
    /* keep what is on screen while the newer history loads: no flash */
    fetch(`/api/admin/activity?type=${type}&id=${encodeURIComponent(id)}`)
      .then(r => r.json()).then(d => { if (!live) return; setItems(d.items ?? []); setReady(d.ready !== false); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [type, id, refreshKey]);
  /* a different person: start clean */
  useEffect(() => { setItems(null); }, [type, id]);

  /* @ opens a list of the team; picking one writes "@Name" into the text */
  function onType(v: string, caret: number) {
    setText(v);
    const upto = v.slice(0, caret);
    const m = upto.match(/(^|\s)@([\p{L} ]{0,24})$/u);
    setMention(m ? { q: m[2], at: caret - m[2].length - 1 } : null);
  }
  const options = useMemo(() => {
    if (!mention) return [];
    const q = mention.q.trim().toLowerCase();
    return team.filter(t => cleanName(t.name).toLowerCase().includes(q)).slice(0, 6);
  }, [mention, team]);
  function pick(m: Member) {
    if (!mention) return;
    const name = cleanName(m.name);
    const before = text.slice(0, mention.at), after = text.slice(mention.at + 1 + mention.q.length);
    const v = `${before}@${name} ${after.replace(/^\s+/, '')}`;
    setText(v); setMention(null);
    setPicked(p => (p.find(x => x.user_id === m.user_id) ? p : [...p, m]));
    requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); const c = before.length + name.length + 2; el.setSelectionRange(c, c); } });
  }

  async function submit() {
    const body = text.trim();
    if (!body && kind === 'note') return;
    const mentions = picked.filter(m => text.includes(`@${cleanName(m.name)}`)).map(m => m.user_id);
    setBusy(true);
    try {
      const r = await fetch('/api/admin/activity', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, id, kind, body, mentions, next_follow_up: next, subject_name: subjectName })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ?? 'That did not save.'); setBusy(false); return; }
      const now = new Date().toISOString();
      setItems(list => [{ id: `local-${now}`, at: now, by: '__me', kind, body, meta: next ? { next_follow_up: next } : {}, mentions, source: kind === 'note' ? 'activity' : 'touch' }, ...(list ?? [])]);
      if (kind !== 'note') onTouched?.(next);
      toast.saved(mentions.length ? `Posted, and ${mentions.length === 1 ? nameOf(mentions[0]) : `${mentions.length} people`} told` : kind === 'note' ? 'Comment posted' : `${KINDS.find(k => k.key === kind)?.label} logged`);
      setText(''); setNext(null); setPicked([]);
    } catch { toast.bad('No connection, so nothing was saved.'); }
    setBusy(false);
  }

  const render = (body: string) => {
    const names = team.map(t => cleanName(t.name)).sort((a, b) => b.length - a.length);
    if (!names.length) return body;
    const re = new RegExp(`(@(?:${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
    return body.split(re).map((part, i) => (part.startsWith('@') && names.includes(part.slice(1)) ? <span key={i} className="at">{part}</span> : part));
  };

  const line = (it: Item) => {
    const who = it.by === '__me' ? 'You' : nameOf(it.by) ?? 'Relève';
    const b = <b>{who}</b>;
    switch (it.kind) {
      case 'stage': return <>{b} moved this to <b>{stageLabel ? stageLabel(it.meta?.to) : it.meta?.to}</b></>;
      case 'owner': return it.meta?.to ? <>{b} assigned this to <b>{nameOf(it.meta.to)}</b></> : <>{b} unassigned this</>;
      case 'follow_up': return it.meta?.to ? <>{b} set the follow-up to <b>{dueWords(it.meta.to, today).text}</b></> : <>{b} cleared the follow-up</>;
      case 'created': return <>{it.by ? b : <b>Relève</b>} added this record{it.meta?.source ? ` from ${it.meta.source}` : it.meta?.via ? ` from ${it.meta.via}` : ''}</>;
      case 'field': return <>{b} edited the {String(it.meta?.field ?? 'details').replace(/_/g, ' ')}</>;
      case 'call': return <>{b} logged a call</>;
      case 'email': return <>{b} logged an email</>;
      case 'meeting': return <>{b} logged a meeting</>;
      case 'message': return <>{b} logged a message</>;
      default: return <>{b} commented</>;
    }
  };

  const quick: [string, string][] = [['Tomorrow', addDays(today, 1)], ['3 days', addDays(today, 3)], ['1 week', addDays(today, 7)]];

  const foot = useContext(PaneFoot);
  const expanded = !foot || focused || !!text.trim() || kind !== 'note';
  const composer = (
      <div className={`ws-compose${expanded ? '' : ' rest'}`} style={{ position: 'relative' }}
        onFocus={() => setFocused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}>
        {foot && <span className="me"><Avatar name="You" size="sm" /></span>}
        {expanded && <div className="kinds" role="tablist" aria-label="What to add">
          {KINDS.map(k => (
            <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} className={kind === k.key ? 'on' : ''}
              onClick={() => { setKind(k.key); ta.current?.focus(); }}><k.icon />{k.label}</button>
          ))}
        </div>}
        <textarea ref={ta} value={text} rows={expanded ? 2 : 1} aria-label="Write here"
          placeholder={kind === 'note' ? 'Add a comment. Type @ to bring in a teammate.' : `What was said on the ${KINDS.find(k => k.key === kind)?.label.toLowerCase()}?`}
          onChange={e => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={e => {
            if (mention && options.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pick(options[0]); return; }
            if (e.key === 'Escape' && mention) { e.stopPropagation(); setMention(null); return; }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
          }} />
        {mention && options.length > 0 && (
          <div className="ws-mention-list" style={foot ? { left: 12, bottom: '100%' } : { left: 12, top: '100%' }}>
            {options.map(o => (
              <button key={o.user_id} type="button" className="ws-opt" onMouseDown={e => { e.preventDefault(); pick(o); }}>
                <Avatar name={cleanName(o.name)} size="sm" />{cleanName(o.name)}
              </button>
            ))}
          </div>
        )}
        {expanded && <div className="foot">
          {type === 'prospect' && kind !== 'note' ? (
            <span className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              Next follow-up
              {quick.map(([l, v]) => (
                <button key={l} type="button" className={`ws-chip${next === v ? ' soon' : ' ph'}`} style={{ height: 24, border: next === v ? '1px solid rgba(78,122,92,.4)' : undefined }}
                  onClick={() => setNext(n => (n === v ? null : v))}>{l}</button>
              ))}
            </span>
          ) : <span className="hint">⌘ Enter to post</span>}
          <button type="button" className="btn sm solid" disabled={busy || (!text.trim() && kind === 'note')} onClick={submit}>
            {busy ? 'Saving…' : kind === 'note' ? 'Comment' : `Log ${KINDS.find(k => k.key === kind)?.label.toLowerCase()}`}
          </button>
        </div>}
      </div>
  );

  return (
    <div>
      {foot ? createPortal(composer, foot) : composer}
      {!ready && (
        <p className="ws-setup">The full history starts once the one-time database setup (part 59) has run. Until then, logged touches show here; stage and owner changes are not recorded yet.</p>
      )}

      <div className="ws-feed">
        {items === null && <p className="ws-faint" style={{ paddingLeft: 42 }}>Reading the history…</p>}
        {items && items.length === 0 && <p className="ws-faint" style={{ paddingLeft: 42 }}>Nothing yet. The first comment, call or change will start the history.</p>}
        {items && items.map(it => {
          const sys = ['stage', 'owner', 'follow_up', 'created', 'field'].includes(it.kind);
          const I = ICON[it.kind] ?? Icon.dot;
          const who = it.by === '__me' ? 'You' : nameOf(it.by);
          return (
            <div key={it.id} className={`ws-ev${sys ? ' sys' : ''}`}>
              {sys || !who ? <span className="ic"><I /></span> : <span className="ic av"><Avatar name={who} size="" /></span>}
              <div className="bd">
                <div className="ln">{line(it)}<span className="when">{whenWords(it.at)}</span>
                  {!sys && it.kind !== 'note' && <span className="ws-tag" style={{ marginLeft: 8, height: 18, fontSize: 10 }}><I />&nbsp;{KINDS.find(k => k.key === it.kind)?.label}</span>}
                </div>
                {it.body && <div className="msg">{render(it.body)}</div>}
                {it.meta?.next_follow_up && <div className="ws-faint" style={{ marginTop: 6, fontSize: 12.5 }}>Next follow-up set for {dueWords(it.meta.next_follow_up, today).text}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
