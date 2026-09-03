import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { allOffers } from '@/lib/offer';
import { listPeople } from '@/lib/work';
import Shell from '@/components/Shell';
import OfferDesk from '@/components/OfferDesk';

export const dynamic = 'force-dynamic';

export default async function ConsoleOffers() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const [offers, people] = await Promise.all([allOffers(), listPeople()]);
  return (
    <Shell profile={profile} active="/console/offers" title="Offers"
      crumb="Between the interview and the placement">
      <div className="stack">
        <OfferDesk offers={offers}
          clients={people.filter(p => p.role === 'client')}
          talent={people.filter(p => p.role === 'talent')} />
      </div>
    </Shell>
  );
}
