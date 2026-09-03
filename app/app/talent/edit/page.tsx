import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSelfProfile } from '@/lib/store';
import Shell from '@/components/Shell';
import ProfileEditor from '@/components/ProfileEditor';

export const dynamic = 'force-dynamic';

export default async function EditProfile() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'client') redirect('/app');
  const self = await getSelfProfile(profile.id);
  return (
    <Shell profile={profile} active="/app/talent" title="Edit your profile" crumb="What executives read first">
      <ProfileEditor initial={{ full_name: profile.full_name, headline: profile.headline, ...self }} />
    </Shell>
  );
}
