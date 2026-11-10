import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import HowContent from '@/components/vision/HowContent';

export const metadata = { title: 'How Relève works' };

export const dynamic = 'force-dynamic';

/* How Relève works, in full — the page an executive can revisit any time.
   The body is shared with the first-run tour (HowContent); the page adds the
   Shell and its own closing action. */
export default async function HowPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');
  /* written for executives; talent have their own first-run tour */
  if (profile.role === 'talent') redirect('/app');

  return (
    <Shell profile={profile} active="/app/how" title="How Relève works">

      <HowContent />

      <div className="next-step">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Next</div>
          <div className="small" style={{ maxWidth: 560 }}>
            See the hours and dollars that come back to you, in your own numbers.
          </div>
        </div>
        <Link className="btn solid" href="/app/value">See the value</Link>
      </div>
    </Shell>
  );
}
