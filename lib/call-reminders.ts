import { send, shell, p, esc, tagline } from '@/lib/email';
import type { Message } from '@/lib/email';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBookingSettings, listBookings, manageUrl, type Booking } from '@/lib/booking';
import { upcomingCalendarEvents, calendarConfigured } from '@/lib/calendar';
import { CONFIRM_KIND, linkFrom } from '@/lib/lead-booking';

/* Discovery-call reminders, 24 hours and 1 hour before (Nona, 5 November 2026:
   "Make sure in the email that reminders 24 hrs and 1 hr before the call are
   set up", and that every booking email has a way to reschedule or cancel).
   ---------------------------------------------------------------------------
   Called every fifteen minutes by netlify/functions/cron-call-reminders.
   Two kinds of booking are covered:
     - calls booked on relevestaffing.com/book: the stored booking carries the
       guest's own time zone, the Zoom link and the signed Reschedule or cancel
       link to /book/manage;
     - calls booked through Calendly (the home page and /discovery): found on
       hello@'s calendar, matched to the lead, with Calendly's own Reschedule
       and Cancel links read from the event.
   Windows match the interview reminders: the day-before email goes between 20
   and 24¼ hours ahead (a call booked for this afternoon is never told
   "tomorrow"), the hour-before one between 0 and 75 minutes ahead. Each email
   goes once: email_log is checked for the same kind, address and subject
   (the subject carries the call's own time) before sending. The hour-before
   email is skipped when the booking itself was made in the last 90 minutes,
   since the confirmation has only just arrived. Never throws. */

const SENDER = 'Relève <hello@relevestaffing.com>';
const H = 3_600_000;
export const REMIND_24 = 'discoveryReminder24h';
export const REMIND_1 = 'discoveryReminder1h';
const OWN = /@relevestaffing\.com$/i;

type Call = {
  name: string; email: string; start: string; end: string;
  tz: string | null;                       // the guest's zone when we know it
  join: string | null;
  changes: { label: string; href: string }[];
  justBooked: boolean;
};

function first(name: string) { return (name || '').trim().split(/\s+/)[0] || 'Hello'; }
function at(iso: string, timeZone: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone }),
    weekday: d.toLocaleDateString('en-US', { weekday: 'long', timeZone }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone }),
    zone: new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(d).find(x => x.type === 'timeZoneName')?.value ?? ''
  };
}
/* The time in the guest's zone; for Calendly, where we do not know it, Pacific
   and Eastern, as the Calendly confirmation does. */
function timeText(c: Call) {
  if (c.tz) { const w = at(c.start, c.tz); return { w, text: `${w.time} ${w.zone}`.trim() }; }
  const pt = at(c.start, 'America/Los_Angeles'), et = at(c.start, 'America/New_York');
  return { w: pt, text: `${pt.time} Pacific (${et.time} Eastern)` };
}
function minutes(c: Call) {
  const m = Math.round((Date.parse(c.end) - Date.parse(c.start)) / 60000);
  return m === 30 ? 'thirty minutes' : m === 60 ? 'an hour' : `${m} minutes`;
}

export function dayBeforeEmail(c: Call, host: string): Message {
  const { w, text } = timeText(c);
  const changeText = c.changes.map(x => `${x.label}: ${x.href}`).join('\n');
  return {
    kind: REMIND_24, from: SENDER,
    subject: `Tomorrow: your discovery call, ${w.weekday} at ${text}`,
    html: shell('Your call is tomorrow',
      p(`${esc(first(c.name))},`) +
      p(`Your discovery call with Relève is on <b>${esc(w.day)}, at ${esc(text)}</b>.`) +
      p(`You will have ${minutes(c)} with ${esc(host)}. Bring a rough sense of what fills your week, and we will use the time to decide what comes off your plate first.`) +
      p('If the time no longer works, you can reschedule or cancel below, or reply to this email.') +
      tagline(),
      c.join ? { label: 'Join on Zoom', href: c.join } : undefined,
      c.changes.length ? c.changes : undefined),
    text: `${first(c.name)},\n\nYour discovery call with Relève is tomorrow, ${w.day}, at ${text}.\n\nYou will have ${minutes(c)} with ${host}. Bring a rough sense of what fills your week, and we will use the time to decide what comes off your plate first.${c.join ? `\n\nJoin on Zoom: ${c.join}` : ''}\n\nIf the time no longer works, you can reschedule or cancel here, or reply to this email.${changeText ? `\n${changeText}` : ''}\n\nConsider it handled.\nRelève`
  };
}

export function hourBeforeEmail(c: Call, host: string): Message {
  const { text } = timeText(c);
  const changeText = c.changes.map(x => `${x.label}: ${x.href}`).join('\n');
  return {
    kind: REMIND_1, from: SENDER,
    subject: `In one hour: your discovery call at ${text}`,
    html: shell('Your call starts in an hour',
      p(`${esc(first(c.name))},`) +
      p(`Your discovery call with ${esc(host)} begins at <b>${esc(text)}</b>.`) +
      p(c.join ? 'The Zoom link below is the same one in your calendar invitation.' : 'The Zoom link is in your calendar invitation.') +
      p('If something has come up, you can still reschedule or cancel below.') +
      tagline(),
      c.join ? { label: 'Join on Zoom', href: c.join } : undefined,
      c.changes.length ? c.changes : undefined),
    text: `${first(c.name)},\n\nYour discovery call with ${host} starts in an hour, at ${text}.${c.join ? `\n\nJoin on Zoom: ${c.join}` : '\n\nThe Zoom link is in your calendar invitation.'}\n\nIf something has come up, you can still reschedule or cancel here.${changeText ? `\n${changeText}` : ''}\n\nConsider it handled.\nRelève`
  };
}

