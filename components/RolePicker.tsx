'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { TEAM_ROLES, type TeamRole } from '@/lib/care-public';

/* An owner changing what someone on the team may do. Goes through
   /api/admin/team, which is owner-only and fails closed; the database itself
   refuses to leave Relève without an owner. */
export default function RolePicker({ userId, name, role, canEdit }: {
  userId: string; name: string; role: TeamRole; canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<TeamRole>(role);
  const [busy, setBusy] = useState(false);
  const label = (k: TeamRole) => TEAM_ROLES.find(r => r.key === k)?.label ?? k;
  if (!canEdit) return <span className="pill">{label(value)}</span>;

  return (
    <select className="pill" value={value} disabled={busy}
      aria-label={`Team role for ${name}`}
      style={{ padding: '5px 10px', cursor: 'pointer' }}
      onChange={async e => {
        const prev = value;
        const next = e.target.value as TeamRole;
        setValue(next); setBusy(true);
        const ok = await saving(() => fetch('/api/admin/team', {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_id: userId, team_role: next })
        }), `${name} is now ${label(next)}`);
        setBusy(false);
        if (ok) router.refresh(); else setValue(prev);
      }}>
      {TEAM_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
    </select>
  );
}
