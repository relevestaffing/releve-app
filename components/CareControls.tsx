'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';
import { TEAM_ROLES, type TeamRole, type TimeOffState } from '@/lib/care-public';

async function post(body: any) {
  return fetch('/api/care', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
}

/* Approve or decline time off, with the cover note recorded at the same
   moment — approving without saying who covers is how a Tuesday goes wrong. */
export function TimeOffDecider({ id, state }: { id: string; state: TimeOffState }) {
  const router = useRouter();
  const [cover, setCover] = useState('');
  const [busy, setBusy] = useState(false);
  if (state !== 'requested') return null;

  async function decide(next: TimeOffState) {
    if (next === 'approved' && !cover.trim()) {
      const { toast } = await import('@/components/Toast');
      toast.bad('Say who is covering before you approve.');
      return;
    }
    setBusy(true);
    const ok = await saving(
      () => post({ action: 'time_off_decide', id, state: next, cover_note: cover }),
      next === 'approved' ? 'Approved, and cover noted' : 'Declined'
    );
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="ff" style={{ marginBottom: 10 }}>
        <input value={cover} onChange={e => setCover(e.target.value)}
          placeholder="Who is covering, and how" />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm solid" disabled={busy} onClick={() => decide('approved')}>Approve</button>
        <button className="btn sm ghost"  disabled={busy} onClick={() => decide('declined')}>Decline</button>
      </div>
    </div>
  );
}

/* The six-month review. This is the only thing that ever writes an outcome,
   so without it the matching engine never learns anything. */
export function OutcomeForm({ placementId, predicted }: { placementId: string; predicted: number | null }) {
  const router = useRouter();
  const [score, setScore] = useState('');
  const [retained, setRetained] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = Number(score);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      const { toast } = await import('@/components/Toast');
      toast.bad('Score it out of 100.');
      return;
    }
    if (retained == null) {
      const { toast } = await import('@/components/Toast');
      toast.bad('Say whether they are still in place.');
      return;
    }
    setBusy(true);
    const ok = await saving(
      () => post({ action: 'outcome', placement_id: placementId, outcome_score: n, retained, note }),
      'Recorded — the engine learns from this'
    );
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div style={{ marginTop: 12 }}>
      {predicted != null &&
        <p className="xs muted" style={{ marginBottom: 10 }}>
          The engine predicted <b>{predicted}</b>. Score what actually happened, honestly —
          a flattering number here makes every future match worse.
        </p>}
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="ff"><label>How it actually went, out of 100</label>
          <input value={score} inputMode="numeric" placeholder="78"
            onChange={e => setScore(e.target.value)} /></div>
        <div className="ff"><label>Still in place?</label>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className={`btn sm ${retained === true ? 'solid' : 'ghost'}`}
              onClick={() => setRetained(true)}>Yes</button>
            <button type="button" className={`btn sm ${retained === false ? 'solid' : 'ghost'}`}
              onClick={() => setRetained(false)}>No</button>
          </div>
        </div>
      </div>
      <div className="ff"><label>What the score does not capture</label>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Strong on the work, slow to raise problems early on." /></div>
      <button className="btn sm solid" disabled={busy} onClick={submit}>
        {busy ? 'Saving…' : 'Record the outcome'}
      </button>
    </div>
  );
}

export function RolePicker({ userId, role, canEdit }: {
  userId: string; role: TeamRole; canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<TeamRole>(role);
  const [busy, setBusy] = useState(false);
  if (!canEdit) return <span className="pill">{TEAM_ROLES.find(r => r.key === value)?.label}</span>;

  return (
    <select className="pill" value={value} disabled={busy}
      style={{ padding: '5px 10px', cursor: 'pointer' }}
      onChange={async e => {
        const prev = value;
        const next = e.target.value as TeamRole;
        setValue(next); setBusy(true);
        const ok = await saving(
          () => post({ action: 'team_role', user_id: userId, team_role: next }),
          `Now ${TEAM_ROLES.find(r => r.key === next)?.label}`
        );
        setBusy(false);
        if (ok) router.refresh(); else setValue(prev);
      }}>
      {TEAM_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
    </select>
  );
}
