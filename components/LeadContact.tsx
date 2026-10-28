'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { PROSPECT_SOURCES, sourceLabel } from '@/lib/prospects-public';
import type { Prospect } from '@/lib/prospects-public';

/* The contact block on a lead's page: the details, and an inline edit. Saves
   through the same prospects route the board uses. */
export default function LeadContact({ lead }: { lead: Prospect }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    full_name: lead.full_name, org_name: lead.org_name ?? '',
    email: lead.email, website: lead.website ?? '', source: lead.source
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/prospects', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: lead.id, ...f })
    }), 'Saved');
    setBusy(false);
    if (ok) { setEditing(false); router.refresh(); }
  }

  const site = (lead.website ?? '').trim();
  const siteHref = site ? (site.startsWith('http') ? site : `https://${site}`) : '';

  if (!editing) {
    return (
      <div className="card">
        <div className="card-head">
          <div><div className="crumb">Lead</div><h3>Contact</h3></div>
          <button className="btn sm ghost" onClick={() => setEditing(true)}>Edit</button>
        </div>
        <dl className="kv">
          <dt>Name</dt><dd>{lead.full_name}</dd>
          {lead.org_name && <><dt>Company</dt><dd>{lead.org_name}</dd></>}
          <dt>Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <span className="muted">none</span>}</dd>
          <dt>Website</dt><dd>{siteHref ? <a href={siteHref} target="_blank" rel="noreferrer">{site}</a> : <span className="muted">none</span>}</dd>
          <dt>Source</dt><dd>{sourceLabel(lead.source)}</dd>
          {lead.call_at && <><dt>Discovery call</dt><dd>{new Date(lead.call_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</dd></>}
        </dl>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {lead.email && <a className="btn sm solid" href={`mailto:${lead.email}`}>Email them</a>}
          {siteHref && <a className="btn sm ghost" href={siteHref} target="_blank" rel="noreferrer">Open website</a>}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head"><div><div className="crumb">Lead</div><h3>Edit contact</h3></div>
        <button className="x-btn" aria-label="Close" onClick={() => setEditing(false)}>×</button></div>
      <form onSubmit={save}>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="ff"><label>Name</label><input value={f.full_name} required onChange={e => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="ff"><label>Company</label><input value={f.org_name} onChange={e => setF({ ...f, org_name: e.target.value })} /></div>
          <div className="ff"><label>Email</label><input type="email" value={f.email} required onChange={e => setF({ ...f, email: e.target.value })} /></div>
          <div className="ff"><label>Website</label><input value={f.website} onChange={e => setF({ ...f, website: e.target.value })} placeholder="refynity.co" /></div>
          <div className="ff"><label>Source</label>
            <select value={f.source} onChange={e => setF({ ...f, source: e.target.value as Prospect['source'] })}>
              {PROSPECT_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
