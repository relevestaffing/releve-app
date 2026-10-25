import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import TeamInbox from '@/components/TeamInbox';

export const metadata = { title: 'Messages' };

export const dynamic = 'force-dynamic';

export default async function ConsoleMessages({ searchParams }: {
  searchParams: Promise<{ thread?: string; mine?: string; name?: string; role?: string }>;
}) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const { thread, mine, name, role } = await searchParams;
  return (
    <Shell profile={profile} active="/console/messages" title="Messages"
      crumb="Inbox">
      <TeamInbox me={profile.id} initialThread={thread ?? null} initialMine={mine === '1'}
        initialName={name ?? null} initialRole={role === 'talent' ? 'talent' : 'client'} />
    </Shell>
  );
}
