import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import AskReleve from '@/components/AskReleve';

export const metadata = { title: 'Ask Relève' };
export const dynamic = 'force-dynamic';

/* Ask Relève, for executives and talent: answers about Relève and about
   their own account, grounded in the knowledge the seat may see, with a
   hand-off to their Success Manager for anything a person decides. */
export default async function AskPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console/ask');

  const starters = profile.role === 'client'
    ? ['How does the matching work?', 'What happens after I approve a candidate?', 'When is my first invoice?', 'What does the guarantee cover?']
    : ['What is left on my checklist?', 'How is Taking The Watch scored?', 'How am I paid?', 'What happens once I am placed?'];

  return (
    <Shell profile={profile} active="/app/ask" title="Ask Relève">
      <AskReleve who={profile.role} founder={false} starters={starters} managerHref="/app/messages" />
    </Shell>
  );
}
