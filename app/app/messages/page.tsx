import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import MessagesTabs, { type MessageTab } from '@/components/MessagesTabs';
import { listPlacementsFor } from '@/lib/work';
import { WORDS } from '@/lib/words';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role === 'admin') redirect('/console/messages');

  const placements = await listPlacementsFor(profile.id);
  const tabs: MessageTab[] = [
    { key: 'sm', label: profile.role === 'client' ? WORDS.csm : WORDS.tsm, subject: profile.id },
    ...placements.map(p => ({
      key: p.id, placement: p.id,
      theirName: profile.role === 'client' ? p.talent_name : p.client_name,
      label: profile.role === 'client' ? p.talent_name : (p.org_name ?? p.client_name)
    }))
  ];

  return (
    <Shell profile={profile} active="/app/messages" title="Messages"
      crumb={placements.length
        ? 'Your Success Manager, and whoever you\'re placed with'
        : (profile.role === 'client' ? `Straight to ${WORDS.csmShort}` : `Straight to ${WORDS.tsmShort}`)}>
      <MessagesTabs me={profile.id} tabs={tabs} />
    </Shell>
  );
}
