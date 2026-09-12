import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listAllPlacements, listPeople } from '@/lib/work';
import { replacementsOwed } from '@/lib/care';
import Shell from '@/components/Shell';
import PlacementMaker from '@/components/PlacementMaker';

export const dynamic = 'force-dynamic';

export default async function ConsolePlacements() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const [people, placements, owed] = await Promise.all([
    listPeople(), listAllPlacements(), replacementsOwed()
  ]);
  return (
    <Shell profile={profile} active="/console/placements" title="Placements"
      crumb="Who is working with whom">
      <PlacementMaker people={people} placements={placements} owed={owed} />
    </Shell>
  );
}
