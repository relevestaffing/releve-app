import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSkills } from '@/lib/roles';
import Shell from '@/components/Shell';
import NextStep from '@/components/NextStep';
import { setupFor } from '@/lib/setup';
import SkillsForm from '@/components/SkillsForm';

export const dynamic = 'force-dynamic';

export default async function SkillsPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'talent') redirect('/app');
  const initial = await getSkills(profile.id);

  return (
    <Shell profile={profile} active="/app/skills" title="Your skills"
      crumb="The work you are strongest at">
      <SkillsForm initial={initial} />
      <NextStep steps={await setupFor(profile)} current="skills" />
    </Shell>
  );
}
