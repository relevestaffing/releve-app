import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';

export const metadata = { title: 'Free resources' };
export const dynamic = 'force-dynamic';

/* Free resources for executives (29 Oct 2026, Nona: add the free training
   "as a free resource in the executive portal"). The training lives on the
   marketing site; ?member=1 opens it without the sign-up form and swaps its
   closing sales call-to-action for a note to message Relève. */
const TRAINING = 'https://relevestaffing.com/training?member=1';

export default async function Resources() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console');
  if (profile.role !== 'client') redirect('/app');

  return (
    <Shell profile={profile} active="/app/resources" title="Free resources">

      <div className="card">
        <div className="eyebrow">Free training</div>
        <h2 style={{ margin: '8px 0 10px', fontWeight: 400 }}>The Handled Business</h2>
        <p style={{ maxWidth: 620, margin: '0 0 12px' }}>
          Sixteen short lessons on exactly where a virtual professional steps into a business:
          your inbox, calendar, social media, email marketing, lead follow-up, client experience,
          billing, operations, personal admin and AI automation. Each one shows the week before and
          after, the hours it gives back and where the revenue comes from.
        </p>
        <p className="small muted" style={{ maxWidth: 620, margin: '0 0 18px' }}>
          Use it to see what else you could hand off, or share the ideas with your professional.
          About 80 minutes in total, at your own pace.
        </p>
        <a className="btn solid" href={TRAINING} target="_blank" rel="noopener">Open the training</a>
      </div>
    </Shell>
  );
}
