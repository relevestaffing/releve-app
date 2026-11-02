import { NextResponse } from 'next/server';
import { corsHeaders, preflight } from '@/lib/cors';
import { hasServiceKey, adminClient } from '@/lib/supabase/admin';
import { calendlyConfigured, bookCall } from '@/lib/calendly';
import { sendCallConfirmation } from '@/lib/lead-booking';
import { todayInPacific } from '@/lib/money-public';

export const dynamic = 'force-dynamic';

/* Book a discovery call from Relève's own picker (Nona, 2 November 2026).
   ----------------------------------------------------------------------
   The site has already asked its questions and filed the lead through
   /api/interest. This books the chosen time through Calendly's Scheduling
   API, marks the lead booked with the call time and phone, and sends the
   Relève confirmation at once. Only our own origins may post (as with
   /api/interest), every field is capped, and the time must be one Calendly
   still offers, which Calendly itself enforces. */

function one(v: unknown, max: number) { return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }

export async function OPTIONS(req: Request) { return preflight(req); }

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'));
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: cors });

  const origin = req.headers.get('origin');
  if (origin && !/^https:\/\/((www|app)\.)?relevestaffing\.com$/i.test(origin) && !/^http:\/\/localhost(:\d+)?$/i.test(origin))
    return fail('Not permitted.', 403);
  if (!calendlyConfigured()) return fail('Booking is not switched on yet.', 503);

  let body: any;
  try { body = await req.json(); } catch { return fail('We could not read that.'); }
  const name = one(body?.name, 120);
  const email = one(body?.email, 200).toLowerCase();
  const phone = one(body?.phone, 40) || null;
  const start = one(body?.start, 40);
  const timezone = one(body?.timezone, 60) || 'America/Los_Angeles';
  const notes = String(body?.notes ?? '').trim().slice(0, 2000) || null;
  const source = one(body?.source, 20) || null;

  if (name.length < 2) return fail('Please tell us your name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('That email address does not look right.');
  if (!phone || phone.replace(/\D/g, '').length < 7) return fail('Please add a phone number we can reach you on.');
  if (!start || isNaN(Date.parse(start))) return fail('Please choose a time.');

  let booked;
  try {
    booked = await bookCall({ name, email, phone, timezone, start, notes, utmSource: source });
  } catch (e: any) {
    console.error('[booking/book]', e?.message ?? e, e?.details ?? '');
    /* Most likely someone took the slot a moment ago. */
    return fail('That time was just taken. Please choose another.', 409);
  }

  /* The lead: mark booked with the call and the phone. Best effort: the call
     is booked either way, and the calendar import is the backstop. */
  if (hasServiceKey()) {
    try {
      const sb = adminClient();
      const { data: open } = await sb.from('prospects').select('id, note')
        .eq('email', email).not('stage', 'in', '("won","lost")').limit(1).maybeSingle();
      const phoneLine = `Phone: ${phone}`;
      if (open?.id) {
        const note = String(open.note || '').includes(phoneLine) ? open.note : [open.note, phoneLine].filter(Boolean).join('\n');
        await sb.from('prospects').update({ stage: 'booked', call_at: booked.start, note, last_touched_at: new Date().toISOString() }).eq('id', open.id);
      } else {
        await sb.from('prospects').insert({
          full_name: name, email, source: 'website', stage: 'booked', call_at: booked.start,
          note: [notes, phoneLine].filter(Boolean).join('\n'), next_follow_up: todayInPacific()
        });
      }
    } catch (e) { console.error('[booking/book] lead update failed:', e); }
  }

  await sendCallConfirmation({
    name, email,
    event: {
      id: booked.eventUri || start, title: 'Discovery call', start: booked.start, end: booked.end, allDay: false,
      location: booked.joinUrl, meetingLink: booked.joinUrl, attendees: [email],
      description: [booked.cancelUrl && `Cancel: ${booked.cancelUrl}`, booked.rescheduleUrl && `Reschedule: ${booked.rescheduleUrl}`].filter(Boolean).join('\n')
    }
  });

  return NextResponse.json({ ok: true, start: booked.start }, { headers: cors });
}
