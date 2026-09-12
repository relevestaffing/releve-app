import type { Profile } from '@/lib/supabase/server';
import { getMySignature } from '@/lib/data';
import { getAvailability, getSelfProfile } from '@/lib/store';
import { listVetting } from '@/lib/work';
import { getRoleBreakdown, getSkills, roleComplete, skillsComplete } from '@/lib/roles';
import { talentSteps, clientSteps, type Step } from '@/lib/onboarding';
import { getPayout } from '@/lib/payout';
import { payoutReady } from '@/lib/payout-public';
import { myWatchStatus } from '@/lib/watch';

/* Where Taking The Watch stands across every discipline they claim, for
   the checklist. Nothing claimed means nothing to take. */
export async function watchStep(talentId: string, skills: any): Promise<'none' | 'cleared' | 'pending' | 'awaiting_review'> {
  const disciplines: string[] = skills?.disciplines ?? [];
  if (!disciplines.length || !skillsComplete(skills)) return 'none';
  const items = await myWatchStatus(talentId, disciplines);
  if (items.length && items.every(i => i.status === 'cleared')) return 'cleared';
  if (items.some(i => i.status === 'awaiting_review') && items.every(i => i.status === 'cleared' || i.status === 'awaiting_review')) return 'awaiting_review';
  return 'pending';
}

/* What is left for this account, computed in one place.
   ------------------------------------------------------
   The dashboard worked this out inline, which meant no other page knew what
   was outstanding — so finishing a setup step left you on a page with no
   sense of what was next and no way back to the list. The first person to use
   the app found her way by guessing at the Menu. */
export async function setupFor(profile: Profile): Promise<Step[]> {
  const side = profile.role === 'client' ? 'client' : 'talent';
  const [self, sig, avail] = await Promise.all([
    getSelfProfile(profile.id),
    getMySignature(profile, side),
    getAvailability(profile.id, '')
  ]);
  const hasAvailability = !!avail.timezone && (avail.windows?.length ?? 0) > 0;

  if (side === 'client') {
    const role = await getRoleBreakdown(profile.id);
    return clientSteps({
      hasSignature: !!sig, hasAvailability,
      hasIntro: !!(self.bio && self.photo_url),
      hasRole: roleComplete(role)
    });
  }

  const [vetting, skills, payout] = await Promise.all([
    listVetting(profile.id), getSkills(profile.id), getPayout(profile.id)
  ]);
  return talentSteps({
    hasSignature: !!sig, hasAvailability,
    signatureInvalid: sig?.validity?.verdict === 'Invalid',
    watch: await watchStep(profile.id, skills),
    hasIntroVideo: !!self.intro_video_url,
    hasSkills: skillsComplete(skills),
    hasProfile: !!(self.bio && (self.skills?.length ?? 0) > 0),
    hasPhoto: !!self.photo_url,
    vettingDone: vetting.filter(v => v.state === 'verified').length,
    vettingTotal: 2,
    vettingSent: vetting.filter(v => v.state === 'submitted').length,
    hasIdentity: vetting.some(v => v.kind === 'identity' && v.state === 'verified'),
    hasPayout: payoutReady(payout)
  });
}
