import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { execInTour } from '@/lib/stage';
import Shell from '@/components/Shell';
import DelegateContent from '@/components/vision/DelegateContent';

export const metadata = { title: 'What to delegate' };

export const dynamic = 'force-dynamic';

/* What to delegate. Body shared with the first-run tour (DelegateContent); the
   page adds the Shell and a closing action that points at the role brief once
   the search is open, and back to the account while it is not. */
export default async function DelegatePage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'client') redirect('/app');

  const tour = await execInTour(profile.id);

  return (
    <Shell profile={profile} active="/app/delegate" title="What to delegate"
      crumb="The map before the role">

      <DelegateContent />

      <div className="next-step">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {tour ? 'When you’re ready' : 'Ready to turn this into a role'}
          </div>
          <div className="small" style={{ maxWidth: 480 }}>
            {tour
              ? 'Nothing to decide yet. The role page walks you through it when your search opens.'
              : 'Pick the areas that matter. The role page walks you through the rest.'}
          </div>
        </div>
        <Link className="btn solid" href={tour ? '/app' : '/app/role'}>
          {tour ? 'Back to your account' : 'Describe the role'}
        </Link>
      </div>
    </Shell>
  );
}
