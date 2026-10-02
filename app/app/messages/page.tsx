import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import MessagesTabs, { type MessageTab } from '@/components/MessagesTabs';
import { listPlacementsFor } from '@/lib/work';
import { primaryManager, unreadByThread, placementThread, subjectThread } from '@/lib/experience';
import { WORDS, firstName } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console/messages');
  const { tab } = await searchParams;

  const [placements, manager, unread] = await Promise.all([
    listPlacementsFor(profile.id), primaryManager(profile), unreadByThread()
  ]);
  const managerLabel = manager.id
    ? firstName(manager.name)
    : (profile.role === 'client' ? WORDS.csm : WORDS.tsm);
  const tabs: MessageTab[] = [
    { key: 'sm', label: managerLabel, subject: profile.id, unread: unread[subjectThread(profile.id)] ?? 0 },
    ...placements.map(p => ({
      key: p.id, placement: p.id,
      theirName: profile.role === 'client' ? p.talent_name : p.client_name,
      label: profile.role === 'client' ? p.talent_name : (p.org_name ?? p.client_name),
      unread: unread[placementThread(p.id)] ?? 0
    }))
  ];

  return (
    <Shell profile={profile} active="/app/messages" title="Messages"
      crumb={placements.length
        ? (manager.id ? `${manager.name}, and whoever you are placed with` : 'Your Success Manager, and whoever you are placed with')
        : (manager.id ? `Straight to ${manager.name}` : (profile.role === 'client' ? `Straight to ${WORDS.csmShort}` : `Straight to ${WORDS.tsmShort}`))}>
      <MessagesTabs me={profile.id} tabs={tabs} initial={tab ?? null} manager={manager} />
    </Shell>
  );
}
