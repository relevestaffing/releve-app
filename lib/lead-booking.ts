import { send, shell, p, esc, tagline } from '@/lib/email';
import type { Message } from '@/lib/email';
import type { CalendarEvent } from '@/lib/calendar';
import { adminClient } from '@/lib/supabase/admin';

/* The booking link, sent to a website lead the moment they come in.
   -----------------------------------------------------------------
   Nona, 2 November 2026: "The SECOND a lead comes through it needs to send
   an email with a link to book a call", from hello@, and "if they don't book
   a call, send a follow up 24 hours later."

   Two emails, both from hello@ so a reply lands in the inbox the team reads:
   - bookingInvite, sent by /api/interest as the lead is filed (the same
     moment the team's "New lead from the website" alert goes out).
   - bookingFollowUp, sent by the hourly cron to any lead who got the invite
     at least 24 hours ago and still has no call on the books.

   The site files the lead a second before Calendly opens, so at send time we
   cannot know whether they will finish booking. The invite reads naturally
   either way.

   No schema change: email_log (every send already writes a row there) is the
   record of who got which email, so each address gets each email once. */

export const BOOK_URL = 'https://relevestaffing.com/book/';   /* Relève's own booking page (2 Nov 2026), was Calendly */
const SENDER = 'Relève <hello@relevestaffing.com>';
export const INVITE_KIND = 'leadBookingInvite';
export const FOLLOW_UP_KIND = 'leadBookingFollowUp';

function firstName(name: string) {
  return (name || '').trim().split(/\s+/)[0] || 'Hello';
}

/* Prefilled, so the booking page asks nothing they already told us. */
function bookLink(name: string, email: string) {
  return `${BOOK_URL}?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;
}

/* "Wants to hand off: Marketing and social" in the site's note, if it is there. */
export function handoffFrom(note: string | null | undefined) {
  const m = /wants to hand off:\s*([^\n]+)/i.exec(note || '');
  const v = m?.[1]?.trim();
  return v && !/^not given$/i.test(v) ? v : null;
}

export function bookingInvite(o: { name: string; email: string }): Message {
  const first = firstName(o.name);
  const link = bookLink(o.name, o.email);
  return {
    kind: INVITE_KIND,
    from: SENDER,
    subject: 'Choose a time to speak with Relève',
    html: shell('Choose a time to speak',
      p(`${esc(first)},`) +
      p('Thank you for reaching out to Relève. The next step is a thirty-minute conversation about your business and what you would like off your plate.') +
      p('We will learn how you work and talk through what support could look like for you. Bring any questions you have.') +
      p('There is nothing to prepare, and no obligation.') +
      `<p style="margin:0 0 15px;font-size:13.5px;color:#4E6B57;">If you have already booked, your confirmation is in your inbox and there is nothing more to do.</p>` +
      tagline(),
      { label: 'Choose your time', href: link }),
    text: `${first},\n\nThank you for reaching out to Relève. The next step is a thirty-minute conversation about your business and what you would like off your plate.\n\nWe will learn how you work and talk through what support could look like for you. Bring any questions you have.\n\nThere is nothing to prepare, and no obligation.\n\nChoose your time: ${link}\n\nIf you have already booked, your confirmation is in your inbox and there is nothing more to do.\n\nConsider it handled.\nRelève`
  };
}

export function bookingFollowUp(o: { name: string; email: string; handoff?: string | null }): Message {
  const first = firstName(o.name);
  const link = bookLink(o.name, o.email);
  const what = o.handoff ? o.handoff.toLowerCase() : null;
  const opener = what
    ? `Yesterday you asked about Relève and told us you want to hand off ${esc(what)}. That is a good place to start.`
    : 'Yesterday you asked about Relève. We would like to hear what you want off your plate.';
  const openerText = what
    ? `Yesterday you asked about Relève and told us you want to hand off ${what}. That is a good place to start.`
    : 'Yesterday you asked about Relève. We would like to hear what you want off your plate.';
  return {
    kind: FOLLOW_UP_KIND,
    from: SENDER,
    subject: 'A thirty-minute call, whenever it suits you',
    html: shell('Whenever you are ready',
      p(`${esc(first)},`) +
      p(opener) +
      p('In thirty minutes we will work out together what to hand off first and what kind of support would suit you. There is no obligation.') +
      tagline(),
      { label: 'Choose your time', href: link }),
    text: `${first},\n\n${openerText}\n\nIn thirty minutes we will work out together what to hand off first and what kind of support would suit you. There is no obligation.\n\nChoose your time: ${link}\n\nConsider it handled.\nRelève`
  };
}

/* Has this address been sent this kind of email (successfully)? */
async function alreadySent(kind: string, email: string) {
  try {
    const { data } = await adminClient().from('email_log')
      .select('id').eq('kind', kind).eq('ok', true).ilike('to_addr', email.replace(/[\\%_]/g, m => '\\' + m))
      .limit(1).maybeSingle();
    return Boolean(data?.id);
  } catch { return false; }
}

/* Called by /api/interest. Never throws, never holds up the form. */
export async function sendBookingInvite(name: string, email: string) {
  try {
    if (await alreadySent(INVITE_KIND, email)) return;
    await send(email, bookingInvite({ name, email }));
  } catch (e) {
    console.error('[lead-booking] invite failed:', e);
  }
}

/* Stages that mean a call is on the books, or the lead has moved past one. */
const PAST_BOOKING = new Set(['booked', 'held', 'proposal', 'won', 'lost']);

/* Called hourly by the cron. Returns how many follow-ups went out. */
export async function sendDueFollowUps() {
  const sb = adminClient();
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

  /* Everyone who got the invite between a day and a week ago. The week's cap
     means a lead from long before this shipped is never written to. */
  const { data: invites, error } = await sb.from('email_log')
    .select('to_addr, sent_at').eq('kind', INVITE_KIND).eq('ok', true)
    .lte('sent_at', dayAgo).gte('sent_at', weekAgo);
  if (error) throw new Error(error.message);

  let sent = 0;
  const seen = new Set<string>();
  for (const row of invites ?? []) {
    const email = String(row.to_addr || '').toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (await alreadySent(FOLLOW_UP_KIND, email)) continue;

    /* Their lead row: skip anyone who booked, moved on, or was removed. */
    const { data: lead } = await sb.from('prospects')
      .select('full_name, email, stage, call_at, note')
      .ilike('email', email.replace(/[\\%_]/g, m => '\\' + m))
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!lead) continue;
    if (lead.call_at || PAST_BOOKING.has(String(lead.stage))) continue;

    if (await send(email, bookingFollowUp({
      name: lead.full_name, email, handoff: handoffFrom(lead.note)
    }))) sent++;
  }
  return sent;
}


/* ---------- the confirmation, from Relève (Nona, 2 November 2026) ----------
   "Make sure they don't get an email from Calendly, only from Relève with the
   confirmation of their call." Calendly's free plan cannot be silenced, so the
   event is set to "Calendar invitation": the invite reaches them from hello@'s
   own Google Calendar, never from calendly.com. This is the confirmation in
   Relève's words, sent once, the moment the calendar import files the call
   (the website's booked ping, or the five-minute job for links in emails). */

export const CONFIRM_KIND = 'leadCallConfirmed';

/* Calendly writes the booking form's answers into the event description.
   The phone question is "Phone number"; fall back to the first line that
   reads like an international number. */
export function phoneFrom(description: string | null | undefined): string | null {
  const text = String(description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const labelled = /phone number[^\n:]*[:\n]\s*(\+?[\d][\d\s().-]{6,}\d)/i.exec(text)
    || /phone[^\n:]*[:\n]\s*(\+?[\d][\d\s().-]{6,}\d)/i.exec(text);
  const loose = /(\+\d[\d\s().-]{7,}\d)/.exec(text);
  const v = (labelled?.[1] || loose?.[1] || '').replace(/\s+/g, ' ').trim();
  return v || null;
}

export function linkFrom(description: string | null | undefined, kind: 'cancellations' | 'reschedulings') {
  const m = new RegExp(`https://calendly\\.com/${kind}/[A-Za-z0-9-]+`).exec(String(description || ''));
  return m?.[0] ?? null;
}

