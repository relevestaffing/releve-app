'use client';
import { useState } from 'react';
import Overlay from './Overlay';
import { toast, saving } from './Toast';
import { PLAN_PATHS, auditStatusLabel } from '@/lib/audits-public';
import type { Audit, AuditInputs, PlanPath, AuditStatus } from '@/lib/audits-public';

/* The business audit builder, on a lead's page. Fill a few key points after
   the discovery call, Claude writes the audit, review and edit it here, then
   send the prospect a private branded link. */

type Row = { id: string; title: string; status: AuditStatus; view_token: string; created_at: string };

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

export default function AuditDesk({ prospectId, email, website, elivateMember, audits, aiOn, siteUrl }: {
  prospectId: string; email: string | null; website: string | null;
  elivateMember: boolean; audits: Audit[]; aiOn: boolean; siteUrl: string;
}) {
  const [rows, setRows] = useState<Row[]>(audits.map(a => ({
    id: a.id, title: a.title, status: a.status, view_token: a.view_token, created_at: a.created_at
  })));
  const [building, setBuilding] = useState(false);     // the key-points form is open
  const [writing, setWriting] = useState(false);       // Claude is drafting
  const [editing, setEditing] = useState<null | { id: string; title: string; content: string; token: string; status: AuditStatus }>(null);

  const linkFor = (token: string) => `${siteUrl}/audit/${token}`;

  async function generate(inputs: AuditInputs) {
    setWriting(true);
    let res: Response, d: any = {};
    try {
      res = await fetch('/api/admin/audits', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'draft', prospect_id: prospectId, inputs })
      });
      d = await res.json().catch(() => ({}));
    } catch { setWriting(false); toast.bad('No connection, so nothing was written.'); return; }
    if (!res.ok) { setWriting(false); toast.bad(d.error ?? 'The audit could not be written.'); return; }
    setRows(rs => [{ id: d.id, title: d.title, status: 'draft', view_token: d.token, created_at: new Date().toISOString() }, ...rs]);
    let title = d.title as string, content = d.content as string;
    if (d.pending) {
      /* Claude writes it in the background; check every few seconds, for up
         to five minutes. */
      const until = Date.now() + 5 * 60 * 1000;
      let done = false;
      while (Date.now() < until) {
        await new Promise(r => setTimeout(r, 4000));
        try {
          const r = await fetch(`/api/admin/audits?id=${encodeURIComponent(d.id)}`);
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.audit?.state === 'error') {
            setWriting(false);
            setRows(rs => rs.map(x => x.id === d.id ? { ...x, title: j.audit.title } : x));
            toast.bad(j.audit.error ?? 'The audit could not be written.');
            return;
          }
          if (r.ok && j.audit?.content) { title = j.audit.title; content = j.audit.content; done = true; break; }
        } catch { /* keep waiting */ }
      }
      if (!done) {
        setWriting(false); setBuilding(false);
        toast.bad('Still writing. It will appear in this list shortly; refresh in a minute.');
        return;
      }
    }
    setWriting(false);
    setBuilding(false);
    setRows(rs => rs.map(x => x.id === d.id ? { ...x, title } : x));
    setEditing({ id: d.id, title, content, token: d.token, status: 'draft' });
    toast.saved('Audit drafted');
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="crumb">Business audits</div>
          <h3>Audits</h3>
        </div>
        {aiOn
          ? <button className="btn sm solid" onClick={() => setBuilding(true)}>New business audit</button>
          : <span className="src-pill" title="Add ANTHROPIC_API_KEY in Netlify to turn this on">AI key needed</span>}
      </div>

      {!aiOn && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Audits are written by Claude inside your console. Add your Anthropic API key
          (ANTHROPIC_API_KEY) in Netlify to switch this on, the same way the payout keys work.
        </p>
      )}

      {rows.length === 0 && aiOn && <p className="small muted" style={{ marginTop: 0 }}>No audits yet. After a discovery call, write one from the key points.</p>}

      {rows.length > 0 && (
        <div className="audit-list">
          {rows.map(r => (
            <div key={r.id} className="audit-row">
              <div style={{ minWidth: 0 }}>
                <b className="lead-name" style={{ whiteSpace: 'normal' }}>{r.title}</b>
                <div className="lead-sub">{fmtDate(r.created_at)}</div>
              </div>
              <span className={`pill ${r.status === 'sent' ? 'ok' : ''}`}>{auditStatusLabel(r.status)}</span>
              <div className="lead-actions">
                <button className="btn sm ghost" onClick={() => openEditor(r)}>Edit</button>
                <a className="btn sm ghost" href={linkFor(r.view_token)} target="_blank" rel="noreferrer">Open</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {building && <KeyPointsForm website={website} elivateMember={elivateMember} writing={writing}
        onClose={() => !writing && setBuilding(false)} onGenerate={generate} />}

      {editing && <Editor state={editing} email={email} link={linkFor(editing.token)}
        onClose={() => setEditing(null)}
        onSaved={(title) => setRows(rs => rs.map(r => r.id === editing.id ? { ...r, title } : r))}
        onSent={() => setRows(rs => rs.map(r => r.id === editing.id ? { ...r, status: 'sent' } : r))} />}
    </div>
  );

  async function openEditor(r: Row) {
    // Pull the latest content for this audit before editing.
    try {
      const res = await fetch(`/api/admin/audits?id=${encodeURIComponent(r.id)}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.audit) {
        setEditing({ id: r.id, title: d.audit.title, content: d.audit.content, token: r.view_token, status: r.status });
        return;
      }
    } catch { /* fall through */ }
    toast.bad('Could not open that audit.');
  }
}

/* ---------- the key points ---------- */
function KeyPointsForm({ website, elivateMember, writing, onClose, onGenerate }: {
  website: string | null; elivateMember: boolean; writing: boolean;
  onClose: () => void; onGenerate: (i: AuditInputs) => void;
}) {
  const [plan, setPlan] = useState<PlanPath>('starter_then_essential');
  const [elivate, setElivate] = useState(elivateMember);
  const [site, setSite] = useState(website ?? '');
  const [today, setToday] = useState('');
  const [offer, setOffer] = useState('');
  const [goals, setGoals] = useState('');
  const [notes, setNotes] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onGenerate({ plan, elivate, website: site || undefined, today, offer, goals, notes });
  }

  return (
    <Overlay onClose={onClose} label="New business audit">
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-head">
          <div><div className="crumb">After the discovery call</div><h3>New business audit</h3></div>
          {!writing && <button type="button" className="x-btn" aria-label="Close" onClick={onClose}>×</button>}
        </div>
        <form onSubmit={submit}>
          <div className="ff"><label>Recommended plan</label>
            <select value={plan} onChange={e => setPlan(e.target.value as PlanPath)}>
              {PLAN_PATHS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <span className="xs muted">{PLAN_PATHS.find(p => p.key === plan)?.hint}</span>
          </div>
          <label className="check-line">
            <input type="checkbox" checked={elivate} onChange={e => setElivate(e.target.checked)} />
            <span>eLIVate Club member (applies the $500-off discount)</span>
          </label>
          <div className="ff"><label>Their website</label>
            <input value={site} onChange={e => setSite(e.target.value)} placeholder="refynity.co" /></div>
          <div className="ff"><label>What they have today</label>
            <textarea rows={3} value={today} onChange={e => setToday(e.target.value)}
              placeholder="What they pay now, what they get, and the gaps. e.g. $600/mo for ~4 posts a week, low editing, ~40 followers, no outreach." /></div>
          <div className="ff"><label>What they sell, and their ideal client</label>
            <textarea rows={2} value={offer} onChange={e => setOffer(e.target.value)}
              placeholder="e.g. Trains the managers inside growing companies; buyers are decision makers at growing companies." /></div>
          <div className="ff"><label>What they want more of</label>
            <textarea rows={2} value={goals} onChange={e => setGoals(e.target.value)}
              placeholder="e.g. A full calendar of discovery calls, a polished brand presence." /></div>
          <div className="ff"><label>Anything else from the call</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional. Anything worth weaving in." /></div>
          <button className="btn solid" disabled={writing}>{writing ? 'Writing the audit…' : 'Write the audit'}</button>
          {writing && <p className="xs muted" style={{ marginTop: 10 }}>Claude is writing it now. This takes a minute or two. You can keep this open.</p>}
        </form>
      </div>
    </Overlay>
  );
}

/* ---------- review, edit, send ---------- */
function Editor({ state, email, link, onClose, onSaved, onSent }: {
  state: { id: string; title: string; content: string; status: AuditStatus };
  email: string | null; link: string;
  onClose: () => void; onSaved: (title: string) => void; onSent: () => void;
}) {
  const [title, setTitle] = useState(state.title);
  const [content, setContent] = useState(state.content);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(state.status === 'sent');

  async function save() {
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/audits', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save', id: state.id, title, content })
    }), 'Saved');
    setBusy(false);
    if (ok) onSaved(title);
    return ok;
  }

  async function sendIt() {
    if (!email) { toast.bad('This lead has no email on file.'); return; }
    if (!confirm(`Email this audit to ${email}?`)) return;
    const okSave = await save();
    if (!okSave) return;
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/audits', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'send', id: state.id })
    }), `Sent to ${email}`);
    setBusy(false);
    if (ok) { setSent(true); onSent(); }
  }

  function copyLink() {
    navigator.clipboard?.writeText(link).then(() => toast.saved('Link copied'), () => toast.bad('Could not copy.'));
  }

  return (
    <Overlay onClose={onClose} label="Edit audit">
      <div className="card audit-editor" style={{ marginBottom: 0 }}>
        <div className="card-head">
          <div><div className="crumb">{sent ? 'Sent' : 'Draft'}</div><h3>Review and send</h3></div>
          <button type="button" className="x-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="ff"><label>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="ff"><label>The audit</label>
          <textarea className="audit-text" rows={18} value={content} onChange={e => setContent(e.target.value)} />
          <span className="xs muted">This is the audit's wording. Open the link to see it formatted for the client.</span></div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn solid" disabled={busy} onClick={save}>{busy ? 'Working…' : 'Save'}</button>
          <a className="btn ghost" href={link} target="_blank" rel="noreferrer">Open the link</a>
          <button type="button" className="btn ghost" onClick={copyLink}>Copy link</button>
          <button className="btn solid" disabled={busy || !email} onClick={sendIt} style={{ marginLeft: 'auto' }}>
            {sent ? 'Send again' : email ? `Send to ${email}` : 'No email on file'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
