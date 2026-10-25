import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { allOffers } from '@/lib/offer';
import { listPeople } from '@/lib/work';
import Shell from '@/components/Shell';
import OfferDesk from '@/components/OfferDesk';
import ConsoleTabs from '@/components/ConsoleTabs';

export const metadata = { title: 'Offers' };

export const dynamic = 'force-dynamic';

export default async function ConsoleOffers() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const [offers, people] = await Promise.all([allOffers(), listPeople()]);
  return (
    <Shell profile={profile} active="/console/matching" title="Matching"
      crumb="Offers">
      <ConsoleTabs active="/console/offers" items={[
        { href: '/console/matching', label: 'Matching' },
        { href: '/console/offers', label: 'Offers' }
      ]} />
      <div className="stack">
        <OfferDesk offers={offers}
          clients={people.filter(p => p.role === 'client')}
          talent={people.filter(p => p.role === 'talent')} />
      </div>
    </Shell>
  );
}
