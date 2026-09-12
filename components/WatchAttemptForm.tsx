'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';

type Task = { id: string; key: string; title: string; prompt: string; placeholder?: string; response: string | null };

/* The attempt itself — a countdown while it's open, a submit that locks it,
   and a plain read-only view once it's submitted or scored. Autosave is
   debounced per task rather than on every keystroke, and failures are
   surfaced rather than swallowed — see saveTaskResponse's own comment on
   why that matters more here than almost anywhere else in the app. */
export default function WatchAttemptForm({
  attemptId, disciplineName, startedAt, timeLimitMinutes, tasks, readOnly
}: {
  attemptId: string; disciplineName: string; startedAt: string; timeLimitMinutes: number;
  tasks: Task[]; readOnly: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const deadline = new Date(startedAt).getTime() + timeLimitMinutes * 60000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (readOnly) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [readOnly]);
  const remaining = deadline - now;
  const over = remaining < 0;
  const abs = Math.abs(remaining);
  const clock = [Math.floor(abs / 3600000), Math.floor((abs % 3600000) / 60000), Math.floor((abs % 60000) / 1000)]
    .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0'))).join(':');

  function onChange(taskId: string, value: string) {
    clearTimeout(timers.current[taskId]);
    timers.current[taskId] = setTimeout(() => save(taskId, value), 1000);
  }

  async function save(taskId: string, value: string) {
    try {
      const res = await fetch('/api/watch/task', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId, response: value })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.bad(d?.error ?? 'That answer did not save. Try again.');
      }
    } catch {
      toast.bad('That answer did not save. Try again.');
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/watch/submit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ attemptId })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.bad(d?.error ?? 'Could not submit.'); setSubmitting(false); setConfirming(false); return; }
      toast.saved('Submitted — your Talent Success Manager will review it.');
      router.push('/app/watch');
      router.refresh();
    } catch {
      toast.bad('Could not submit.');
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <>
      {!readOnly && (
        <div className="card dark" style={{ marginBottom: 18 }}>
          <div className="row between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div className="eyebrow" style={{ color: 'var(--pale)' }}>{disciplineName}</div>
              <h2 style={{ color: 'var(--cream)', fontSize: 22, marginTop: 4 }}>Taking The Watch</h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="xs" style={{ color: 'var(--pale)' }}>{over ? 'Over your time' : 'Time remaining'}</div>
              <div className="mono-num" style={{ color: over ? '#D99C8C' : 'var(--cream)' }}>{over ? '+' : ''}{clock}</div>
            </div>
          </div>
        </div>
      )}

      <div className="stack" style={{ gap: 16 }}>
        {tasks.map((t, i) => (
          <div key={t.id} className="card">
            <div className="card-head"><h3>{i + 1}. {t.title}</h3></div>
            <p className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 14 }}>{t.prompt}</p>
            <textarea
              rows={7}
              defaultValue={t.response ?? ''}
              placeholder={t.placeholder}
              disabled={readOnly}
              onChange={e => onChange(t.id, e.target.value)}
            />
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="row" style={{ marginTop: 20, gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {!confirming ? (
            <button className="btn solid" onClick={() => setConfirming(true)}>Submit Taking The Watch</button>
          ) : (
            <>
              <span className="small muted">You won’t be able to change any answer after this.</span>
              <button className="btn solid" disabled={submitting} onClick={submit}>
                {submitting ? 'Submitting…' : 'Yes, submit'}
              </button>
              <button type="button" className="btn ghost sm" disabled={submitting} onClick={() => setConfirming(false)}>
                Keep working
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
