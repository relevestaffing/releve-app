'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';

/* The business audits on a lead's page. Each one opens in the Audit Studio,
   where Claude interviews, the audit writes itself and the email that carries
   it is prepared. This is only the list and the way in. */
type Row = { id: string; title: string; status: 'draft' | 'sent'; created_at: string; done_at: string | null };

const fmt = (iso: string | null) => {
  try { return iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch { return ''; }
};

export default function AuditDesk({ prospectId, audits, aiOn }: { prospectId: string; audits: Row[]; aiOn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    let res: Response, d: any = {};
    try {
      res = await fetch('/api/admin/studio', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', kind: 'audit', lead_id: prospectId })
      });
      d = await res.json().catch(() => ({}));
    } catch { setBusy(false); toast.bad('No connection, so nothing was started.'); return; }
    if (!res.ok) { setBusy(false); toast.bad(d.error ?? 'The studio could not open.'); return; }
    router.push(`/console/audit/${d.id}`);
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="crumb">After the discovery call</div>
          <h3>Business audit</h3>
        </div>
        <button className="btn sm solid" disabled={busy || !aiOn} onClick={start}
          title={aiOn ? undefined : 'Add ANTHROPIC_API_KEY in Netlify to turn this on'}>
          {busy ? 'Opening…' : audits.length ? 'Start another audit' : 'Build the audit'}
        </button>
      </div>
      {!aiOn && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Claude interviews you and writes the audit once your Anthropic API key (ANTHROPIC_API_KEY) is in Netlify.
        </p>
      )}
      {audits.length === 0 && aiOn && (
        <p className="small muted" style={{ marginTop: 0 }}>
          No audit yet. The Audit Studio asks what it needs, builds the audit beside the chat and prepares the email with the PDF attached.
        </p>
      )}
      {audits.length > 0 && (
        <div className="audit-list">
          {audits.map(r => (
            <div key={r.id} className="audit-row">
              <div style={{ minWidth: 0 }}>
                <b className="lead-name" style={{ whiteSpace: 'normal' }}>{r.title}</b>
                <div className="lead-sub">{r.status === 'sent' ? `Sent ${fmt(r.done_at)}` : `Draft, ${fmt(r.created_at)}`}</div>
              </div>
              <div className="lead-actions">
                <Link className="btn sm ghost" href={`/console/audit/${r.id}`}>Open in the studio</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
