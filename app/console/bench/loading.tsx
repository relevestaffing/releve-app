import { SkelShell, SkelCard, SkelTable, Skel } from '@/components/Skeleton';

/* Shown while the real Talent Roster awaits getBench() — the roster is
   read on every visit (never cached), so this is the page's actual first
   paint as often as not. See PreLaunch Audit, P1. */
export default function Loading() {
  return (
    <SkelShell>
      <div className="card tight">
        <Skel style={{ width: '85%' }} />
        <Skel style={{ width: '55%' }} />
      </div>

      <SkelCard titleWidth={160}>
        <SkelTable
          cols={['Name', 'Role', 'Profile', 'Disposition', 'Validity', 'We pay', 'Stage', '']}
          rows={7}
          firstColAvatar
        />
      </SkelCard>
    </SkelShell>
  );
}