function when(iso: string, timeZone: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
  };
}

export function callConfirmation(o: { name: string; event: CalendarEvent }): Message {
  const first = firstName(o.name);
  const pt = when(o.event.start, 'America/Los_Angeles');
  const et = when(o.event.start, 'America/New_York');
  const join = o.event.meetingLink || (/^https?:\/\//.test(o.event.location || '') ? o.event.location : null);
  const reschedule = linkFrom(o.event.description, 'reschedulings');
  const cancel = linkFrom(o.event.description, 'cancellations');
  const timeLine = `${pt.day}, ${pt.time} Pacific (${et.time} Eastern)`;
  const changes = [reschedule && { label: 'Reschedule', href: reschedule }, cancel && { label: 'Cancel', href: cancel }]
    .filter(Boolean) as { label: string; href: string }[];
  return {
    kind: CONFIRM_KIND,
    from: SENDER,
    subject: `Confirmed: your discovery call, ${pt.day}`,
    html: shell('Your call is confirmed',
      p(`${esc(first)},`) +
      p(`Your discovery call with Relève is set for <b>${esc(timeLine)}</b>. It is already on your calendar.`) +
      p('Thirty minutes. We will have read what you shared, and you will leave knowing what to hand off first and how the 14-day search works.') +
      tagline(),
      join ? { label: 'Join on Zoom', href: join } : undefined,
      changes.length ? changes : undefined),
    text: `${first},\n\nYour discovery call with Relève is set for ${timeLine}. It is already on your calendar.\n\nThirty minutes. We will have read what you shared, and you will leave knowing what to hand off first and how the 14-day search works.${join ? `\n\nJoin on Zoom: ${join}` : ''}${reschedule ? `\nReschedule: ${reschedule}` : ''}${cancel ? `\nCancel: ${cancel}` : ''}\n\nConsider it handled.\nRelève`
  };
}

/* Called by the calendar import as each booking is filed. Never throws.
   One confirmation per address per call time, so an import that runs twice
   never sends twice. */
export async function sendCallConfirmation(o: { name: string; email: string; event: CalendarEvent }) {
  try {
    const msg = callConfirmation({ name: o.name, event: o.event });
    const { data } = await adminClient().from('email_log').select('id')
      .eq('kind', CONFIRM_KIND).eq('ok', true).eq('subject', msg.subject)
      .ilike('to_addr', o.email.replace(/[\\%_]/g, m => '\\' + m)).limit(1).maybeSingle();
    if (data?.id) return;
    await send(o.email, msg);
  } catch (e) {
    console.error('[lead-booking] confirmation failed:', e);
  }
}
