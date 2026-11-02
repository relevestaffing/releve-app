'use client';
import { useEffect, useState } from 'react';
import CheckMark from './CheckMark';

/* A small, visible confirmation. Saves used to change a button label at the
   bottom of a long form — easy to miss, and it said "Saved" even when the
   request had failed. This says what actually happened, where you can see it. */

type Kind = 'ok' | 'bad';
type Note = { id: number; kind: Kind; text: string; action?: { label: string; run: () => void } };

let subscribers: ((n: Note) => void)[] = [];
let seq = 0;

function push(kind: Kind, text: string, action?: Note['action']) {
  const n = { id: ++seq, kind, text, action };
  subscribers.forEach(fn => fn(n));
}

export const toast = {
  saved: (text = 'Saved') => push('ok', text),
  ok: (text: string) => push('ok', text),
  bad: (text = 'That did not save. Please try again.') => push('bad', text),
  /* A change that can be taken back: the toast carries an Undo button for a
     few seconds (the Directory, 2 November 2026). */
  undo: (text: string, run: () => void) => push('ok', text, { label: 'Undo', run })
};

/* Wrap a save. Returns true when it actually worked. */
export async function saving<T extends Response>(
  run: () => Promise<T>,
  okText = 'Saved'
): Promise<boolean> {
  try {
    const res = await run();
    if (!res.ok) {
      let why = '';
      try { why = (await res.json())?.error ?? ''; } catch { /* not json */ }
      toast.bad(why ? `Not saved. ${why}` : 'That did not save. Please try again.');
      return false;
    }
    toast.saved(okText);
    return true;
  } catch {
    toast.bad('No connection, so nothing was saved.');
    return false;
  }
}

export default function Toaster() {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    const fn = (n: Note) => {
      setNotes(list => [...list, n]);
      setTimeout(() => setNotes(list => list.filter(x => x.id !== n.id)), n.action ? 6500 : 4200);
    };
    subscribers.push(fn);
    return () => { subscribers = subscribers.filter(x => x !== fn); };
  }, []);

  if (!notes.length) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {notes.map(n => (
        <div key={n.id} className={`toast ${n.kind}`}>
          <span className="toast-mark" aria-hidden="true">{n.kind === 'ok' ? <CheckMark /> : '!'}</span>
          {n.text}
          {n.action && (
            <button type="button" className="toast-act" onClick={() => {
              n.action!.run(); setNotes(list => list.filter(x => x.id !== n.id));
            }}>{n.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}
