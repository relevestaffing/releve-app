'use client';
import { useState } from 'react';
import MessageThread from './MessageThread';

export type MessageTab =
  | { key: string; label: string; subject: string }
  | { key: string; label: string; placement: string; theirName: string };

/* One person can have more than one line open at once: their Success
   Manager, plus a direct line for each active placement. With just one
   tab (no placement yet, or it already ended) this skips the switcher
   entirely and shows that one thread — the common case for anyone not
   yet placed. */
export default function MessagesTabs({ me, tabs }: { me: string; tabs: MessageTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const t = tabs.find(x => x.key === active) ?? tabs[0];
  if (!t) return null;

  const thread = 'subject' in t
    ? <MessageThread subject={t.subject} me={me} />
    : <MessageThread placement={t.placement} me={me} theirName={t.theirName} />;

  if (tabs.length === 1) return thread;

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map(x => (
          <button key={x.key} type="button" className={`btn sm ${x.key === t.key ? 'solid' : 'ghost'}`}
            onClick={() => setActive(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
      {thread}
    </div>
  );
}
