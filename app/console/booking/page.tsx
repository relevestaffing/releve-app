import { redirect } from 'next/navigation';
import ConsoleTabs from '@/components/ConsoleTabs';
import Shell from '@/components/Shell';
import BookingSettingsEditor from '@/components/BookingSettingsEditor';
import { currentProfile } from '@/lib/supabase/server';
import { hasServiceKey } from '@/lib/supabase/admin';
import { getBookingSettings, listBookings, type Booking } from '@/lib/booking';
import { calendarConfigured } from '@/lib/calendar';
import { zoomConfigured } from '@/lib/zoom';

export const metadata = { title: 'Booking page' };
export const dynamic = 'force-dynamic';

/* The discovery-call booking page on relevestaffing.com/book: hours, rules,
   wording and the calls booked through it. */
export default async function ConsoleBooking() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const settings = await getBookingSettings();
  let bookings: Booking[] = [];
  if (hasServiceKey()) { try { bookings = await listBookings({ fromISO: new Date().toISOString() }); } catch {} }

  return (
    <Shell profile={profile} active="/console/business" title="The business" crumb="Booking page">
      <ConsoleTabs active="/console/booking" items={[
        { href: '/console/reports', label: 'Reports' },
        { href: '/console/signals', label: 'Match accuracy' },
        { href: '/console/calendar', label: 'Calendar' },
        { href: '/console/booking', label: 'Booking page' },
        { href: '/console/team', label: 'Team' },
        { href: '/console/training', label: 'Training' }
      ]} />
      <BookingSettingsEditor initial={settings} bookings={bookings}
        calendarOk={calendarConfigured()} zoomOk={zoomConfigured()} />
    </Shell>
  );
}
