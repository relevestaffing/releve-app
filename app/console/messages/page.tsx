import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import TeamInbox from '@/components/TeamInbox';

export const dynamic = 'force-dynamic';

export default async function ConsoleMessages() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  return (
    <Shell profile={profile} active="/console/messages" title="Messages"
      crumb="Executives and talent, writing to you">
      <TeamInbox me={profile.id} />
    </Shell>
  );
}
