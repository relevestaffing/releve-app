'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/Toast';
import { money, toCents } from '@/lib/money-public';

/* What Relève pays the talent on THIS placement, in US dollars a month. A
   talent can work for two executives at once, so pay lives on the placement,
   not the person; the roster rate is only the fallback. Team only, and never
   shown anywhere a client can reach. */
export default function TalentPaySetter({ placementId, cents, fallbackCents, clientCents }: {
  placementId: string; cents: number | null; fallbackCents?: number | null; clientCents?: number | null;
}) {
  const router = useRouter();
  const fromServer = cents ?? fallbackCents ?? null;
  const [editing, setEditing] = useState(fromServer == null);
  const [text, setText] = useState(fromServer == null ? '' : String(fromServer / 100));
  const [busy, setBusy] = useState(false);
  /* The amount just set, shown until the server round-trip lands — without
     it, the instant after saving renders the previous pay, or nothing at all
     when setting it for the first time, and the margin beside it is computed
     from that stale figure too. Same fault and same fix as RateSetter and
     RoleBriefEditor. (12 October.) */
  const [justSet, setJustSet] = useState<number | null>(null);
  const shown = justSet ?? fromServer;

  async function save() {
    const c = toCents(text);
    if (c == null || c <= 0) { toast.bad('That is not a monthly amount.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/payout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set_placement_pay', placement_id: placementId, cents: c })
      });
      const d = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) { toast.bad(d.error ? `Not saved: ${d.error}` : 'That did not save.'); return; }
      toast.saved(`Pay set to ${money(c)} a month for this placement`);
      setJustSet(c); setEditing(false); router.refresh();
    } catch { setBusy(false); toast.bad('No connection. Nothing was saved.'); }
  }

  const margin = shown != null && clientCents != null ? clientCents - shown : null;

  if (!editing) return (
    <span className="rate-set">
      <b className="amount">{money(shown)}</b>
      {/* "roster rate" means this figure is the fallback off the person's
          profile rather than one set for this placement. Once justSet holds a
          value the figure IS placement-specific, even though the `cents` prop
          is still null until the refresh lands — so the label has to clear
          immediately or it mislabels the number that was just typed in. */}
      <span className="xs muted">/mo USD{cents == null && justSet == null && shown != null ? ' · roster rate' : ''}</span>
      {margin != null && <span className={`pill ${margin > 0 ? '' : 'warn'}`}>Margin {money(margin)}</span>}
      <button className="btn sm ghost" onClick={() => setEditing(true)}>Change</button>
    </span>
  );

  return (
    <span className="rate-set">
      <span className="ff" style={{ margin: 0 }}>
        <input aria-label="Talent pay per month in US dollars" value={text} inputMode="decimal" placeholder="1800" disabled={busy}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      </span>
      <button className="btn sm solid" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Set'}</button>
      {shown != null && <button className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>}
    </span>
  );
}
