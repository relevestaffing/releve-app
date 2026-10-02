import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listAllPlacements, listPeople } from '@/lib/work';
import { replacementsOwed } from '@/lib/care';
import { mineFor } from '@/lib/experience';
import Shell from '@/components/Shell';
import PlacementMaker from '@/components/PlacementMaker';

export const dynamic = 'force-dynamic';

export default async function ConsolePlacements({ searchParams }: { searchParams: Promise<{ replace?: string; mine?: string }> }) {
  const { replace, mine: mineParam } = await searchParams;
  const mine = mineParam === '1';
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const [people, all, owed] = await Promise.all([
    listPeople(), listAllPlacements(), replacementsOwed()
  ]);
  const scope = mine ? await mineFor(profile.id) : null;
  const placements = scope ? all.filter(p => scope.placements.has(p.id)) : all;
  const base = replace ? `/console/placements?replace=${encodeURIComponent(replace)}` : '/console/placements';
  const join = base.includes('?') ? '&' : '?';
  return (
    <Shell profile={profile} active="/console/placements" title="Placements"
      crumb="Who is working with whom"
      action={
        <span className="row" role="group" aria-label="Whose placements" style={{ gap: 6 }}>
          <Link className={`btn sm ${mine ? 'ghost' : 'solid'}`} href={base} aria-current={!mine ? 'true' : undefined}>Everyone</Link>
          <Link className={`btn sm ${mine ? 'solid' : 'ghost'}`} href={`${base}${join}mine=1`} aria-current={mine ? 'true' : undefined}>Mine</Link>
        </span>
      }>
      <PlacementMaker people={people} placements={placements}
        owed={owed}
        initialReplaces={replace ?? ''} />
    </Shell>
  );
}
