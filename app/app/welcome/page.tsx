import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSelfProfile } from '@/lib/store';
import Welcome from '@/components/Welcome';
import ChooseRole from '@/components/ChooseRole';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');

  /* Anyone Relève added by hand already has a side, and is never asked.
     Everyone else picks one before they see anything else. */
  const self: any = await getSelfProfile(profile.id);
  if (!self?.role_chosen_at && !self?.assigned_by_releve)
    return <ChooseRole name={profile.full_name} />;

  return <Welcome role={profile.role === 'client' ? 'client' : 'talent'} />;
}
