'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';

/* Paying the whole run in one Wise upload.
   ----------------------------------------
   Two steps, in the order they actually happen, and never collapsed into one
   button: download the file, upload and approve it inside Wise, then come
   back and record that it went. The middle step is a person in Wise, which is
   the point — Relève holds no Wise credential and nothing here moves money.

   Recording the batch emails every person in it to say their money is on the
   way, so the second step asks before it fires. */
export default function WiseBatch({ count, skipped }: {
  count: number;
  skipped: { name: string; why: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reference, setReference] = useState('');

  if (count === 0 && skipped.length === 0) return null;

  async function markSent() {
    setBusy(true);
    try {
      const r = await fetch('/api/payout/batch', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.bad(d.error ?? 'That did not record.'); setBusy(false); return; }
      toast.saved(
        `${d.marked} recorded as paid${d.notified ? `, ${d.notified} told by email` : ''}`
      );
      if (d.failed?.length) toast.bad(`Could not record: ${d.failed.join(', ')}`);
      setConfirming(false); setReference(''); setBusy(false);
      router.refresh();
    } catch {
      toast.bad('No connection. Nothing was recorded.');
      setBusy(false);
    }
  }

  return (
    <div className="card tight" style={{ marginBottom: 20 }}>
      <div className="card-head" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 19 }}>Pay this run in one Wise batch</h3>
        {count > 0 && <span className="pill"><span className="dot" />{count} ready</span>}
      </div>

      {count > 0 ? (
        <p className="small muted" style={{ maxWidth: 'var(--measure)', marginBottom: 16 }}>
          Download the file, upload it to Wise under <b>Batch payments</b>, approve it there,
          then come back and record it. Everyone receives their full amount: the file is
          fixed-target, so Wise takes its fee from Relève rather than from them.
        </p>
      ) : (
        <p className="small muted" style={{ maxWidth: 'var(--measure)', marginBottom: 16 }}>
          Nobody in this run can go in a Wise batch yet.
        </p>
      )}

      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        {count > 0 && (
          <a className="btn sm solid" href="/api/payout/batch" download>
            Download the Wise file
          </a>
        )}
        {count > 0 && !confirming && (
          <button className="btn sm ghost" disabled={busy} onClick={() => setConfirming(true)}>
            I have sent it in Wise
          </button>
        )}
      </div>

      {confirming && (
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <p className="small" style={{ maxWidth: 'var(--measure)', marginBottom: 14 }}>
            This records all <b>{count}</b> as paid and emails each person to say their
            money is on the way. Only do this once the batch has actually gone through in Wise.
          </p>
          <div className="ff" style={{ maxWidth: 360 }}>
            <label htmlFor="wise-ref">Wise reference <span className="muted">(optional)</span></label>
            <input id="wise-ref" value={reference} disabled={busy}
              placeholder="Batch reference from Wise"
              onChange={e => setReference(e.target.value)} />
            <span className="xs muted">Ties every one of these back to the one transfer in Wise.</span>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <button className="btn sm solid" disabled={busy} onClick={markSent}>
              {busy ? 'Recording…' : `Yes, record ${count} as paid`}
            </button>
            <button className="btn sm ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Who the file leaves out, and why — said here rather than discovered
          when somebody asks where their money is. */}
      {skipped.length > 0 && (
        <details className="row-more" style={{ marginTop: 16 }}>
          <summary>{skipped.length} not in the file</summary>
          <ul className="plain" style={{ paddingTop: 12 }}>
            {skipped.map((s, i) => (
              <li key={i} className="small">
                <b>{s.name}</b> · <span className="muted">{s.why}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
