'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';

/* The 90-Day Plan, on an executive's record. It opens when onboarding is done:
   agreement signed, deposit settled, and the Signature, role brief and
   interview hours all in. Until then the card shows what is left, and the plan
   can still be started early. */
type Plan = { id: string; title: string; status: 'draft' | 'published'; done_at: string | null };
type Ready = { agreement: boolean; deposit: boolean; steps: { signature: boolean; role: boolean; availability: boolean }; ready: boolean };

const fmt = (iso: string | null) => {
  try { return iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch { return ''; }
};

export default function PlanCard({ clientId, plan, ready, accountOpen, aiOn }: {
  clientId: string; plan: Plan | null; ready: Ready | null; accountOpen: boolean; aiOn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    let res: Response, d: any = {};
    try {
      res = await fetch('/api/admin/studio', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', kind: 'plan', client_id: clientId })
      });
      d = await res.json().catch(() => ({}));
    } catch { setBusy(false); toast.bad('No connection, so nothing was started.'); return; }
    if (!res.ok) { setBusy(false); toast.bad(d.error ?? 'The studio could not open.'); return; }
    router.push(`/console/plan/${d.id}`);
  }

  const items: [string, boolean][] = ready ? [
    ['Agreement signed', ready.agreement], ['Deposit settled', ready.deposit],
    ['Executive Signature taken', ready.steps.signature], ['Role brief written', ready.steps.role],
    ['Interview hours set', ready.steps.availability]
  ] : [];

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="card-head">
        <div>
          <div className="crumb">After onboarding</div>
          <h3>90-Day Success Plan</h3>
        </div>
        {plan
          ? <Link className="btn sm solid" href={`/console/plan/${plan.id}`}>Open the plan studio</Link>
          : accountOpen && <button className="btn sm solid" disabled={busy || !aiOn} onClick={start}
              title={aiOn ? undefined : 'Add ANTHROPIC_API_KEY in Netlify to turn this on'}>
              {busy ? 'Opening…' : ready?.ready ? 'Build the plan' : 'Start early'}
            </button>}
      </div>
      {plan ? (
        <p className="small muted" style={{ margin: 0 }}>
          {plan.status === 'published' ? `Published to the client ${fmt(plan.done_at)}.` : 'An internal draft. The client sees nothing until you publish it.'}
        </p>
      ) : !accountOpen ? (
        <p className="small muted" style={{ margin: 0 }}>Opens once they have signed in and finished onboarding.</p>
      ) : ready?.ready ? (
        <p className="small muted" style={{ margin: 0 }}>Onboarding is complete. The plan is drafted from their role brief, Signature and audit, after a few questions.</p>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>Opens when onboarding is complete. Still to do:</p>
          <ul className="plain" style={{ margin: 0 }}>
            {items.map(([t, ok]) => <li key={t} className={`small${ok ? ' done' : ''}`}><span className={ok ? '' : 'muted'}>{t}</span></li>)}
          </ul>
        </>
      )}
    </div>
  );
}
