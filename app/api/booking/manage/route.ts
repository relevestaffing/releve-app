import { NextResponse } from 'next/server';
import { preflight } from '@/lib/cors';
import { guard, one, zoneOk } from '@/lib/booking-http';
import { adminClient } from '@/lib/supabase/admin';
import { bookingReady, isScreening, cancelBooking, createBooking, getBooking, getBookingSettings, manageUrl, readManageToken, SlotTaken } from '@/lib/booking';
import { sendCancelled, sendConfirmed, tellTeam } from '@/lib/booking-emails';
import { todayInPacific } from '@/lib/money-public';

export const dynamic = 'force-dynamic';

/* The guest's own reschedule and cancel page on relevestaffing.com/book/manage.
   The link in their confirmation carries a signed token (lib/booking.ts); it
   reveals only their own call, and nothing about anyone else. */

export async function OPTIONS(req: Request) { return preflight(req); }

async function load(token: string) {
  const id = readManageToken(token);
  return id ? await getBooking(id) : null;
}
const view = (b: any) => ({ name: b.name, start: b.start, end: b.end, status: b.status, joinUrl: b.joinUrl, timezone: b.timezone, kind: b.source === 'screening' ? 'screening' : 'discovery' });

/* A screening call lives on the job application too; keep it in step. */
async function syncApplication(b: any, patch: Record<string, unknown>) {
  if (!isScreening(b) || !b.applicationId) return;
  try { await adminClient().from('job_applications').update(patch).eq('id', b.applicationId); }
  catch (e) { console.error('[booking/manage] application sync failed', e); }
}

export async function GET(req: Request) {
  const { cors, fail } = guard(req);
  if (!bookingReady()) return fail('Booking is not switched on yet.', 503);
  const b = await load(new URL(req.url).searchParams.get('b') || '');
  if (!b) return fail('We could not find that booking. Please use the link in your confirmation email.', 404);
  const s = await getBookingSettings();
  return NextResponse.json({ booking: view(b), page: s.page }, { headers: cors });
}

export async function POST(req: Request) {
  const { cors, fail, bad } = guard(req);
  if (bad) return fail('Not permitted.', 403);
  if (!bookingReady()) return fail('Booking is not switched on yet.', 503);
  let body: any;
  try { body = await req.json(); } catch { return fail('We could not read that.'); }
  const b = await load(one(body?.b, 200));
  if (!b) return fail('We could not find that booking. Please use the link in your confirmation email.', 404);
  if (b.status !== 'booked') return fail('This call was already cancelled.', 409);
  const s = await getBookingSettings();
  const sb = adminClient();

  if (body?.action === 'cancel') {
    const done = await cancelBooking(b);
    await syncApplication(b, { call_state: 'none', call_at: null, call_url: null, call_id: null, state: 'reviewing' });
    if (!isScreening(b)) try {
      await sb.from('prospects').update({ stage: 'contacted', call_at: null, next_follow_up: todayInPacific(), last_touched_at: new Date().toISOString() })
        .eq('email', b.email).eq('stage', 'booked');
    } catch (e) { console.error('[booking/manage] lead update failed', e); }
    await sendCancelled(done, s.page.host);
    await tellTeam('cancelled', done, true);
    return NextResponse.json({ ok: true, booking: view(done) }, { headers: cors });
  }

  if (body?.action === 'reschedule') {
    const start = one(body?.start, 40);
    const tz = one(body?.timezone, 60);
    if (!start || isNaN(Date.parse(start))) return fail('Please choose a time.');
    let nb;
    try {
      nb = await createBooking({
        name: b.name, email: b.email, phone: b.phone, org: b.org, notes: b.notes, start,
        timezone: zoneOk(tz) ? tz : b.timezone, source: b.source, rescheduleOf: b
      });
    } catch (e: any) {
      if (e instanceof SlotTaken) return fail('That time was just taken. Please choose another.', 409);
      console.error('[booking/manage] reschedule failed', e?.message ?? e);
      return fail('That did not go through. Please try again.', 500);
    }
    await cancelBooking(b);
    await syncApplication(nb, { call_state: 'invited', call_at: nb.start, call_url: nb.joinUrl, call_id: nb.zoomId });
    if (!isScreening(b)) try {
      await sb.from('prospects').update({ stage: 'booked', call_at: nb.start, last_touched_at: new Date().toISOString(),
        ...(nb.eventId ? { calendar_event_id: nb.eventId } : {}) }).eq('email', b.email).not('stage', 'in', '("won","lost")');
    } catch (e) { console.error('[booking/manage] lead update failed', e); }
    await sendConfirmed(nb, s.page.host, true);
    await tellTeam('rescheduled', nb, Boolean(nb.eventId));
    return NextResponse.json({ ok: true, booking: view(nb), manage: manageUrl(nb.id) }, { headers: cors });
  }

  return fail('Unknown action.');
}
