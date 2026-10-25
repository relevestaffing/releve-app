'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import { type TimeOffState } from '@/lib/care-public';

async function post(body: any) {
  return fetch('/api/care', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
}

/* Approve or decline time off, with the cover note recorded at the same
   moment — approving without saying who covers is how a Tuesday goes wrong. */
export function TimeOffDecider({ id, state, talentName }: { id: string; state: TimeOffState; talentName?: string | null }) {
  const router = useRouter();
  const [cover, setCover] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  /* Declining emails the talent, so it arms a confirm with an optional
     reason for the team's own record first. */
  const [declining, setDeclining] = useState(false);
  if (state !== 'requested') return null;
  const who = talentName?.trim() || 'the talent';

  async function decide(next: TimeOffState) {
    if (next === 'approved' && !cover.trim()) {
      toast.bad('Say who is covering before you approve.');
      return;
    }
    setBusy(true);
    const ok = await saving(
      () => post({ action: 'time_off_decide', id, state: next, cover_note: next === 'approved' ? cover : reason.trim() || null }),
      next === 'approved' ? `Approved, and cover noted. ${who} has been emailed` : `Declined. ${who} has been emailed`
    );
    setBusy(false);
    if (ok) { setDeclining(false); router.refresh(); }
  }

  if (declining) return (
    <div style={{ marginTop: 10 }}>
      <p className="small" style={{ marginBottom: 10 }}>
        Decline this time off? {who} is emailed that it could not be approved and that their Talent Success Manager will write to them.
      </p>
      <div className="ff" style={{ marginBottom: 10 }}>
        <input aria-label="Why, for your own record" value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Why, for your own record (optional)" autoFocus disabled={busy}
          onKeyDown={e => {
            if (e.key === 'Escape') setDeclining(false);
            if (e.key === 'Enter' && !busy) { e.preventDefault(); decide('declined'); }
          }} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm solid" disabled={busy} onClick={() => decide('declined')}>
          {busy ? 'Declining…' : 'Yes, decline it'}
        </button>
        <button className="btn sm ghost" disabled={busy} onClick={() => setDeclining(false)}>Keep it open</button>
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 10 }}>
      <div className="ff" style={{ marginBottom: 10 }}>
        <input aria-label="Who is covering, and how" value={cover} onChange={e => setCover(e.target.value)}
          placeholder="Who is covering, and how" disabled={busy}
          onKeyDown={e => { if (e.key === 'Enter' && !busy) { e.preventDefault(); decide('approved'); } }} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm solid" disabled={busy} onClick={() => decide('approved')}>
          {busy ? 'Approving…' : 'Approve'}
        </button>
        <button className="btn sm ghost"  disabled={busy} onClick={() => setDeclining(true)}>Decline</button>
      </div>
    </div>
  );
}

/* The six-month review. This is the only thing that ever writes an outcome,
   so without it the matching engine never learns anything. */
export function OutcomeForm({ placementId, predicted }: { placementId: string; predicted: number | null }) {
  const fid = useId();
  const router = useRouter();
  const [score, setScore] = useState('');
  const [retained, setRetained] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = Number(score);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      toast.bad('Score it out of 100.');
      return;
    }
    if (retained == null) {
      toast.bad('Say whether they are still in place.');
      return;
    }
    setBusy(true);
    const ok = await saving(
      () => post({ action: 'outcome', placement_id: placementId, outcome_score: n, retained, note }),
      'Recorded. This calibrates future matches.'
    );
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div style={{ marginTop: 12 }}>
      {predicted != null &&
        <p className="xs muted" style={{ marginBottom: 10 }}>
          The engine predicted <b>{predicted}</b>. Score what actually happened,
          honestly. A flattering number here makes every future match worse.
        </p>}
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="ff"><label htmlFor={`${fid}-1`}>How it actually went, out of 100</label>
          <input id={`${fid}-1`} value={score} inputMode="numeric" placeholder="78"
            onChange={e => setScore(e.target.value)} /></div>
        <div className="ff"><span className="label-like" id={`${fid}-kept`}>Still in place?</span>
          <div className="row" role="group" aria-labelledby={`${fid}-kept`} style={{ gap: 8 }}>
            <button type="button" className={`btn sm ${retained === true ? 'solid' : 'ghost'}`}
              aria-pressed={retained === true} onClick={() => setRetained(true)}>Yes</button>
            <button type="button" className={`btn sm ${retained === false ? 'solid' : 'ghost'}`}
              aria-pressed={retained === false} onClick={() => setRetained(false)}>No</button>
          </div>
        </div>
      </div>
      <div className="ff"><label htmlFor={`${fid}-2`}>What the score does not capture</label>
        <textarea id={`${fid}-2`} rows={2} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Strong on the work, slow to raise problems early on." /></div>
      <button className="btn sm solid" disabled={busy} onClick={submit}>
        {busy ? 'Saving…' : 'Record the outcome'}
      </button>
    </div>
  );
}

