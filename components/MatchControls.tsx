'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saving } from '@/components/Toast';

export default function MatchControls({ clientId, talentId, matched, released, manual }: {
  clientId: string; talentId: string; matched: boolean; released: boolean; manual: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    setBusy(true);
    const word: Record<string, string> = {
      add: 'Matched', remove: 'Unmatched',
      release: 'Released to the client', unrelease: 'Hidden from the client again'
    };
    const ok = await saving(() => fetch('/api/admin/matches', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, talentId, action })
    }), word[action] ?? 'Saved');
    setBusy(false);
    if (ok) router.refresh();
  }
  return (
    <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {manual && <span className="pill" title="Added by hand, not by the engine">Manual</span>}
      {!matched
        ? <button className="btn sm ghost" disabled={busy} onClick={() => act('add')}>Match</button>
        : (
          <>
            {released
              ? <button className="btn sm ghost" disabled={busy} onClick={() => act('unrelease')}>Unrelease</button>
              : <button className="btn sm solid" disabled={busy} onClick={() => act('release')}>Release</button>}
            <button className="btn sm ghost" disabled={busy} onClick={() => act('remove')}>Unmatch</button>
          </>
        )}
    </div>
  );
}
