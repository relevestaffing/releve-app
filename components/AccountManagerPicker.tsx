'use client';
import { useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from '@/components/Toast';

type Person = { user_id: string; name: string; team_role: string };

/* Who owns this account, end to end: the Client Success Manager for an
   executive, the Talent Success Manager for a talent. Held on the person
   (profiles.csm_id / profiles.tsm_id), so it is set from onboarding onward,
   not only once a placement exists. Same team filter as ManagerPicker: the
   owner, a general manager, or someone in the matching success role. */
export default function AccountManagerPicker({ personId, side, team, current }: {
  personId: string; side: 'client' | 'talent'; team: Person[]; current: string | null;
}) {
  const fid = useId();
  const router = useRouter();
  const [value, setValue] = useState(current ?? '');
  const [busy, setBusy] = useState(false);

  const kind = side === 'client' ? 'client_success' : 'talent_success';
  const label = side === 'client' ? 'Client Success Manager' : 'Talent Success Manager';

  async function save(next: string) {
    setBusy(true);
    const ok = await saving(() => fetch('/api/care', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'assign_account_manager', person_id: personId, side,
        manager_id: next || null
      })
    }), 'Account manager assigned');
    setBusy(false);
    if (ok) router.refresh(); else setValue(current ?? '');
  }

  return (
    <div className="ff">
      <label htmlFor={fid}>{label}</label>
      <select id={fid} value={value} disabled={busy}
        onChange={e => { setValue(e.target.value); save(e.target.value); }}>
        <option value="">Nobody yet</option>
        {team
          .filter(p => p.team_role === kind || p.team_role === 'owner' || p.team_role === 'manager')
          .map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
      </select>
    </div>
  );
}
