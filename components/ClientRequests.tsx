'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import {
  REQUEST_KINDS, REQUEST_STATE, type ClientRequest, type RequestKind
} from '@/lib/experience-public';
import { fmtDate } from '@/lib/words';
import './experience.css';

/* The three things an executive can ask for without writing a letter: a
   quarterly review, a replacement, a pause. Each becomes a request the team
   sees on Care with its next step, and each says plainly what happens next. */
export default function ClientRequests({ placementId, talentName, existing, today }: {
  placementId: string; talentName: string; existing: ClientRequest[]; today: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<RequestKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<RequestKind | null>(null);
  const meta = REQUEST_KINDS.find(k => k.key === kind) ?? null;
  const live = existing.filter(r => r.placement_id === placementId);
  const openOf = (k: RequestKind) => live.find(r => r.kind === k && (r.state === 'open' || r.state === 'in_hand'));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kind) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await saving(() => fetch('/api/requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        placement_id: placementId, kind,
        note: f.get('note'), preferred: f.get('preferred'),
        pause_from: f.get('pause_from'), pause_until: f.get('pause_until')
      })
    }), 'Request sent');
    setBusy(false);
    if (ok) { setSent(kind); setKind(null); router.refresh(); }
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Ask for something</h3></div>
      <p className="small muted" style={{ marginBottom: 16, maxWidth: 620 }}>
        Each of these goes straight to your Client Success Manager as a request, with a reply within one business day.
      </p>

      <div className="req-grid" role="group" aria-label="What would you like?">
        {REQUEST_KINDS.map(k => {
          const pending = openOf(k.key);
          return (
            <button key={k.key} type="button" className={`req-choice${kind === k.key ? ' on' : ''}`}
              aria-pressed={kind === k.key} disabled={!!pending}
              onClick={() => { setKind(kind === k.key ? null : k.key); setSent(null); }}>
              <b>{k.label}</b>
              <span className="xs muted">
                {pending ? `Requested ${fmtDate(pending.created_at)}. ${REQUEST_STATE.find(s => s.key === pending.state)?.label ?? ''}.` : k.ask}
              </span>
            </button>
          );
        })}
      </div>

      {sent && (
        <p className="small" role="status" style={{ marginTop: 16, color: 'var(--good)' }}>
          Received. {REQUEST_KINDS.find(k => k.key === sent)?.promise}
        </p>
      )}

      {meta && (
        <form onSubmit={submit} style={{ marginTop: 20 }}>
          {kind === 'pause' && (
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="ff"><label htmlFor="rq-from">First day</label>
                <input id="rq-from" type="date" name="pause_from" min={today} required /></div>
              <div className="ff"><label htmlFor="rq-until">Last day</label>
                <input id="rq-until" type="date" name="pause_until" min={today} required /></div>
            </div>
          )}
          {kind === 'quarterly_review' && (
            <div className="ff"><label htmlFor="rq-pref">Times that suit you <span className="muted">(optional)</span></label>
              <input id="rq-pref" name="preferred" maxLength={400} placeholder="Tuesday or Thursday mornings, Pacific" /></div>
          )}
          <div className="ff">
            <label htmlFor="rq-note">
              {kind === 'replacement' ? `What is not working with ${talentName}?`
                : kind === 'pause' ? 'Anything we should know' : 'Anything you would like to cover'}
              {kind !== 'replacement' && <span className="muted"> (optional)</span>}
            </label>
            <textarea id="rq-note" name="note" rows={3} maxLength={4000} required={kind === 'replacement'}
              placeholder={kind === 'replacement'
                ? 'Be as direct as you like. This goes to us, not to them, and it is how the next match gets sharper.'
                : ''} />
          </div>
          <p className="xs muted" style={{ margin: '0 0 14px', maxWidth: 620 }}>{meta.promise}</p>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button className="btn solid" disabled={busy}>{busy ? 'Sending…' : meta.label}</button>
            <button type="button" className="btn ghost sm" onClick={() => setKind(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
