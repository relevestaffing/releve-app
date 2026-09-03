'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VETTING_ITEMS, VETTING_WORDING, type Vetting } from '@/lib/work-public';
import { saving, toast } from './Toast';
import { fmtDate } from '@/lib/words';

type Row = Vetting & { talent?: { full_name: string | null; email: string; stage: string | null } };

export default function VettingReview({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);

  async function open(path: string) {
    const res = await fetch(`/api/vetting?path=${encodeURIComponent(path)}`);
    const d = await res.json();
    if (!res.ok) return toast.bad(d.error ?? 'Could not open that.');
    window.open(d.url, '_blank', 'noopener');
  }

  async function decide(id: string, verdict: 'verified' | 'rejected', reason?: string, expires?: string,
                        talentId?: string, kind?: string) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/vetting', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, verdict, reason, expires_on: expires, talent_id: talentId, kind })
    }), verdict === 'verified' ? 'Verified' : 'Sent back');
    setBusy(false); setRejecting(null);
    if (ok) router.refresh();
  }

  const waiting = rows.filter(r => r.state === 'submitted');
  const rest = rows.filter(r => r.state !== 'submitted');
  const labelOf = (k: string) => VETTING_ITEMS.find(i => i.kind === k)?.label ?? k;

  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Waiting on you</h3>
          <span className={`pill ${waiting.length ? 'warn' : 'good'}`}>
            {waiting.length ? waiting.length : <><span className="dot" />Clear</>}</span></div>
        {waiting.length === 0 ? (
          <div className="empty"><span className="tick" /><p className="small">Nothing waiting. Documents appear here the moment someone uploads one.</p></div>
        ) : waiting.map(r => (
          <div className="vet-item" key={r.id}>
            <div className="row between" style={{ gap: 14, flexWrap: 'wrap' }}>
              <div>
                <h4>{r.talent?.full_name ?? r.talent?.email ?? 'Candidate'}</h4>
                <p className="small muted" style={{ margin: '3px 0 0' }}>
                  {labelOf(r.kind)}
                  {r.submitted_at && ` · sent ${new Date(r.submitted_at)
                    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                  {r.expires_on && ` · expires ${fmtDate(r.expires_on)}`}
                </p>
              </div>
              <div className="vet-doc">
                {r.file_path && (
                  <button className="btn sm ghost" onClick={() => open(r.file_path!)}>
                    Open {r.file_name ?? 'document'}
                  </button>
                )}
                <button className="btn sm solid" disabled={busy}
                  onClick={() => decide(r.id, 'verified', undefined, r.expires_on ?? undefined, r.talent_id, r.kind)}>Verify</button>
                <button className="btn sm ghost" disabled={busy}
                  onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>Needs another go</button>
              </div>
            </div>
            {rejecting === r.id && (
              <form className="decide-form" style={{ marginTop: 14 }}
                onSubmit={e => { e.preventDefault();
                  const v = new FormData(e.currentTarget).get('reason');
                  decide(r.id, 'rejected', String(v ?? ''), undefined, r.talent_id, r.kind); }}>
                <div className="ff"><label>What do they need to fix?</label>
                  <input name="reason" required
                    placeholder="The photo is cut off — we need to see all four corners." /></div>
                <p className="xs muted" style={{ marginBottom: 10 }}>They see this word for word, so make it useful.</p>
                <button className="btn solid" disabled={busy}>Send it back</button>
              </form>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3>Everything else</h3><span className="pill">{rest.length}</span></div>
        {rest.length === 0 ? (
          <div className="empty"><span className="tick" /><p className="small">No decisions recorded yet.</p></div>
        ) : (
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Candidate</th><th>Document</th><th>State</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {rest.map(r => (
                <tr key={r.id}>
                  <td><b>{r.talent?.full_name ?? r.talent?.email ?? '—'}</b></td>
                  <td className="small">{labelOf(r.kind)}</td>
                  <td><span className={`pill ${r.state === 'verified' ? 'good' : r.state === 'rejected' ? 'crit' : ''}`}>
                    {r.state === 'verified' && <span className="dot" />}{VETTING_WORDING[r.state]}</span></td>
                  <td className="small muted">{fmtDate(r.expires_on)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {r.file_path && <button className="btn sm ghost" onClick={() => open(r.file_path!)}>Open</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
