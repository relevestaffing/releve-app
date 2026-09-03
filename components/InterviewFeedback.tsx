'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InterviewFeedback as FB } from '@/lib/work-public';
import { saving } from './Toast';

export default function InterviewFeedback({ interviewId, who, side, existing }: {
  interviewId: string; who: string; side: 'client' | 'talent'; existing: FB | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 4);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        interview_id: interviewId, rating, proceed: f.get('proceed'),
        strengths: f.get('strengths'), concerns: f.get('concerns'), notes: f.get('notes')
      })
    }), 'Thank you — that helps more than you think');
    setBusy(false);
    if (ok) { setOpen(false); router.refresh(); }
  }

  if (!open) return (
    <button className={`btn sm ${existing ? 'ghost' : 'solid'}`} onClick={() => setOpen(true)}>
      {existing ? 'Edit your notes' : 'How did it go?'}
    </button>
  );

  return (
    <form onSubmit={submit} className="fb-form">
      <div className="ff"><label>How did the conversation go?</label>
        <div className="rapport">
          {[1, 2, 3, 4, 5].map(n => (
            <button type="button" key={n} className={rating === n ? 'on' : ''}
              onClick={() => setRating(n)} aria-label={`${n} out of 5`}>{n}</button>
          ))}
          <span className="xs muted">{['', 'Badly', 'Not great', 'Fine', 'Well', 'Very well'][rating]}</span>
        </div>
      </div>

      <div className="ff"><label>{side === 'client' ? `Would you take ${who} forward?` : 'Would you want this role?'}</label>
        <select name="proceed" defaultValue={existing?.proceed ?? 'yes'}>
          <option value="yes">Yes</option>
          <option value="maybe">Maybe — I have reservations</option>
          <option value="no">No</option>
        </select></div>

      <div className="ff"><label>What stood out</label>
        <textarea name="strengths" rows={2} defaultValue={existing?.strengths ?? ''}
          placeholder={side === 'client' ? 'What made you think they could do this.' : 'What you liked about the role or the person.'} /></div>

      <div className="ff"><label>Anything that gave you pause</label>
        <textarea name="concerns" rows={2} defaultValue={existing?.concerns ?? ''}
          placeholder="Be blunt. This is the part that improves the next match." /></div>

      <div className="ff"><label>For Relève only <span className="muted">— optional</span></label>
        <textarea name="notes" rows={2} defaultValue={existing?.notes ?? ''} /></div>

      <p className="xs muted" style={{ marginBottom: 12 }}>
        Only Relève reads this. {side === 'client' ? who : 'The executive'} never sees it.
      </p>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
