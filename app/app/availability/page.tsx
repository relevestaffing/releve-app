import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import AvailabilityEditor from '@/components/AvailabilityEditor';
import CalendarConnect from '@/components/CalendarConnect';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  const who = profile.role === 'client' ? 'client' : 'talent';
  return (
    <Shell profile={profile} active="/app/availability" title="Your availability" crumb="Interviews">
      <CalendarConnect />
      <AvailabilityEditor who={who} />
    </Shell>
  );
}
