'use client';
import { useEffect, useState } from 'react';

/* One invoice per placement per month adds up fast: twenty placements is 240
   rows inside a year, in a table with no search and no filter. The number she
   actually wants — what is unpaid — was only reachable by scrolling. */
const TABS: { key: string; label: string; match: (s: string, late: number) => boolean }[] = [
  { key: 'open',    label: 'Unpaid',  match: s => s === 'draft' || s === 'sent' },
  { key: 'late',    label: 'Overdue', match: (s, late) => (s === 'draft' || s === 'sent') && late > 0 },
  { key: 'paid',    label: 'Paid',    match: s => s === 'paid' },
  { key: 'all',     label: 'All',     match: () => true }
];

export default function InvoiceFilter({ scope }: { scope: string }) {
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const root = document.getElementById(scope);
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('tbody > tr'));
    const rule = TABS.find(t => t.key === tab)!;
    const needle = q.trim().toLowerCase();
    let n = 0;
    for (const r of rows) {
      const status = r.dataset.status ?? '';
      const late = Number(r.dataset.late ?? 0);
      const hit = rule.match(status, late)
        && (!needle || (r.textContent ?? '').toLowerCase().includes(needle));
      r.style.display = hit ? '' : 'none';
      if (hit) n++;
    }
    setShown(n);
    return () => { for (const r of rows) r.style.display = ''; };
  }, [tab, q, scope]);

  return (
    <div className="row between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} className={`btn sm ${tab === t.key ? 'solid' : 'ghost'}`} aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 10 }}>
        {shown === 0 && <span className="xs muted">Nothing here.</span>}
        <div className="ff picker-inline" style={{ margin: 0 }}>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by executive or number…" aria-label="Search invoices" />
        </div>
      </div>
    </div>
  );
}
