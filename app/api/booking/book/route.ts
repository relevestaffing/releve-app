import { NextResponse } from 'next/server';
import { preflight } from '@/lib/cors';
import { guard, one, zoneOk } from '@/lib/booking-http';
import { adminClient } from '@/lib/supabase/admin';
import { bookingReady, createBooking, getBookingSettings, manageUrl, SlotTaken } from '@/lib/booking';
import { sendConfirmed, tellTeam } from '@/lib/booking-emails';
import { todayInPacific } from '@/lib/money-public';

export const dynamic = 'force-dynamic';

/* Book a discovery call from relevestaffing.com (Nona, 2 November 2026).
   The site has already filed the lead through /api/interest when it came
   from a booking flow; the booking link page sends everything here at once.
   Books the time on Relève's own engine (lib/booking.ts), marks the lead
   booked with the call and phone, and sends the confirmation from hello@. */

export async function OPTIONS(req: Request) { return preflight(req); }

export async function POST(req: Request) {
  const { cors, fail, bad } = guard(req);
  if (bad) return fail('Not permitted.', 403);
  if (!bookingReady()) return fail('Booking is not switched on yet.', 503);

  let body: any;
  try { body = await req.json(); } catch { return fail('We could not read that.'); }
  const name = one(body?.name, 120);
  const email = one(body?.email, 200).toLowerCase();
  const phone = one(body?.phone, 40);
  const org = one(body?.org, 160) || null;
  const start = one(body?.start, 40);
  const tz = one(body?.timezone, 60);
  const timezone = zoneOk(tz) ? tz : 'America/Los_Angeles';
  const notes = String(body?.notes ?? '').trim().slice(0, 3000) || null;
  const source = one(body?.source, 30) || null;
  if (one(body?.company_site, 10)) return fail('Not permitted.', 403);   /* the hidden field a bot fills */

  if (name.length < 2) return fail('Please tell us your name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('That email address does not look right.');
  if (phone.replace(/\D/g, '').length < 7) return fail('Please add a phone number we can reach you on.');
  if (!start || isNaN(Date.parse(start))) return fail('Please choose a time.');

  let b;
  try {
    b = await createBooking({ name, email, phone, org, notes, start, timezone, source });
  } catch (e: any) {
    if (e instanceof SlotTaken) return fail('That time was just taken. Please choose another.', 409);
    console.error('[booking/book]', e?.message ?? e);
    return fail('That did not go through. Please try again, or email hello@relevestaffing.com.', 500);
  }

  /* The lead, marked booked. Best effort: the call stands either way. */
  try {
    const sb = adminClient();
    const phoneLine = `Phone: ${phone}`;
    const { data: open } = await sb.from('prospects').select('id, note')
      .eq('email', email).not('stage', 'in', '("won","lost")').limit(1).maybeSingle();
    if (open?.id) {
      const note = String(open.note || '').includes(phoneLine) ? open.note : [open.note, phoneLine].filter(Boolean).join('\n');
      await sb.from('prospects').update({
        stage: 'booked', call_at: b.start, note, last_touched_at: new Date().toISOString(),
        ...(b.eventId ? { calendar_event_id: b.eventId } : {})
      }).eq('id', open.id);
    } else {
      await sb.from('prospects').insert({
        full_name: name, email, org_name: org, source: source && ['website','referral','instagram','linkedin','event','other'].includes(source) ? source : 'website',
        stage: 'booked', call_at: b.start, note: [notes, phoneLine].filter(Boolean).join('\n'),
        next_follow_up: todayInPacific(), ...(b.eventId ? { calendar_event_id: b.eventId } : {})
      });
    }
  } catch (e) { console.error('[booking/book] lead update failed:', e); }

  const s = await getBookingSettings();
  await sendConfirmed(b, s.page.host);
  await tellTeam('booked', b, Boolean(b.eventId));
  return NextResponse.json({ ok: true, start: b.start, manage: manageUrl(b.id) }, { headers: cors });
}
