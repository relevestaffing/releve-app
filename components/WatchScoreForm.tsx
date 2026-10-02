'use client';

import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';

type Existing = {
  accuracy: number | null; judgment: number | null; communication: number | null; time_management: number | null;
  overall_result: string; reviewer_notes?: string | null; talent_feedback: string;
} | null;

/* The reviewer's own screen — the four rubric axes, the plain verdict, and
   two different kinds of text: what the talent sees, and what only the
   console sees. Kept as one submit rather than per-field autosave, since a
   half-entered score is not a score and should not be mistaken for one. */
export default function WatchScoreForm({ attemptId, existing }: { attemptId: string; existing: Existing }) {
  const fid = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/admin/watch-score', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        attemptId,
        accuracy: Number(f.get('accuracy')),
        judgment: Number(f.get('judgment')),
        communication: Number(f.get('communication')),
        time_management: Number(f.get('time_management')),
        overall_result: f.get('overall_result'),
        reviewer_notes: f.get('reviewer_notes'),
        talent_feedback: f.get('talent_feedback')
      })
    }), 'Score saved');
    setBusy(false);
    if (ok) { router.push('/console/watch'); router.refresh(); }
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="card-head"><h3>Score this attempt</h3></div>
      <div className="grid-2" style={{ gap: 14 }}>
        <div className="ff"><label htmlFor={`${fid}-1`}>Accuracy <span className="muted">0–100</span></label>
          <input id={`${fid}-1`} type="number" name="accuracy" min={0} max={100} defaultValue={existing?.accuracy ?? ''} required /></div>
        <div className="ff"><label htmlFor={`${fid}-2`}>Judgment / initiative <span className="muted">0–100</span></label>
          <input id={`${fid}-2`} type="number" name="judgment" min={0} max={100} defaultValue={existing?.judgment ?? ''} required /></div>
        <div className="ff"><label htmlFor={`${fid}-3`}>Communication & tone match <span className="muted">0–100</span></label>
          <input id={`${fid}-3`} type="number" name="communication" min={0} max={100} defaultValue={existing?.communication ?? ''} required /></div>
        <div className="ff"><label htmlFor={`${fid}-4`}>Time management <span className="muted">0–100</span></label>
          <input id={`${fid}-4`} type="number" name="time_management" min={0} max={100} defaultValue={existing?.time_management ?? ''} required /></div>
      </div>

      <div className="ff"><label htmlFor={`${fid}-5`}>Result</label>
        <select id={`${fid}-5`} name="overall_result" defaultValue={existing?.overall_result ?? 'cleared'}>
          <option value="cleared">Cleared</option>
          <option value="needs_retake">Needs another attempt</option>
        </select></div>

      <div className="ff"><label htmlFor={`${fid}-6`}>Feedback for the talent</label>
        <textarea id={`${fid}-6`} name="talent_feedback" rows={4} defaultValue={existing?.talent_feedback ?? ''}
          placeholder="Specific and constructive. This is all they see. No scores, no comparisons to anyone else." required /></div>

      <div className="ff"><label htmlFor={`${fid}-7`}>Internal notes <span className="muted">(optional, console only)</span></label>
        <textarea id={`${fid}-7`} name="reviewer_notes" rows={3} defaultValue={existing?.reviewer_notes ?? ''} /></div>

      <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : existing ? 'Update score' : 'Save score'}</button>
    </form>
  );
}
