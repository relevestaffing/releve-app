'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { money, toCents } from '@/lib/money-public';

/* What Relève pays the talent. The number is written only by the team, into
   talent_pay, which no client can read under any policy.

   Until now the only writers were Add talent (at intake) and an accepted
   offer — a placement made by hand for someone already signed in had no
   pay on file, so the monthly payroll run silently skipped them. This is
   the editor the roster row needed. */
export default function PaySetter({ talentId, cents, compact = false }: {
  talentId: string; cents: number | null; compact?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(cents == null ? '' : String(cents / 100));
  const [busy, setBusy] = useState(false);

  async function save() {
    const c = toCents(text);
    if (c == null || c <= 0) { toast.bad('That is not a monthly rate.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/payout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set_pay', talent_id: talentId, cents: c })
      });
      const d = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) { toast.bad(d.error ? `Not saved. ${d.error}` : 'That did not save.'); return; }
      toast.saved(`We pay ${money(c)} a month`);
      setEditing(false); router.refresh();
    } catch { setBusy(false); toast.bad('No connection, so nothing was saved.'); }
  }

  if (!editing) return (
    <span className="rate-set" style={{ justifyContent: compact ? 'flex-end' : undefined }}>
      {cents != null
        ? <b className="amount">{money(cents)}</b>
        : <span className="pill warn" title="Payroll skips anyone with no pay on file">Not set</span>}
      <button className="btn sm ghost" onClick={() => setEditing(true)}>{cents != null ? 'Change' : 'Set'}</button>
    </span>
  );

  return (
    <span className="rate-set">
      <span className="ff" style={{ margin: 0 }}>
        <input aria-label="Monthly pay in US dollars" value={text} inputMode="decimal" placeholder="1450" disabled={busy} autoFocus
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
      </span>
      <button className="btn sm solid" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Set'}</button>
      <button className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>
    </span>
  );
}
