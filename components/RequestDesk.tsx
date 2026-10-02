'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { REQUEST_KINDS, REQUEST_STATE, type RequestState } from '@/lib/experience-public';
import { fmtDate, fmtWhen } from '@/lib/words';
import './experience.css';

type Row = {
  id: string; client_id: string; placement_id: string; kind: string; state: RequestState;
  note: string | null; preferred: string | null; outcome: string | null;
  created_at: string; client_name: string; org_name: string | null; talent_name: string;
};

/* What executives asked for from their placement page. Each row says what
   they want, in their words, and the one next step, with the buttons to move
   it along. Done asks for a line on the outcome, which the executive's own
   page then shows. */
export default function RequestDesk({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ id: string; state: RequestState } | null>(null);

  async function move(id: string, state: RequestState, outcome?: string) {
    setBusy(id);
    const ok = await saving(() => fetch('/api/requests', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, state, outcome })
    }), state === 'in_hand' ? 'Marked in hand' : state === 'done' ? 'Marked done' : 'Closed');
    setBusy(null); setClosing(null);
    if (ok) router.refresh();
  }

  const live = rows.filter(r => r.state === 'open' || r.state === 'in_hand');
  const past = rows.filter(r => r.state === 'done' || r.state === 'declined').slice(0, 8);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Requests from executives</h3>
        <span className={`pill ${live.some(r => r.state === 'open') ? 'warn' : ''}`}>{live.length} open</span>
      </div>
      {!live.length && <p className="small muted" style={{ margin: 0 }}>Nothing waiting. Replacements, pauses and quarterly reviews asked for in the app appear here.</p>}
      {live.map(r => {
        const meta = REQUEST_KINDS.find(k => k.key === r.kind);
        const st = REQUEST_STATE.find(s => s.key === r.state);
        return (
          <div key={r.id} className="req-row">
            <div className="row between" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <b className="small">{r.org_name ?? r.client_name}</b>
                <span className="xs muted"> · with {r.talent_name}</span>
                <div className="xs muted">{meta?.label ?? r.kind} · asked {fmtWhen(r.created_at)}</div>
              </div>
              <span className={`pill ${st?.tone ?? ''}`}>{st?.label ?? r.state}</span>
            </div>
            {r.note && <p className="small" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{r.note}”</p>}
            {r.preferred && <p className="xs muted" style={{ margin: '6px 0 0' }}>{r.kind === 'pause' ? 'Dates' : 'Preferred'}: {r.preferred}</p>}
            <p className="xs" style={{ margin: '8px 0 10px', color: 'var(--fern)' }}>Next: {meta?.teamAction ?? 'Reply to the executive'}.</p>

            {closing?.id === r.id ? (
              <form onSubmit={e => { e.preventDefault(); move(r.id, closing.state, String(new FormData(e.currentTarget).get('outcome') ?? '')); }}>
                <div className="ff" style={{ marginBottom: 10 }}>
                  <label htmlFor={`oc-${r.id}`}>{closing.state === 'done' ? 'What was agreed' : 'Why it is closed'} <span className="muted">(the executive sees this)</span></label>
                  <input id={`oc-${r.id}`} name="outcome" maxLength={2000}
                    placeholder={closing.state === 'done' ? 'Review held 12 Oct; next one in January.' : 'Resolved on our call.'} />
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn sm solid" disabled={busy === r.id}>Save</button>
                  <button type="button" className="btn sm ghost" onClick={() => setClosing(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <a className="btn sm ghost" href={`/console/messages?thread=${r.client_id}`}>Message them</a>
                <a className="btn sm ghost" href={`/console/placements/${r.placement_id}`}>Open the placement</a>
                {r.state === 'open' && (
                  <button className="btn sm ghost" disabled={busy === r.id} onClick={() => move(r.id, 'in_hand')}>Mark in hand</button>
                )}
                <button className="btn sm solid" disabled={busy === r.id} onClick={() => setClosing({ id: r.id, state: 'done' })}>Done</button>
                <button className="btn sm ghost" disabled={busy === r.id} onClick={() => setClosing({ id: r.id, state: 'declined' })}>Close</button>
              </div>
            )}
          </div>
        );
      })}

      {past.length > 0 && (
        <details className="more" style={{ marginTop: 14 }}>
          <summary>Recently handled</summary>
          <div className="inner">
            {past.map(r => (
              <div key={r.id} className="req-row">
                <b className="small">{r.org_name ?? r.client_name}</b>
                <span className="xs muted"> · {REQUEST_KINDS.find(k => k.key === r.kind)?.label ?? r.kind} · {fmtDate(r.created_at)}</span>
                {r.outcome && <div className="xs muted">{r.outcome}</div>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
