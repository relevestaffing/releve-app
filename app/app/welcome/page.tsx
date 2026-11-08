import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { getSelfProfile } from '@/lib/store';
import Welcome from '@/components/Welcome';
import ExecFirstRun from '@/components/ExecFirstRun';
import NotInvited from '@/components/NotInvited';
import TermsGate from '@/components/TermsGate';
import { hasAccepted, TERMS_VERSION } from '@/lib/money';

export const metadata = { title: 'Welcome' };

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');

  /* Accounts are opened by invitation. Relève adds a person by hand (or sends
     the onboarding email), and that settles their side the moment they sign in.
     Anyone without that has no account to show, so they are told so before the
     terms or anything else. This page renders outside Shell, so it checks for
     itself. */
  const self: any = await getSelfProfile(profile.id);
  if (!self?.role_chosen_at && !self?.assigned_by_releve && !self?.onboarded_at)
    return <NotInvited email={profile.email} />;

  /* Shell's own terms gate never runs for this page either, so it has to
     check for itself. */
  if (!(await hasAccepted(profile.id, TERMS_VERSION)))
    return <TermsGate name={profile.full_name} side={profile.role === 'client' ? 'client' : 'talent'} />;

  /* Executives walk the three screens on first sign-in; talent keep their own
     short intro. */
  if (profile.role === 'client') return <ExecFirstRun />;
  return <Welcome role="talent" />;
}
