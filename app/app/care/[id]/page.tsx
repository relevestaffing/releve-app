import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { listPlacementsFor } from '@/lib/work';
import Shell from '@/components/Shell';
import PlacementView from '@/components/PlacementView';
import { firstName } from '@/lib/words';

export const dynamic = 'force-dynamic';

/* One person, for an executive with more than one.
   -----------------------------------------------
   The placement is looked up inside the list this account is allowed to see
   rather than fetched by id and checked afterwards. An id that is not theirs
   is simply not found, which is the same answer as an id that does not exist —
   nothing about somebody else's placement leaks, not even that it is real. */
export default async function OnePlacement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console/care');

  const side = profile.role === 'client' ? 'client' : 'talent';
  const placements = await listPlacementsFor(profile.id);
  const p = placements.find(x => x.id === id);
  if (!p) notFound();

  return (
    <Shell profile={profile} active={`/app/care/${p.id}`}
      title={side === 'client' ? `Working with ${firstName(p.talent_name)}` : 'Your placement'}
      crumb={side === 'client' ? p.talent_name : (p.org_name ?? p.client_name)}
      action={placements.length > 1
        ? <Link className="btn sm ghost" href="/app/care">All {placements.length}</Link>
        : undefined}>
      <PlacementView placement={p} side={side} userId={profile.id} />
    </Shell>
  );
}
