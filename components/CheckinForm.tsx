'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Checkin, Placement } from '@/lib/work-public';
import { saving } from './Toast';
import { firstName } from '@/lib/words';

/* The end-of-week report (Sage, 25 October 2026).
   ----------------------------------------------
   This replaced the weekly check-in, which asked how the week felt: a
   1-to-5 score on the working relationship and a pick between light, right
   and heavy. Those measured a mood. What Relève needs on a Friday is what
   the week actually contained, so the four questions are now hours, tasks,
   a win, and anything concerning them. The concern is what raises a hand,
   and a win is worth asking for on its own: it is the thing most likely to
   go unsaid and the thing an executive most wants to hear. */
export default function CheckinForm({ placement, week, existing }: {
  placement: Placement; week: string; existing: Checkin | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const raw = String(f.get('hours') ?? '').trim();
    const ok = await saving(() => fetch('/api/checkins', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        placement_id: placement.id, week_ending: week,
        hours: raw === '' ? null : Number(raw),
        shipped: f.get('shipped'),
        win: f.get('win'),
        blocked: f.get('blocked')
      })
    }), existing ? 'Report updated' : 'Report sent to Relève');
    setBusy(false);
    if (ok) router.refresh();
  }

  const friday = new Date(week + 'T00:00:00')
    .toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  const id = (k: string) => `eow-${k}-${placement.id}`;

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
        </p>

        <div className="ff" style={{ maxWidth: 220 }}>
          <label htmlFor={id('hours')}>Hours worked this week</label>
          <input id={id('hours')} name="hours" type="number" min="0" max="168" step="0.5"
            inputMode="decimal" defaultValue={existing?.hours ?? ''} placeholder="40" />
        </div>

        <div className="ff"><label htmlFor={id('shipped')}>Tasks accomplished</label>
          <textarea id={id('shipped')} name="shipped" rows={4} defaultValue={existing?.shipped ?? ''}
            placeholder="The board pack, the inbox back to zero, the new supplier onboarded." /></div>

        <div className="ff"><label htmlFor={id('win')}>A win from the week</label>
          <textarea id={id('win')} name="win" rows={2} defaultValue={existing?.win ?? ''}
            placeholder="One thing that went well, however small." /></div>

        <div className="ff"><label htmlFor={id('blocked')}>Any concerns</label>
          <textarea id={id('blocked')} name="blocked" rows={3} defaultValue={existing?.blocked ?? ''}
            placeholder="Anything you are waiting on, unclear about, or worried about. Leave empty if there are none." /></div>

        <button className="btn solid" disabled={busy}>
          {busy ? 'Sending…' : existing ? 'Update this week' : 'Send the report'}
        </button>
      </div>
    </form>
  );
}
