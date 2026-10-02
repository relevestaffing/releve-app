'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { money, toCents, rateInRange, RATE_MIN_CENTS, RATE_MAX_CENTS } from '@/lib/money-public';

/* What the client pays. Never what the talent is paid — that lives on the
   profile and no client-facing view may touch it. */
export default function RateSetter({ placementId, cents }: { placementId: string; cents: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(cents == null);
  const [text, setText] = useState(cents == null ? '' : String(cents / 100));
  const [busy, setBusy] = useState(false);

  async function save() {
    const c = toCents(text);
    if (c == null || c <= 0) { toast.bad('That is not a rate.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/money', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set_rate', placement_id: placementId, cents: c })
      });
      const d = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) { toast.bad(d.error ? `Not saved: ${d.error}` : 'That did not save.'); return; }
      /* Saved either way, but say so when it sits outside the quoted band —
         a number outside $2,500–$4,500 should be deliberate, not a typo. */
      if (d.outsideQuotedBand)
        toast.ok(`Set to ${money(c)}, outside the ${money(RATE_MIN_CENTS)} to ${money(RATE_MAX_CENTS)} band`);
      else toast.saved(`Rate set to ${money(c)} a month`);
      setEditing(false); router.refresh();
    } catch { setBusy(false); toast.bad('No connection. Nothing was saved.'); }
  }

  if (!editing) return (
    <span className="rate-set">
      <b className="amount">{money(cents)}</b>
      <span className="xs muted">/mo</span>
      {cents != null && !rateInRange(cents) && <span className="pill warn">Outside band</span>}
      <button className="btn sm ghost" onClick={() => setEditing(true)}>Change</button>
    </span>
  );

  return (
    <span className="rate-set">
      <span className="ff" style={{ margin: 0 }}>
        <input aria-label="Monthly rate in US dollars" value={text} inputMode="decimal" placeholder="3500" disabled={busy}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      </span>
      <button className="btn sm solid" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Set'}</button>
      {cents != null && <button className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>}
    </span>
  );
}
