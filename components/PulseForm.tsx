'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { GOING, WORKLOADS, type Pulse, type Workload } from '@/lib/care-public';
import { firstName } from '@/lib/words';

/* The executive's monthly say. Deliberately short — five taps and two
   optional boxes. A form that takes fifteen minutes gets filled in once. */
export default function PulseForm({ placementId, talentName, existing }: {
  placementId: string; talentName: string; existing: Pulse | null;
}) {
  const fid = useId();
  const router = useRouter();
  const [going, setGoing] = useState<number | null>(existing?.going ?? null);
  const [workload, setWorkload] = useState<Workload | null>(existing?.workload ?? null);
  const [standout, setStandout] = useState(existing?.standout ?? '');
  const [friction, setFriction] = useState(existing?.friction ?? '');
  const [keep, setKeep] = useState<boolean | null>(existing?.keep_going ?? null);
  const [busy, setBusy] = useState(false);

  const ready = going != null && workload != null && keep != null;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    const ok = await saving(() => fetch('/api/care', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'pulse', placement_id: placementId,
        going, workload, standout, friction, keep_going: keep
      })
    }), 'Thank you. This goes to your Client Success Manager.');
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="card" data-save-scope>
      <div className="card-head">
        <h3>{existing ? 'Your answer this month' : `How is it going with ${firstName(talentName)}?`}</h3>
        {existing && <span className="pill good"><span className="dot" />Sent</span>}
      </div>
      <p className="small muted" style={{ marginBottom: 20 }}>
        Once a month, about two minutes. {firstName(talentName)} never sees this. It comes to
        Relève, so you can raise anything difficult and leave the conversation to us.
      </p>

      <div className="ff">
        <span className="label-like" id={`${fid}-overall`}>Overall</span>
        <div className="pick-row" role="group" aria-labelledby={`${fid}-overall`}>
          {GOING.map(g => (
            <button key={g.n} type="button"
              className={`pick ${going === g.n ? 'on' : ''}`}
              aria-pressed={going === g.n}
              onClick={() => setGoing(g.n)}>
              <b>{g.n}</b><span>{g.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ff">
        <span className="label-like" id={`${fid}-workload`}>Their workload</span>
        <div className="pick-row" role="group" aria-labelledby={`${fid}-workload`}>
          {WORKLOADS.map(w => (
            <button key={w.key} type="button"
              className={`pick wide ${workload === w.key ? 'on' : ''}`}
              aria-pressed={workload === w.key}
              onClick={() => setWorkload(w.key)}>
              <span>{w.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ff">
        <label htmlFor={`${fid}-1`}>Anything that stood out</label>
        <textarea id={`${fid}-1`} rows={2} value={standout} onChange={e => setStandout(e.target.value)}
          placeholder="They rebuilt the whole board report without being asked." />
      </div>

      <div className="ff">
        <label htmlFor={`${fid}-2`}>Anything not working</label>
        <textarea id={`${fid}-2`} rows={2} value={friction} onChange={e => setFriction(e.target.value)}
          placeholder="Say it plainly. This is the part that helps most." />
      </div>

      <div className="ff">
        <span className="label-like" id={`${fid}-again`}>Would you like to keep working with them?</span>
        <div className="pick-row" role="group" aria-labelledby={`${fid}-again`}>
          <button type="button" className={`pick wide ${keep === true ? 'on' : ''}`}
            aria-pressed={keep === true} onClick={() => setKeep(true)}><span>Yes</span></button>
          <button type="button" className={`pick wide ${keep === false ? 'on' : ''}`}
            aria-pressed={keep === false} onClick={() => setKeep(false)}><span>No</span></button>
        </div>
      </div>

      <button className="btn solid" disabled={!ready || busy} onClick={submit}>
        {busy ? 'Sending…' : existing ? 'Update your answer' : 'Send to Relève'}
      </button>
      {!ready && <p className="xs muted" style={{ marginTop: 12 }}>
        Only the three choices above are required. The written answers are optional.
      </p>}
    </div>
  );
}
