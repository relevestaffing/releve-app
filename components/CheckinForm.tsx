'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Checkin, Placement } from '@/lib/work-public';
import { saving } from './Toast';
import { firstName } from '@/lib/words';

export default function CheckinForm({ placement, week, existing }: {
  placement: Placement; week: string; existing: Checkin | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rapport, setRapport] = useState<number>(existing?.rapport ?? 4);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/checkins', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        placement_id: placement.id, week_ending: week,
        shipped: f.get('shipped'), blocked: f.get('blocked'),
        rapport, workload: f.get('workload'), note: f.get('note')
      })
    }), existing ? 'Check-in updated' : 'Check-in sent to Relève');
    setBusy(false);
    if (ok) router.refresh();
  }

  const friday = new Date(week + 'T00:00:00')
    .toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

  return (
    <form onSubmit={submit}>
      <div className="card">
        <div className="card-head">
          <h3>Week ending {friday}</h3>
          <span className={`pill ${existing ? 'good' : ''}`}>
            {existing ? <><span className="dot" />Sent</> : 'Not sent yet'}
          </span>
        </div>
        <p className="small muted" style={{ marginBottom: 22 }}>
          This goes to your Talent Success Manager at Relève, not to {firstName(placement.client_name)}.
          Say what is actually true; that is the only way we can help. Your day-to-day notes and the
          highlights you share with {firstName(placement.client_name)} live in your <a href="/app/log">daily log</a>.
        </p>

        <div className="ff"><label htmlFor={`ci-shipped-${placement.id}`}>What got done this week</label>
          <textarea id={`ci-shipped-${placement.id}`} name="shipped" rows={3} defaultValue={existing?.shipped ?? ''}
            placeholder="The board pack, the inbox back to zero, the new supplier onboarded." /></div>

        <div className="ff"><label htmlFor={`ci-blocked-${placement.id}`}>What is in the way</label>
          <textarea id={`ci-blocked-${placement.id}`} name="blocked" rows={3} defaultValue={existing?.blocked ?? ''}
            placeholder="Anything you are waiting on, unclear about, or stuck behind. Leave empty if nothing." /></div>

        <div className="ff"><span className="label-like" id={`ci-rap-${placement.id}`}>How the working relationship feels</span>
          <div className="rapport" role="group" aria-labelledby={`ci-rap-${placement.id}`}>
            {[1, 2, 3, 4, 5].map(n => (
              <button type="button" key={n} className={rapport === n ? 'on' : ''}
                onClick={() => setRapport(n)} aria-label={`${n} out of 5`} aria-pressed={rapport === n}>{n}</button>
            ))}
            <span className="xs muted">{['', 'Difficult', 'Strained', 'Fine', 'Good', 'Excellent'][rapport]}</span>
          </div>
        </div>

        <div className="ff" style={{ maxWidth: 320 }}><label htmlFor={`ci-load-${placement.id}`}>Workload</label>
          <select id={`ci-load-${placement.id}`} name="workload" defaultValue={existing?.workload ?? 'right'}>
            <option value="light">Lighter than I could take</option>
            <option value="right">About right</option>
            <option value="heavy">Heavier than is sustainable</option>
          </select></div>

        <div className="ff"><label htmlFor={`ci-note-${placement.id}`}>Anything else for Relève <span className="muted">(private)</span></label>
          <textarea id={`ci-note-${placement.id}`} name="note" rows={2} defaultValue={existing?.note ?? ''} /></div>

        <button className="btn solid" disabled={busy}>
          {busy ? 'Sending…' : existing ? 'Update this week' : 'Send check-in'}
        </button>
      </div>
    </form>
  );
}
