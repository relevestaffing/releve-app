import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import MessageThread from '@/components/MessageThread';
import { WORDS } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console/messages');

  return (
    <Shell profile={profile} active="/app/messages" title="Messages"
      crumb={profile.role === 'client'
        ? `Straight to ${WORDS.csmShort}`
        : `Straight to ${WORDS.tsmShort}`}>
      <MessageThread subject={profile.id} me={profile.id} />
    </Shell>
  );
}
