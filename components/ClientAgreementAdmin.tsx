'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import CountersignButton from './CountersignButton';
import { todayInPacific } from '@/lib/money-public';

type State = 'not_started' | 'submitted' | 'verified' | 'rejected';

/* The Client Services Agreement's per-executive-row action on
   /console/people — the same three states IssueAgreement shows for
   talent, compressed onto one row: send it, wait for your turn to
   countersign, or done. While DocuSign is not switched on (the
   Integration Key is a developer-account key, not yet Go-Live'd — see
   lib/docusign.ts), this falls back to the same manual path the talent
   side has always had: Sage sends the agreement herself, however she
   likes, and files the signed PDF here once it comes back. Nothing about
   switching DocuSign on later changes this component — docusignOn alone
   decides which path shows. */
export default function ClientAgreementAdmin({ clientId, state, docusignOn, rejectReason }: {
  clientId: string; state: State; docusignOn?: boolean; rejectReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState(todayInPacific());
  const input = useRef<HTMLInputElement>(null);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch('/api/agreement/docusign', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId })
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'DocuSign would not send that.');
      toast.saved('Sent. They can sign from their own dashboard');
      router.refresh();
    } catch (e: any) { toast.bad(e.message); }
    finally { setBusy(false); }
  }

  async function upload(file: File) {
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    body.append('client_id', clientId);
    body.append('signed_on', signed);
    try {
      const res = await fetch('/api/agreement/upload', { method: 'POST', body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'That did not upload.');
      toast.saved('Filed as signed');
      router.refresh();
    } catch (e: any) { toast.bad(e.message); }
    finally { setBusy(false); }
  }

  if (state === 'verified') {
    return <span className="pill good"><span className="dot" />Agreement signed</span>;
  }
  if (docusignOn && state === 'submitted') {
    return (
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span className="pill warn"><span className="dot" />Agreement: waiting on a signature</span>
        <CountersignButton kind="client" id={clientId} label="Countersign" />
      </div>
    );
  }
  if (docusignOn) {
    return (
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {state === 'rejected' && rejectReason && (
          <span className="xs muted" title={rejectReason}>Needs another go: </span>
        )}
        <button className="btn sm ghost" disabled={busy} onClick={send}>
          {busy ? 'Sending…' : 'Send Client Services Agreement'}
        </button>
      </div>
    );
  }

  /* Manual path: no DocuSign API, so no send button and no countersign
     step here — Sage countersigns on paper or in DocuSign's web app
     herself, outside the app, same as she sends the whole thing. This row
     is only ever "file what came back signed." */
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {state === 'rejected' && rejectReason && (
        <span className="xs muted" title={rejectReason}>Needs another go: </span>
      )}
      <label className="xs muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        Signed on
        <input type="date" value={signed} onChange={e => setSigned(e.target.value)}
          style={{ padding: '2px 6px' }} />
      </label>
      <input aria-label="Signed Client Services Agreement" ref={input} type="file" accept="application/pdf" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      <button className="btn sm ghost" disabled={busy || !signed} onClick={() => input.current?.click()}>
        {busy ? 'Filing…' : 'Upload signed Client Services Agreement'}
      </button>
    </div>
  );
}
