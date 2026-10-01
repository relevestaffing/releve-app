'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';

type State = 'not_started' | 'submitted' | 'verified' | 'rejected';

/* The executive-side "sign now" card — same shape as VettingUpload's
   agreement row on the talent side, for one document instead of a
   checklist. Shows until client_agreements.state is 'verified', which
   only happens once the client has signed AND Sage has countersigned. */
export default function ClientAgreementCard({ state, rejectReason }: {
  state: State; rejectReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('agreement') === '1') {
      toast.saved('Signed — Relève countersigns next, then it is fully on file');
      router.replace('/app');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sign() {
    setBusy(true);
    try {
      const res = await fetch('/api/agreement/docusign/sign', { method: 'POST' });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? 'Could not open that for signing.');
      window.location.href = out.url;
    } catch (e: any) {
      toast.bad(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Your Client Services Agreement</h3>
        <span className={`pill ${state === 'rejected' ? 'crit' : ''}`}>
          {state === 'submitted' ? 'Waiting on a signature' : state === 'rejected' ? 'Needs another look' : 'Not yet signed'}
        </span></div>
      <p className="small muted" style={{ marginBottom: 18 }}>
        The commercial terms you already agreed to, as a real signed agreement — the deposit, the monthly
        retainer, the guarantees, and the twelve-month non-circumvention. You sign first; Relève
        countersigns right after, and this card clears once both signatures are on file.
      </p>
      {state === 'rejected' && rejectReason && (
        <p className="small" style={{ color: '#7A2E26', marginBottom: 14 }}><b>Needs another go:</b> {rejectReason}</p>
      )}
      <button className="btn sm solid" disabled={busy} onClick={sign}>
        {busy ? 'Opening…' : state === 'submitted' ? 'Continue signing' : 'Sign now'}
      </button>
      {state === 'submitted' && (
        <span className="xs muted" style={{ marginLeft: 10 }}>Started earlier — pick up where you left off.</span>
      )}
    </div>
  );
}
