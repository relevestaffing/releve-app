'use client';
import { useState } from 'react';
import { toast } from './Toast';

/* Sage's half of either agreement flow — one button, reused on both the
   talent (console/vetting) and client (console/people) sides. Posts to
   the shared admin countersign route and redirects straight into the
   embedded DocuSign view it returns. If it is genuinely not her turn yet
   (the other side has not signed), the route's own error surfaces here
   exactly as any other failed action would. */
export default function CountersignButton({ kind, id, label }: {
  kind: 'talent' | 'client'; id: string; label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/docusign/countersign', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, id })
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'Could not open that for signing.');
      window.location.href = out.url;
    } catch (e: any) {
      toast.bad(e.message);
      setBusy(false);
    }
  }

  return (
    <button className="btn sm solid" disabled={busy} onClick={go}>
      {busy ? 'Opening…' : label ?? 'Countersign'}
    </button>
  );
}
