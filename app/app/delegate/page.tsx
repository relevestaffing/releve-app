import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { execInTour } from '@/lib/stage';
import Shell from '@/components/Shell';
import DelegateContent from '@/components/vision/DelegateContent';

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
      crumb="The map before the brief">

      <DelegateContent />

      <div className="next-step">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {tour ? 'When you’re ready' : 'Ready to turn this into a role'}
          </div>
          <div className="small" style={{ maxWidth: 560 }}>
            {tour
              ? 'You do not have to decide any of this yet. Once your search is open, the role brief walks you through it, one competency at a time, with the option to say “not needed” to anything that is not yours.'
              : 'You do not have to choose everything, or get it perfect. Pick the areas that matter, and the role brief walks you through the rest, one competency at a time, with the option to say “not needed” to anything that is not yours.'}
          </div>
        </div>
        <Link className="btn solid" href={tour ? '/app' : '/app/role'}>
          {tour ? 'Back to your account' : 'Build your role brief'}
        </Link>
      </div>
    </Shell>
  );
}
