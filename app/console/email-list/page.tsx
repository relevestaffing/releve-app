import { redirect } from 'next/navigation';
import ConsoleTabs from '@/components/ConsoleTabs';
import Shell from '@/components/Shell';
import SubscriberList from '@/components/SubscriberList';
import { currentProfile } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';

export const metadata = { title: 'Email list' };
export const dynamic = 'force-dynamic';

/* Everyone on Relève's email list (subscribers, part 53), with a way to
   take someone off by hand when they ask. */
export default async function EmailList() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  let rows: any[] = [];
  if (hasServiceKey()) {
    const { data } = await adminClient().from('subscribers')
      .select('id, email, full_name, origin, source, subscribed, unsubscribed_at, training_at, created_at')
      .order('created_at', { ascending: false }).limit(5000);
    rows = data ?? [];
  }

  return (
    <Shell profile={profile} active="/console/content" title="Content" crumb="Email list">
      <ConsoleTabs active="/console/email-list" items={[
        { href: '/console/content', label: 'Posts' },
        { href: '/console/campaigns', label: 'Email' },
        { href: '/console/email-list', label: 'Email list' }
      ]} />
      <SubscriberList rows={rows} />
    </Shell>
  );
}
