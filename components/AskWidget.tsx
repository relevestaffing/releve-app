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
        <span className="ask-fab-mark" aria-hidden="true">{open ? '\u00d7' : 'R'}</span>
        <span className="sr-only">{open ? 'Close' : 'Ask Relève'}</span>
      </button>
      {open && (
        <div id="ask-panel" className="ask-panel" role="dialog" aria-label="Ask Relève">
          <div className="ask-panel-head">
            <div className="ask-presence">
              <div className="ask-mark lg" aria-hidden="true">R<i /></div>
              <div>
                <div className="ask-panel-title">Relève</div>
                <div className="ask-presence-sub">{who === 'admin' ? (founder ? 'Looks things up, proposes fixes' : 'Looks things up across the console') : 'Usually replies in seconds'}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              {founder && <a className="xs ask-log" href="/console/ask">Log</a>}
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
