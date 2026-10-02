import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import TeamInbox from '@/components/TeamInbox';

export const dynamic = 'force-dynamic';

export default async function ConsoleMessages({ searchParams }: {
  searchParams: Promise<{ thread?: string; mine?: string }>;
}) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const { thread, mine } = await searchParams;
  return (
    <Shell profile={profile} active="/console/messages" title="Messages"
      crumb="Executives and talent, writing to you and to each other">
      <TeamInbox me={profile.id} initialThread={thread ?? null} initialMine={mine === '1'} />
    </Shell>
  );
}
