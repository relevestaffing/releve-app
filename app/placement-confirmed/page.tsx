import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getUnrevealedPlacement } from '@/lib/work';
import { getSelfProfile } from '@/lib/store';
import { fmtDate } from '@/lib/words';
import PlacementRevealScreen from '@/components/PlacementRevealScreen';

/* Reached one of two ways for either side: the redirect in app/app/page.tsx
   for whoever has an unrevealed placement, or someone typing the URL
   directly — both are handled the same way, by checking for real. Nobody
   sees their own side's screen a second time; once that side's flag flips,
   the next visit here just bounces to /app. */
export const dynamic = 'force-dynamic';

export default async function PlacementConfirmedPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'talent' && profile.role !== 'client') redirect('/console');
  const side = profile.role;

  const placement = await getUnrevealedPlacement(profile.id, side);
  if (!placement) redirect('/app');

  /* Only a placement made from an accepted offer carries its own role_title.
     Failing that: a talent falls back to their own headline; a client falls
     back to the talent's headline (already fetched alongside the
     counterpart's name) — and only then a plain line, rather than blank. */
  let roleTitleFallback: string | null = null;
  if (!placement.roleTitle && side === 'talent') {
    const self: any = await getSelfProfile(profile.id);
    roleTitleFallback = self?.headline || 'Your new role';
  }
  const roleTitle: string =
    placement.roleTitle || roleTitleFallback || placement.counterpartHeadline || 'Their new role';

  return (
    <PlacementRevealScreen
      counterpartLabel={side === 'talent' ? 'CLIENT' : 'TALENT'}
      counterpartName={placement.counterpartName}
      roleTitle={roleTitle}
      startDate={fmtDate(placement.startedOn)}
    />
  );
}
