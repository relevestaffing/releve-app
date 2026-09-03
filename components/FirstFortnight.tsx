'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { dueOn, type Step } from '@/lib/care-public';

const WHOSE: Record<string, string> = {
  client: 'Executive', talent: 'Talent', both: 'Both of you'
};

/* The same plan every time, so week one is not improvised. Either side can
   tick their own steps; nobody has to wait for Relève to mark it off. */
export default function FirstFortnight({ steps, startedOn, side }: {
  steps: Step[]; startedOn: string; side: 'client' | 'talent' | 'admin';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const done = steps.filter(s => s.done).length;
  const today = new Date().toISOString().slice(0, 10);

  if (!steps.length) return null;

  async function tick(s: Step) {
    setBusy(s.id);
    const ok = await saving(() => fetch('/api/care', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'step', id: s.id, done: !s.done })
    }), s.done ? 'Unticked' : 'Done');
    setBusy(null);
    if (ok) router.refresh();
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>The first two weeks</h3>
        <span className="xs muted">{done} of {steps.length} done</span>
      </div>
      <div className="fortnight-bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>

      {steps.map(s => {
        const due = dueOn(startedOn, s.day);
        const late = !s.done && due < today;
        const mine = side === 'admin' || s.whose === 'both' || s.whose === side;
        return (
          <div key={s.id} className={`step ${s.done ? 'done' : ''}`}>
            <button className="step-tick" disabled={!mine || busy === s.id}
              onClick={() => tick(s)}
              aria-label={s.done ? 'Mark not done' : 'Mark done'}>
              {s.done ? '✓' : ''}
            </button>
            <div className="step-body">
              <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                <b className="small">{s.title}</b>
                <span className="xs muted">
                  {s.day === 0 ? 'Day one' : `Day ${s.day}`}
                  {late && <span className="pill warn" style={{ marginLeft: 8 }}>Overdue</span>}
                </span>
              </div>
              {s.detail && <p className="xs muted" style={{ marginTop: 4 }}>{s.detail}</p>}
              <span className="xs muted">{WHOSE[s.whose]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
