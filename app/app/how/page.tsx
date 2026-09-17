import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import HowContent from '@/components/vision/HowContent';

export const dynamic = 'force-dynamic';

/* How Relève works, in full — the page an executive can revisit any time.
   The body is shared with the first-run tour (HowContent); the page adds the
   Shell and its own closing action. */
export default async function HowPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');

  return (
    <Shell profile={profile} active="/app/how" title="How Relève works"
      crumb="Our method, in full">

      <HowContent />

      <div className="next-step">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Where the value is</div>
          <div className="small" style={{ maxWidth: 560 }}>
            See how the retainer compares to hiring and holding the same person full-time.
          </div>
        </div>
        <Link className="btn solid" href="/app/value">The value, in your own numbers</Link>
      </div>
    </Shell>
  );
}
