'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from './Toast';
import type { WatchStatus } from '@/lib/watch';

type Item = {
  discipline: string; name: string; status: WatchStatus;
  attemptId: string | null; timeLimitMinutes: number | null; talentFeedback: string | null;
};

const LABEL: Record<WatchStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  awaiting_review: 'Submitted — waiting on review',
  cleared: 'Cleared',
  needs_retake: 'Needs another attempt'
};
const TONE: Record<WatchStatus, 'good' | 'warn' | ''> = {
  not_started: '', in_progress: 'warn', awaiting_review: 'warn', cleared: 'good', needs_retake: 'warn'
};

export default function WatchBoard({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function start(discipline: string) {
    setConfirming(null);
    setBusy(discipline);
    try {
      const res = await fetch('/api/watch/start', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ discipline })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.bad(data?.error ?? 'Could not start that.'); setBusy(null); return; }
      router.push(`/app/watch/${data.attemptId}`);
    } catch {
      toast.bad('Could not start that.');
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {items.map(it => (
        <div key={it.discipline} className="card" style={{ padding: '18px 20px' }}>
          <div className="row between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <b style={{ fontFamily: 'Marcellus,serif', color: 'var(--fern)', fontSize: 16 }}>{it.name}</b>
              {it.timeLimitMinutes && (
                <div className="xs muted">Time-boxed at {Math.round(it.timeLimitMinutes / 60 * 10) / 10} hours once started</div>
              )}
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <span className={`pill ${TONE[it.status]}`}>
                {(it.status === 'in_progress' || it.status === 'awaiting_review') && <span className="dot" />}
                {LABEL[it.status]}
              </span>
              {(it.status === 'not_started' || it.status === 'needs_retake') && confirming !== it.discipline && (
                <button className="btn sm solid" disabled={busy === it.discipline} onClick={() => setConfirming(it.discipline)}>
                  {it.status === 'needs_retake' ? 'Start again' : 'Start'}
                </button>
              )}
              {(it.status === 'not_started' || it.status === 'needs_retake') && confirming === it.discipline && (
                <>
                  <span className="small muted">
                    {it.timeLimitMinutes
                      ? `Once you start, the clock runs for ${Math.round(it.timeLimitMinutes / 60 * 10) / 10} hours straight through.`
                      : 'Once you start, the clock is running.'}
                  </span>
                  <button className="btn sm solid" disabled={busy === it.discipline} onClick={() => start(it.discipline)}>
                    {busy === it.discipline ? 'Starting…' : 'Yes, start'}
                  </button>
                  <button type="button" className="btn sm ghost" disabled={busy === it.discipline} onClick={() => setConfirming(null)}>
                    Not yet
                  </button>
                </>
              )}
              {it.status === 'in_progress' && it.attemptId && (
                <Link className="btn sm solid" href={`/app/watch/${it.attemptId}`}>Continue</Link>
              )}
              {it.status === 'awaiting_review' && it.attemptId && (
                <Link className="btn sm ghost" href={`/app/watch/${it.attemptId}`}>See what you submitted</Link>
              )}
            </div>
          </div>
          {it.status === 'cleared' && it.talentFeedback && (
            <p className="small muted" style={{ marginTop: 12, maxWidth: 640 }}>{it.talentFeedback}</p>
          )}
          {it.status === 'needs_retake' && it.talentFeedback && (
            <p className="small" style={{ marginTop: 12, maxWidth: 640 }}>{it.talentFeedback}</p>
          )}
        </div>
      ))}
    </div>
  );
}
