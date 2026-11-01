'use client';
import { useEffect, useState } from 'react';
import AskReleve from './AskReleve';

/* Ask Relève, everywhere.
   ----------------------
   A small square launcher in the corner of every signed-in page. Tap it and
   the conversation opens beside it (a full sheet on phones), the same
   AskReleve component the standalone pages use, so the seat, the knowledge
   and the founder's confirm cards are identical. Open or closed is remembered
   for the session; the thread itself is kept by AskReleve. */

export default function AskWidget({ who, founder, starters, managerHref }: {
  who: 'client' | 'talent' | 'admin'; founder: boolean; starters: string[]; managerHref: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { try { if (sessionStorage.getItem('releve_ask_open') === '1') setOpen(true); } catch {} }, []);
  useEffect(() => {
    try { sessionStorage.setItem('releve_ask_open', open ? '1' : '0'); } catch {}
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" className={`ask-fab${open ? ' open' : ''}`} aria-expanded={open} aria-controls="ask-panel"
        onClick={() => setOpen(o => !o)} title={open ? 'Close' : 'Ask Relève'}>
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5h14v8.5H8.5L5 16.5V13H3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        )}
        <span className="ask-fab-label">{open ? 'Close' : 'Ask Relève'}</span>
      </button>
      {open && (
        <div id="ask-panel" className="ask-panel" role="dialog" aria-label="Ask Relève">
          <div className="ask-panel-head">
            <div>
              <div className="ask-panel-title">Ask Relève</div>
              <div className="xs muted">{who === 'admin' ? (founder ? 'Look things up, or tell it what to fix.' : 'Look things up across the console.') : 'Anything about Relève or your account.'}</div>
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              {founder && <a className="xs" href="/console/ask" style={{ textDecoration: 'underline' }}>Log</a>}
              <button type="button" className="ask-panel-close" aria-label="Close" onClick={() => setOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          </div>
          <AskReleve who={who} founder={founder} starters={starters} managerHref={managerHref} compact />
        </div>
      )}
    </>
  );
}
