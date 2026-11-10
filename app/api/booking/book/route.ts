import { NextResponse } from 'next/server';
import { preflight } from '@/lib/cors';
import { guard, one, zoneOk } from '@/lib/booking-http';
import { adminClient } from '@/lib/supabase/admin';
import { publicFormAllowed } from '@/lib/booking-http';
import { bookingReady, createBooking, getBookingSettings, manageUrl, readAppToken, SlotTaken } from '@/lib/booking';
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

  /* Rate limit, shared with /api/apply; fails closed (security pass, 2 Nov 2026). */
  const allowed = await publicFormAllowed(adminClient(), req, email);
  if (allowed === 'limited') return fail('Too many bookings from this address today. Please email hello@relevestaffing.com instead.', 429);
  if (allowed === 'unsure') return fail('We could not book that just now. Please try again in a few minutes.', 503);
  if (!start || isNaN(Date.parse(start))) return fail('Please choose a time.');

  /* A screening call (the link sent to applicants, or to people who never applied
     on the site) belongs to a job application rather than to a sales lead. A link
     made for one applicant carries their signed application id; a generic link
     creates the application when the call is booked. */
  const screening = source === 'screening';
  let applicationId: string | null = null;
  if (screening) {
    const sb = adminClient();
    const fromToken = readAppToken(one(body?.applicant, 120));
    if (fromToken) {
      const { data } = await sb.from('job_applications').select('id').eq('id', fromToken).maybeSingle();
      applicationId = data?.id ?? null;
    }
    if (!applicationId) {
      const { data } = await sb.from('job_applications').select('id')
        .ilike('email', email).in('state', ['new', 'reviewing', 'call_booked']).order('created_at', { ascending: false }).limit(1).maybeSingle();
      applicationId = data?.id ?? null;
    }
  }
  const newApplicationId = screening && !applicationId ? crypto.randomUUID() : null;

  let b;
  try {
    b = await createBooking({ name, email, phone, org, notes, start, timezone, source, applicationId: applicationId ?? newApplicationId });
  } catch (e: any) {
    if (e instanceof SlotTaken) return fail('That time was just taken. Please choose another.', 409);
    console.error('[booking/book]', e?.message ?? e);
    return fail('That did not go through. Please try again, or email hello@relevestaffing.com.', 500);
  }

  /* The application, with the call on it, so the console shows it in the queue. */
  if (screening) {
    try {
      const sb = adminClient();
      const call = { call_state: 'invited', call_at: b.start, call_url: b.joinUrl, call_id: b.zoomId, call_sent_at: new Date().toISOString() };
      if (newApplicationId) {
        const { error } = await sb.from('job_applications').insert({
          id: newApplicationId, post_id: null, full_name: name, email, phone, timezone,
          heard_via: 'Screening call link', note: notes, state: 'call_booked', ...call
        });
        if (error) throw error;
      } else if (applicationId) {
        const { data: cur } = await sb.from('job_applications').select('state, phone, timezone').eq('id', applicationId).maybeSingle();
        const keepState = cur && !['new', 'reviewing', 'call_booked'].includes(cur.state);
        await sb.from('job_applications').update({
          ...call, ...(keepState ? {} : { state: 'call_booked' }),
          ...(cur && !cur.phone ? { phone } : {}), ...(cur && !cur.timezone ? { timezone } : {})
        }).eq('id', applicationId);
      }
    } catch (e) { console.error('[booking/book] application update failed:', e); }
    const s = await getBookingSettings();
    await sendConfirmed(b, s.page.host);
    await tellTeam('booked', b, Boolean(b.eventId));
    return NextResponse.json({ ok: true, start: b.start, manage: manageUrl(b.id) }, { headers: cors });
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
