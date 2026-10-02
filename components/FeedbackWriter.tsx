'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { saving, toast } from '@/components/Toast';
import { FEEDBACK_SCORES, type Feedback } from '@/lib/care-public';
import { firstName } from '@/lib/words';

/* Written in draft, released deliberately. The talent sees nothing until the
   Share switch is thrown — a half-finished review turning up in someone's
   account is worse than no review at all. */
export default function FeedbackWriter({ placementId, talentId, talentName, existing }: {
  placementId: string; talentId: string; talentName: string; existing: Feedback[];
}) {
  const fid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState(
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  const [strengths, setStrengths] = useState('');
  const [growing, setGrowing] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});

  async function save(shared: boolean) {
    if (!strengths.trim()) { toast.bad('Say what they are doing well first.'); return; }
    setBusy(true);
    const ok = await saving(() => fetch('/api/care', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'feedback_save', placement_id: placementId, talent_id: talentId,
        period, strengths, growing, ...scores, shared
      })
    }), shared ? `Shared with ${firstName(talentName)}` : 'Saved as a draft');
    setBusy(false);
    if (ok) {
      setOpen(false); setStrengths(''); setGrowing(''); setScores({});
      router.refresh();
    }
  }

  async function toggleShare(f: Feedback) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/care', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'feedback_share', id: f.id, shared: !f.shared })
    }), f.shared ? 'Hidden again' : `Shared with ${firstName(talentName)}`);
    setBusy(false);
    if (ok) router.refresh();
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Feedback for {firstName(talentName)}</h3>
        {!open && <button className="btn sm solid" onClick={() => setOpen(true)}>Write one</button>}
      </div>

      {open && (
        <div style={{ marginBottom: 24 }}>
          <div className="ff"><label htmlFor={`${fid}-1`}>Period</label>
            <input id={`${fid}-1`} value={period} onChange={e => setPeriod(e.target.value)} /></div>

          {FEEDBACK_SCORES.map(s => (
            <div key={s.key} className="ff">
              <span className="label-like" id={`${fid}-${s.key}`}>{s.label}</span>
              <div className="pick-row" role="group" aria-labelledby={`${fid}-${s.key}`}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button"
                    className={`pick ${scores[s.key] === n ? 'on' : ''}`}
                    aria-pressed={scores[s.key] === n}
                    onClick={() => setScores({ ...scores, [s.key]: n })}>
                    <b>{n}</b>
                  </button>
                ))}
              </div>
              <p className="xs muted" style={{ marginTop: 6 }}>{s.what}</p>
            </div>
          ))}

          <div className="ff"><label htmlFor={`${fid}-2`}>What is going well</label>
            <textarea id={`${fid}-2`} rows={3} value={strengths} onChange={e => setStrengths(e.target.value)}
              placeholder="Be specific. 'Great work' tells them nothing they can repeat." /></div>

          <div className="ff"><label htmlFor={`${fid}-3`}>What to build on</label>
            <textarea id={`${fid}-3`} rows={3} value={growing} onChange={e => setGrowing(e.target.value)}
              placeholder="Written as something to grow into, not a complaint. They will read this exactly as you write it." /></div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button className="btn sm ghost"  disabled={busy} onClick={() => save(false)}>Save as draft</button>
            <button className="btn sm solid"  disabled={busy} onClick={() => save(true)}>Save and share</button>
            <button className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!existing.length ? (
        <p className="small muted">
          Nothing written yet. After their first full month is the natural moment.
          People do better work when they know how they are doing.
        </p>
      ) : existing.map(f => (
        <div key={f.id} style={{ padding: '14px 0', borderTop: '1px solid var(--mist)' }}>
          <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <b className="small">{f.period}</b>
            <div className="row" style={{ gap: 8 }}>
              {f.shared
                ? <span className="pill good"><span className="dot" />
                    {f.seen_at ? 'Read' : 'Shared, not opened yet'}</span>
                : <span className="pill">Draft</span>}
              <button className="btn sm ghost" disabled={busy} onClick={() => toggleShare(f)}>
                {f.shared ? 'Unshare' : 'Share'}
              </button>
            </div>
          </div>
          <p className="xs muted" style={{ marginTop: 6 }}>
            {FEEDBACK_SCORES.map(s => `${s.label} ${f[s.key] ?? '·'}`).join(' · ')}
          </p>
          <p className="small" style={{ marginTop: 8 }}>{f.strengths}</p>
          {f.growing && <p className="small muted" style={{ marginTop: 6 }}>{f.growing}</p>}
        </div>
      ))}
    </div>
  );
}
