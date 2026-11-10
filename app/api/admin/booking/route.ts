import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { hasServiceKey, adminClient } from '@/lib/supabase/admin';
import { todayInPacific } from '@/lib/money-public';
import { cancelBooking, getBooking, getBookingSettings, isScreening, listBookings, saveBookingSettings } from '@/lib/booking';
import { sendCancelled, tellTeam } from '@/lib/booking-emails';

export const dynamic = 'force-dynamic';

/* The console's booking page (Nona, 2 Nov 2026: "something in my console
   where I can adjust my hours at any given point and make changes to my
   booking page"). Admin only. */

async function admin() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
  if (!hasServiceKey()) return NextResponse.json({ error: 'The server cannot reach the database right now.' }, { status: 503 });
  return null;
}

export async function GET() {
  const no = await admin(); if (no) return no;
  const [settings, bookings] = await Promise.all([getBookingSettings(), listBookings({ fromISO: new Date().toISOString() })]);
  return NextResponse.json({ settings, bookings });
}

export async function PUT(req: Request) {
  const no = await admin(); if (no) return no;
  const body = await req.json().catch(() => null);
  if (!body?.settings) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  try {
    const settings = await saveBookingSettings(body.settings);
    return NextResponse.json({ ok: true, settings });
  } catch (e: any) {
    return NextResponse.json({ error: 'That did not save. Try again.' }, { status: 500 });
  }
}

/* Cancel a call from the console. The guest is told by email unless the
   team chooses not to (quietly: true). */
export async function POST(req: Request) {
  const no = await admin(); if (no) return no;
  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'cancel') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const b = await getBooking(String(body?.id ?? ''));
  if (!b) return NextResponse.json({ error: 'That booking was not found.' }, { status: 404 });
  const done = await cancelBooking(b);
  if (isScreening(b)) {
    try {
      if (b.applicationId) await adminClient().from('job_applications')
        .update({ call_state: 'none', call_at: null, call_url: null, call_id: null, state: 'reviewing' }).eq('id', b.applicationId);
    } catch (e) { console.error('[admin/booking] application update failed', e); }
  } else try {
    await adminClient().from('prospects').update({ stage: 'contacted', call_at: null, next_follow_up: todayInPacific(), last_touched_at: new Date().toISOString() })
      .eq('email', b.email).eq('stage', 'booked');
  } catch (e) { console.error('[admin/booking] lead update failed', e); }
  const s = await getBookingSettings();
  if (!body?.quietly) await sendCancelled(done, s.page.host);
  await tellTeam('cancelled', done, true);
  return NextResponse.json({ ok: true });
}
