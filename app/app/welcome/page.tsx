import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSelfProfile } from '@/lib/store';
import Welcome from '@/components/Welcome';
import ExecFirstRun from '@/components/ExecFirstRun';
import ChooseRole from '@/components/ChooseRole';
import TermsGate from '@/components/TermsGate';
import { hasAccepted, TERMS_VERSION } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');

  /* This page renders outside Shell (there is no nav yet to put someone
     into), which means Shell's own terms gate never runs for it either —
     so it has to check for itself. Without this, a signed-in link straight
     to /app/welcome reached the account without ever passing the gate every
     other page enforces. */
  if (!(await hasAccepted(profile.id, TERMS_VERSION)))
    return <TermsGate name={profile.full_name} side={profile.role === 'client' ? 'client' : 'talent'} />;

  /* Anyone Relève added by hand already has a side, and is never asked.
     Everyone else picks one before they see anything else. */
  const self: any = await getSelfProfile(profile.id);
  if (!self?.role_chosen_at && !self?.assigned_by_releve)
    return <ChooseRole name={profile.full_name} />;

  /* Executives walk the three screens on first sign-in; talent keep their own
     short intro. */
  if (profile.role === 'client') return <ExecFirstRun />;
  return <Welcome role="talent" />;
}
