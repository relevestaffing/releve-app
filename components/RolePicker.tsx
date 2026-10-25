'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saving } from './Toast';
import { TEAM_ROLES, type TeamRole } from '@/lib/care-public';

/* An owner changing what someone on the team may do. Goes through
   /api/admin/team, which is owner-only and fails closed; the database itself
   refuses to leave Relève without an owner.

   Making someone an owner hands them everything, and taking it away from an
   owner can lock the business out of its own money, so those two moves arm a
   confirm beneath the select instead of committing on the pick. */
export default function RolePicker({ userId, name, role, canEdit }: {
  userId: string; name: string; role: TeamRole; canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<TeamRole>(role);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<TeamRole | null>(null);
  const label = (k: TeamRole) => TEAM_ROLES.find(r => r.key === k)?.label ?? k;
  if (!canEdit) return <span className="pill">{label(value)}</span>;

  async function commit(next: TeamRole) {
    const prev = value;
    setValue(next); setBusy(true); setPending(null);
    const ok = await saving(() => fetch('/api/admin/team', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: userId, team_role: next })
    }), `${name} is now ${label(next)}`);
    setBusy(false);
    if (ok) router.refresh(); else setValue(prev);
  }

  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="pill" value={value} disabled={busy}
        aria-label={`Team role for ${name}`}
        style={{ padding: '5px 10px', cursor: 'pointer' }}
        onChange={e => {
          const next = e.target.value as TeamRole;
          if (next === value) return;
          if (next === 'owner' || value === 'owner') { setPending(next); e.target.value = value; return; }
          commit(next);
        }}>
        {TEAM_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
      {pending && (
        <>
          <span className="xs muted">
            {pending === 'owner'
              ? `Make ${name} an owner? They can then mark money paid, void invoices, send payments and change anyone's access.`
              : `Take ownership from ${name} and make them ${label(pending)}? They lose the owner's controls over money and the team.`}
          </span>
          <button className="btn sm solid" disabled={busy} onClick={() => commit(pending)}>
            {busy ? 'Saving…' : pending === 'owner' ? 'Yes, make them an owner' : `Yes, make them ${label(pending)}`}
          </button>
          <button className="btn sm ghost" disabled={busy} onClick={() => setPending(null)}>Keep it</button>
        </>
      )}
    </div>
  );
}
