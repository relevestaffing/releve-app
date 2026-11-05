'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* The console's one search (4 November 2026). Type a name, a company, an email
   or an invoice number; each match is one row that opens the record. Enter
   opens the first. See app/api/admin/find. */
type Hit = { kind: string; label: string; sub: string; href: string };

export default function ConsoleSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); setBusy(false); return; }
    const n = ++seq.current;
    setBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/find?q=${encodeURIComponent(term)}`, { cache: 'no-store' });
        const j = await r.json();
        if (n === seq.current) setHits(Array.isArray(j.hits) ? j.hits : []);
      } catch { if (n === seq.current) setHits([]); }
      finally { if (n === seq.current) setBusy(false); }
    }, 220);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="console-search" role="search">
      <label className="cs-box">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20" />
        </svg>
        <input type="search" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && hits && hits[0]) router.push(hits[0].href); if (e.key === 'Escape') setQ(''); }}
          placeholder="Search people, leads, placements, invoices" aria-label="Search the console"
          autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
        {q && <button type="button" className="cs-clear" onClick={() => setQ('')} aria-label="Clear">Clear</button>}
      </label>
      {hits !== null && (
        <div className="cs-results" aria-live="polite">
          {busy && !hits.length ? <p className="cs-empty">Looking…</p>
            : !hits.length ? <p className="cs-empty">Nothing matches &ldquo;{q.trim()}&rdquo;. Try a first name, a company or an email.</p>
            : (
              <ul>
                {hits.map((h, i) => (
                  <li key={h.href + i}>
                    <Link href={h.href} className="cs-hit">
                      <span className="cs-kind">{h.kind}</span>
                      <span className="cs-main"><b>{h.label}</b><span>{h.sub}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
