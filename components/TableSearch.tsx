'use client';
import { useEffect, useState } from 'react';

/* Filters the rows of the table it sits above, by any visible text.

   Done in the browser on the rendered rows rather than by re-querying: these
   lists are tens of people, not thousands, and a page that filters the
   instant you type feels considerably better than one that waits. */
export default function TableSearch({ scope, rows = 'tbody > tr', groups, placeholder = 'Search…' }: {
  scope: string;              // id of the element holding the rows
  rows?: string;              // what counts as a row — table rows, or cards
  groups?: string;            // optional wrapper to hide once all its rows are
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [none, setNone] = useState(false);

  useEffect(() => {
    const root = document.getElementById(scope);
    if (!root) return;
    const found = Array.from(root.querySelectorAll<HTMLElement>(rows));
    const needle = q.trim().toLowerCase();
    let shown = 0;
    for (const r of found) {
      const hit = !needle || (r.textContent ?? '').toLowerCase().includes(needle);
      r.style.display = hit ? '' : 'none';
      if (hit) shown++;
    }
    /* A heading left standing over nothing reads as a bug, so a group with no
       surviving rows goes too. */
    const boxes = groups ? Array.from(root.querySelectorAll<HTMLElement>(groups)) : [];
    for (const g of boxes) {
      const any = Array.from(g.querySelectorAll<HTMLElement>(rows))
        .some(r => r.style.display !== 'none');
      g.style.display = any ? '' : 'none';
    }
    setNone(found.length > 0 && shown === 0);
    return () => {
      for (const r of found) r.style.display = '';
      for (const g of boxes) g.style.display = '';
    };
  }, [q, scope, rows, groups]);

  return (
    <div className="ff picker-inline">
      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder={placeholder} aria-label={placeholder} />
      {none && <p className="xs muted" style={{ marginTop: 6 }}>
        Nobody matches &ldquo;{q.trim()}&rdquo;.
      </p>}
    </div>
  );
}
