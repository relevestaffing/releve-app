'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import CountersignButton from './CountersignButton';

type State = 'not_started' | 'submitted' | 'verified' | 'rejected';

/* The Client Services Agreement's per-executive-row action on
   /console/people — the same three states IssueAgreement shows for
   talent, compressed onto one row: send it, wait for your turn to
   countersign, or done. */
export default function ClientAgreementAdmin({ clientId, state, docusignOn, rejectReason }: {
  clientId: string; state: State; docusignOn?: boolean; rejectReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch('/api/agreement/docusign', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId })
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'DocuSign would not send that.');
      toast.saved('Sent — they can sign from their own dashboard');
      router.refresh();
    } catch (e: any) { toast.bad(e.message); }
    finally { setBusy(false); }
  }

  if (!docusignOn) {
    return <span className="xs muted">Client Services Agreement: DocuSign not switched on for this yet.</span>;
  }
  if (state === 'verified') {
    return <span className="pill good"><span className="dot" />Agreement signed</span>;
  }
  if (state === 'submitted') {
    return (
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span className="pill warn"><span className="dot" />Agreement: waiting on a signature</span>
        <CountersignButton kind="client" id={clientId} label="Countersign" />
      </div>
    );
  }
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      {state === 'rejected' && rejectReason && (
        <span className="xs muted" title={rejectReason}>Needs another go — </span>
      )}
      <button className="btn sm ghost" disabled={busy} onClick={send}>
        {busy ? 'Sending…' : 'Send Client Services Agreement'}
      </button>
    </div>
  );
}