const likeEsc = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m);

async function alreadySent(sb: SupabaseClient, kind: string, to: string, subject: string) {
  const { data } = await sb.from('email_log').select('id').eq('kind', kind).eq('ok', true).eq('subject', subject)
    .ilike('to_addr', likeEsc(to)).limit(1).maybeSingle();
  return Boolean(data?.id);
}

/* The calls in the next 24¼ hours, from both kinds of booking. */
async function upcomingCalls(sb: SupabaseClient): Promise<{ calls: Call[]; reason?: string }> {
  const now = Date.now(), horizon = now + 24.25 * H;
  const own: Booking[] = (await listBookings({ fromISO: new Date(now).toISOString() }))
    .filter(b => Date.parse(b.start) > now && Date.parse(b.start) <= horizon);
  const calls: Call[] = own.map(b => ({
    name: b.name, email: b.email, start: b.start, end: b.end, tz: b.timezone || 'America/Los_Angeles',
    join: b.joinUrl, changes: [{ label: 'Reschedule or cancel', href: manageUrl(b.id) }],
    justBooked: now - Date.parse(b.created_at) < 1.5 * H
  }));
  if (!calendarConfigured()) return { calls, reason: 'The calendar is not connected, so Calendly calls were not read.' };

  /* Calendly calls: on hello@'s calendar, with an outside guest who is a lead.
     Events our own booking page wrote are skipped (already covered above). */
  const ownEvents = new Set(own.map(b => b.eventId).filter(Boolean) as string[]);
  const ownTimes = new Set(own.map(b => `${b.email.toLowerCase()}|${Date.parse(b.start)}`));
  let events;
  try { events = await upcomingCalendarEvents(2, true); }
  catch (e: any) { return { calls, reason: `The calendar could not be read: ${e?.message ?? e}` }; }
  const soon = events.filter(e => !e.allDay && Date.parse(e.start) > now && Date.parse(e.start) <= horizon && !ownEvents.has(e.id));
  const guests = [...new Set(soon.flatMap(e => e.attendees.filter(a => !OWN.test(a)).map(a => a.toLowerCase())))];
  if (!guests.length) return { calls };
  const { data: leads } = await sb.from('prospects').select('email, full_name, stage').in('email', guests);
  const leadBy = new Map(((leads ?? []) as any[]).filter(l => !['won', 'lost'].includes(String(l.stage)))
    .map(l => [String(l.email).toLowerCase(), l]));
  for (const e of soon) {
    const email = e.attendees.map(a => a.toLowerCase()).find(a => !OWN.test(a) && leadBy.has(a));
    if (!email || ownTimes.has(`${email}|${Date.parse(e.start)}`)) continue;
    const reschedule = linkFrom(e.description, 'reschedulings'), cancel = linkFrom(e.description, 'cancellations');
    const join = e.meetingLink || (/^https?:\/\//.test(e.location || '') ? e.location : null);
    /* the Calendly confirmation went out in the last 90 minutes */
    const { data: recent } = await sb.from('email_log').select('id').eq('kind', CONFIRM_KIND).eq('ok', true)
      .ilike('to_addr', likeEsc(email)).gte('sent_at', new Date(now - 1.5 * H).toISOString()).limit(1).maybeSingle();
    calls.push({
      name: leadBy.get(email)?.full_name || email, email, start: e.start, end: e.end, tz: null, join,
      changes: [reschedule && { label: 'Reschedule', href: reschedule }, cancel && { label: 'Cancel', href: cancel }]
        .filter(Boolean) as { label: string; href: string }[],
      justBooked: Boolean(recent?.id)
    });
  }
  return { calls };
}

export async function sendCallReminders(sb: SupabaseClient) {
  const now = Date.now();
  const { calls, reason } = await upcomingCalls(sb);
  const host = (await getBookingSettings()).page.host;
  let sent = 0, skipped = 0;
  for (const c of calls) {
    const ahead = Date.parse(c.start) - now;
    const kind = ahead <= 1.25 * H ? '1h' : (ahead >= 20 * H && ahead <= 24.25 * H) ? '24h' : null;
    if (!kind || (kind === '1h' && c.justBooked)) { skipped++; continue; }
    const msg = kind === '24h' ? dayBeforeEmail(c, host) : hourBeforeEmail(c, host);
    if (await alreadySent(sb, msg.kind, c.email, msg.subject)) { skipped++; continue; }
    if (await send(c.email, msg)) sent++;
  }
  return { due: calls.length, sent, skipped, ...(reason ? { reason } : {}) };
}
