'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { GOING, WORKLOADS, type Pulse, type Workload } from '@/lib/care-public';

/* The executive's monthly say. Deliberately short — five taps and two
   optional boxes. A form that takes fifteen minutes gets filled in once. */
export default function PulseForm({ placementId, talentName, existing }: {
  placementId: string; talentName: string; existing: Pulse | null;
}) {
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
    }), 'Thank you — that goes straight to your Client Success Manager');
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{existing ? 'Your answer this month' : `How is it going with ${talentName.split(' ')[0]}?`}</h3>
        {existing && <span className="pill good"><span className="dot" />Filed</span>}
      </div>
      <p className="small muted" style={{ marginBottom: 20 }}>
        Once a month, two minutes. Your talent never sees this — it comes to Relève,
        so you can say the awkward thing without having to manage it afterwards.
      </p>

      <div className="ff">
        <label>Overall</label>
        <div className="pick-row">
          {GOING.map(g => (
            <button key={g.n} type="button"
              className={`pick ${going === g.n ? 'on' : ''}`}
              onClick={() => setGoing(g.n)}>
              <b>{g.n}</b><span>{g.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ff">
        <label>Their workload</label>
        <div className="pick-row">
          {WORKLOADS.map(w => (
            <button key={w.key} type="button"
              className={`pick wide ${workload === w.key ? 'on' : ''}`}
              onClick={() => setWorkload(w.key)}>
              <span>{w.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ff">
        <label>Anything that stood out</label>
        <textarea rows={2} value={standout} onChange={e => setStandout(e.target.value)}
          placeholder="They rebuilt the whole board pack without being asked." />
      </div>

      <div className="ff">
        <label>Anything not working</label>
        <textarea rows={2} value={friction} onChange={e => setFriction(e.target.value)}
          placeholder="Say it plainly. This is the part that actually helps." />
      </div>

      <div className="ff">
        <label>Would you place them again?</label>
        <div className="pick-row">
          <button type="button" className={`pick wide ${keep === true ? 'on' : ''}`}
            onClick={() => setKeep(true)}><span>Yes</span></button>
          <button type="button" className={`pick wide ${keep === false ? 'on' : ''}`}
            onClick={() => setKeep(false)}><span>No</span></button>
        </div>
      </div>

      <button className="btn solid" disabled={!ready || busy} onClick={submit}>
        {busy ? 'Sending…' : existing ? 'Update my answer' : 'Send to Relève'}
      </button>
      {!ready && <p className="xs muted" style={{ marginTop: 12 }}>
        The three quick ones are all we need — the boxes are optional.
      </p>}
    </div>
  );
}
