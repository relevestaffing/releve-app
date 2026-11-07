'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { todayInPacific } from '@/lib/money-public';

type State = 'not_started' | 'submitted' | 'verified' | 'rejected';

/* The Client Services Agreement's per-executive-row status on /console/people.
   The executive reads and signs it in their own account (/app/agreement), and
   it files itself the moment they do. This row shows where it stands, and keeps
   one fallback: file a paper copy that came back signed some other way. */
export default function ClientAgreementAdmin({ clientId, state, rejectReason }: {
  clientId: string; state: State; rejectReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState(todayInPacific());
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    body.append('client_id', clientId);
    body.append('signed_on', signed);
    try {
      const res = await fetch('/api/agreement/upload', { method: 'POST', body });
      const out = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(out.error ?? 'Upload failed. Please try again.');
      toast.saved('Filed as signed');
      router.refresh();
    } catch (e: any) { toast.bad(e.message); }
    finally { setBusy(false); }
  }

  if (state === 'verified') {
    return <span className="pill good"><span className="dot" />Agreement signed</span>;
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="pill warn"><span className="dot" />Awaiting their signature</span>
      {state === 'rejected' && rejectReason && (
        <span className="xs muted" title={rejectReason}>Sent back</span>
      )}
      <details>
        <summary className="xs muted" style={{ cursor: 'pointer' }}>File a paper copy instead</summary>
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <label className="xs muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            Signed on
            <input type="date" value={signed} onChange={e => setSigned(e.target.value)} style={{ padding: '2px 6px' }} />
          </label>
          <input aria-label="Signed Client Services Agreement" ref={input} type="file" accept="application/pdf" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          <button className="btn sm ghost" disabled={busy || !signed} onClick={() => input.current?.click()}>
            {busy ? 'Filing…' : 'Upload signed Client Services Agreement'}
          </button>
        </div>
      </details>
    </div>
  );
}
