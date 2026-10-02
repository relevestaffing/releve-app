'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { BRIEF_FIELDS, type TalentBrief } from '@/lib/experience-public';
import { fmtDate } from '@/lib/words';
import './experience.css';

/* The executive's briefing for the person working with them: the tools,
   the access, how they like things done. Written once, kept current, and
   read by the talent on their Briefing page. Relève can edit it too. */
export default function BriefEditor({ placementId, talentName, initial, startOpen = false }: {
  placementId: string; talentName: string; initial: TalentBrief | null; startOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const filled = BRIEF_FIELDS.filter(f => (initial?.[f.key] ?? '').trim()).length;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { placement_id: placementId };
    BRIEF_FIELDS.forEach(x => { body[x.key] = f.get(x.key); });
    setBusy(true);
    const ok = await saving(() => fetch('/api/brief', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }), 'Briefing saved');
    setBusy(false);
    if (ok) { setOpen(false); router.refresh(); }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>The briefing for {talentName}</h3>
        <span className={`pill ${filled === BRIEF_FIELDS.length ? 'good' : ''}`}>
          {filled === BRIEF_FIELDS.length && <span className="dot" />}{filled} of {BRIEF_FIELDS.length}
        </span>
      </div>
      <p className="small muted" style={{ marginBottom: 16, maxWidth: 640 }}>
        What {talentName} needs to work the way you do: your tools, what they can access, and your preferences.
        They read it on their own Briefing page.
        {initial?.updated_at ? ` Last updated ${fmtDate(initial.updated_at)}.` : ''}
      </p>
      {!open ? (
        <button className="btn sm solid" onClick={() => setOpen(true)}>
          {filled ? 'Review and update' : 'Write the briefing'}
        </button>
      ) : (
        <form onSubmit={save}>
          {BRIEF_FIELDS.map(x => (
            <div className="ff" key={x.key}>
              <label htmlFor={`br-${placementId}-${x.key}`}>{x.label}</label>
              <textarea id={`br-${placementId}-${x.key}`} name={x.key} rows={3} maxLength={4000}
                defaultValue={initial?.[x.key] ?? ''} placeholder={x.hint} />
            </div>
          ))}
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button className="btn solid" disabled={busy}>{busy ? 'Saving…' : 'Save the briefing'}</button>
            <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
