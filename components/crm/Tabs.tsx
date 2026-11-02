'use client';
import './crm.css';
import { useEffect, useState } from 'react';

/* Tabs for a full record page (2 November 2026). Each tab's content is
   rendered on the server and handed over; the open tab is kept in the
   address bar so a link can point straight at it. */
export default function Tabs({ tabs, initial }: { tabs: { key: string; label: string; count?: number; body: React.ReactNode }[]; initial?: string }) {
  const [on, setOn] = useState(initial ?? tabs[0]?.key);
  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get('tab');
    if (t && tabs.some(x => x.key === t)) setOn(t);
  }, [tabs]);
  const pick = (k: string) => {
    setOn(k);
    const u = new URL(window.location.href); u.searchParams.set('tab', k);
    window.history.replaceState(null, '', u.toString());
  };
  return (
    <div className="ws ws-x ws-record">
      <div className="ws-tabs" role="tablist" style={{ margin: 0, padding: '6px 22px 0' }}>
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={on === t.key} className={on === t.key ? 'on' : ''} onClick={() => pick(t.key)}>
            {t.label}{t.count ? <span className="ws-faint" style={{ marginLeft: 6, fontSize: 12 }}>{t.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="ws-record-body">
        {tabs.map(t => <div key={t.key} hidden={on !== t.key}>{t.body}</div>)}
      </div>
    </div>
  );
}
