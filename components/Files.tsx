'use client';
import { useRef, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import type { Doc, OwnerKind } from '@/lib/documents-public';
import { docSize } from '@/lib/documents-public';

/* The Files card on a record (25 October 2026). Upload, open, remove.
   Nothing clever: a filing cabinet drawer with a label on each folder. */
export default function Files({ kind, ownerId, docs }: { kind: OwnerKind; ownerId: string; docs: Doc[] }) {
  const router = useRouter();
  const fid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.set('file', file); fd.set('owner_kind', kind); fd.set('owner_id', ownerId); fd.set('label', label);
    let r: Response, d: any = {};
    try { r = await fetch('/api/admin/documents', { method: 'POST', body: fd }); d = await r.json().catch(() => ({})); }
    catch { setBusy(false); toast.bad('No connection, so nothing was uploaded.'); return; }
    setBusy(false);
    if (!r.ok) { toast.bad(d.error ?? 'Could not upload.'); return; }
    toast.saved('Filed');
    setLabel('');
    if (input.current) input.current.value = '';
    router.refresh();
  }

  const [removing, setRemoving] = useState<string | null>(null);
  async function remove(doc: Doc) {
    setBusy(true);
    const r = await fetch('/api/admin/documents', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: doc.id }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast.bad('Could not remove it.'); return; }
    toast.saved('Removed');
    router.refresh();
  }

  const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="card">
      <div className="card-head"><h3>Files</h3><span className="pill">{docs.length}</span></div>
      {docs.length === 0
        ? <p className="small muted" style={{ marginBottom: 16 }}>Nothing on file yet.</p>
        : (
          <table className="data" style={{ boxShadow: 'none', marginBottom: 16 }}>
            <thead><tr><th>File</th><th>Added</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td>
                    <a href={`/api/admin/documents/view?id=${d.id}`} target="_blank" rel="noopener">
                      <b>{d.label || d.name}</b></a>
                    <div className="xs muted">{d.label ? `${d.name} · ` : ''}{docSize(d.bytes)}</div>
                  </td>
                  <td className="small muted">{when(d.uploaded_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {removing === d.id ? (
                      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn sm" disabled={busy} onClick={() => { setRemoving(null); remove(d); }}>Yes, remove</button>
                        <button className="btn sm ghost" onClick={() => setRemoving(null)}>Keep</button>
                      </span>
                    ) : (
                      <button className="btn sm ghost" disabled={busy} onClick={() => setRemoving(d.id)}>Remove</button>
                    )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="ff" style={{ flex: '1 1 220px', margin: 0 }}>
          <label htmlFor={`${fid}-l`} className="xs muted">What it is</label>
          <input id={`${fid}-l`} value={label} onChange={e => setLabel(e.target.value)}
            placeholder="NDA addendum, W-8BEN, SOP for the inbox" />
        </div>
        <input ref={input} id={`${fid}-f`} type="file" hidden
          accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <button className="btn sm solid" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Filing…' : 'Add a file'}</button>
      </div>
    </div>
  );
}
