import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import Shell from '@/components/Shell';
import NextStep from '@/components/NextStep';
import { setupFor } from '@/lib/setup';
import AvailabilityEditor from '@/components/AvailabilityEditor';
import CalendarConnect from '@/components/CalendarConnect';
import { googleConfigured } from '@/lib/google-calendar';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  /* Every other page under /app sends the team to the console. Without it
     the line below reads any non-client as talent, so an admin opening this
     page was handed the talent's own screen. */
  if (profile.role === 'admin') redirect('/console/calendar');
  const who = profile.role === 'client' ? 'client' : 'talent';
  return (
    <Shell profile={profile} active="/app/availability" title="Availability" crumb="Interviews">
      {/* Only offered where Google is actually switched on for this site. */}
      {googleConfigured() && <CalendarConnect />}
      <AvailabilityEditor who={who} />
      <NextStep steps={await setupFor(profile)} current="availability" />
    </Shell>
  );
}
