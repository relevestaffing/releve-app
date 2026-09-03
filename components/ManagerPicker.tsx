'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';

type Person = { user_id: string; name: string; team_role: string };

/* Who looks after this placement. The console flags a placement with no
   manager, so there has to be somewhere to fix it — a warning you cannot act
   on is just nagging. */
export default function ManagerPicker({ placementId, team, csm, tsm }: {
  placementId: string; team: Person[]; csm: string | null; tsm: string | null;
}) {
  const router = useRouter();
  const [c, setC] = useState(csm ?? '');
  const [t, setT] = useState(tsm ?? '');
  const [busy, setBusy] = useState(false);

  async function save(nextC: string, nextT: string) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/care', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'assign_managers', placement_id: placementId,
        csm_id: nextC || null, tsm_id: nextT || null
      })
    }), 'Manager assigned');
    setBusy(false);
    if (ok) router.refresh(); else { setC(csm ?? ''); setT(tsm ?? ''); }
  }

  const opts = (kind: 'client_success' | 'talent_success') => [
    <option key="" value="">Nobody yet</option>,
    ...team
      .filter(p => p.team_role === kind || p.team_role === 'owner' || p.team_role === 'manager')
      .map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)
  ];

  return (
    <div className="grid-2" style={{ gap: 14 }}>
      <div className="ff">
        <label>Client Success Manager</label>
        <select value={c} disabled={busy}
          onChange={e => { setC(e.target.value); save(e.target.value, t); }}>
          {opts('client_success')}
        </select>
      </div>
      <div className="ff">
        <label>Talent Success Manager</label>
        <select value={t} disabled={busy}
          onChange={e => { setT(e.target.value); save(c, e.target.value); }}>
          {opts('talent_success')}
        </select>
      </div>
    </div>
  );
}
