import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getRoleBreakdown } from '@/lib/roles';
import Shell from '@/components/Shell';
import NextStep from '@/components/NextStep';
import { setupFor } from '@/lib/setup';
import RoleBreakdownForm from '@/components/RoleBreakdownForm';

export const dynamic = 'force-dynamic';

export default async function RolePage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'client') redirect('/app');
  const initial = await getRoleBreakdown(profile.id);

  return (
    <Shell profile={profile} active="/app/role" title="The role"
      crumb="What the person you hire will own">
      <RoleBreakdownForm initial={initial} />
      <NextStep steps={await setupFor(profile)} current="role" />
    </Shell>
  );
}
