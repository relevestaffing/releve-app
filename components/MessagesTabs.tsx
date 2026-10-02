'use client';
import { useEffect, useState } from 'react';
import MessageThread from './MessageThread';
import type { Manager } from '@/lib/experience-public';

export type MessageTab =
  | { key: string; label: string; subject: string; unread?: number }
  | { key: string; label: string; placement: string; theirName: string; unread?: number };

/* One person can have more than one line open at once: their Success
   Manager, plus a direct line for each active placement. With just one tab
   this skips the switcher entirely and shows that one thread.

   ?tab= picks the tab on arrival ("sm" for the manager, or a placement id),
   which is what lets an email or the dashboard's "Message" button land on
   the right conversation instead of always the manager's. */
export default function MessagesTabs({ me, tabs, initial, manager }: {
  me: string; tabs: MessageTab[]; initial?: string | null; manager?: Manager;
}) {
  const start = tabs.find(x => x.key === initial)?.key ?? tabs[0]?.key;
  const [active, setActive] = useState(start);
  const [seen, setSeen] = useState<Record<string, boolean>>({ [start ?? '']: true });
  const t = tabs.find(x => x.key === active) ?? tabs[0];

  useEffect(() => {
    if (!t) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', t.key);
      window.history.replaceState(null, '', u.toString());
    } catch { /* the address bar is a convenience */ }
  }, [t]);

  if (!t) return null;

  const thread = 'subject' in t
    ? <MessageThread key={t.key} subject={t.subject} me={me} manager={manager} />
    : <MessageThread key={t.key} placement={t.placement} me={me} theirName={t.theirName} />;

  if (tabs.length === 1) return thread;

  return (
    <div className="stack">
      <div className="msg-tabs" role="tablist" aria-label="Conversations">
        {tabs.map(x => {
          const unread = !seen[x.key] && (x.unread ?? 0) > 0 ? x.unread! : 0;
          return (
            <button key={x.key} type="button" role="tab" aria-selected={x.key === t.key}
              className={`btn sm ${x.key === t.key ? 'solid' : 'ghost'}`}
              onClick={() => { setActive(x.key); setSeen(s => ({ ...s, [x.key]: true })); }}>
              {x.label}
              {unread > 0 && <span className="tab-badge" aria-label={`${unread} unread`}>{unread}</span>}
            </button>
          );
        })}
      </div>
      {thread}
    </div>
  );
}
