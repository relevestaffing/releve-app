import { send, shell, p, esc, tagline } from '@/lib/email';
import type { Message } from '@/lib/email';
import { teamEmails } from '@/lib/work';
import { bookingIcs, manageUrl, isScreening, SCREENING_LINK, type Booking } from '@/lib/booking';

/* The emails around a discovery call booked on relevestaffing.com/book.
   One email per moment, all from hello@ in Relève's white and green, each
   with the calendar file inside it, so the guest never hears from a
   scheduling tool. The team gets a short note of its own. */

const SENDER = 'Relève <hello@relevestaffing.com>';

/* A screening call is the first conversation with someone interested in working with Relève; a discovery call is with a prospective client. */
const callWord = (b: Booking) => isScreening(b) ? 'screening call' : 'discovery call';
const aboutCall = (b: Booking, host: string) => isScreening(b)
  ? `${minutes(b)} with ${host}, to get to know you and the work that would suit you. There is nothing to prepare.`
  : `${minutes(b)} with ${host}. We will have read what you shared, and you will leave knowing what to hand off first and how the 14-day search works.`;
function first(name: string) { return (name || '').trim().split(/\s+/)[0] || 'Hello'; }
function when(iso: string, timeZone: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone }),
    zone: new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(d).find(x => x.type === 'timeZoneName')?.value ?? ''
  };
}
/* The guest's own time zone, as their browser reported it. */
function minutes(b: Booking) {
  const m = Math.round((Date.parse(b.end) - Date.parse(b.start)) / 60000);
  return m === 30 ? 'Thirty minutes' : m === 60 ? 'An hour' : `${m} minutes`;
}
function line(b: Booking) {
  const w = when(b.start, b.timezone || 'America/Los_Angeles');
  return { day: w.day, text: `${w.day} at ${w.time} ${w.zone}`.trim() };
}

export function confirmedEmail(b: Booking, host: string, rescheduled = false): Message {
  const l = line(b), manage = manageUrl(b.id);
  const head = rescheduled ? 'Your call has moved' : 'Your call is confirmed';
  const lead = rescheduled
    ? `Your ${callWord(b)} with Relève is now set for <b>${esc(l.text)}</b>.`
    : `Your ${callWord(b)} with Relève is set for <b>${esc(l.text)}</b>.`;
  return {
    kind: rescheduled ? 'bookingRescheduled' : 'bookingConfirmed',
    from: SENDER,
    subject: rescheduled ? `Rescheduled: your ${callWord(b)}, ${l.day}` : `Confirmed: your ${callWord(b)}, ${l.day}`,
    html: shell(head,
      p(`${esc(first(b.name))},`) +
      p(`${lead} The invitation is attached for your calendar.`) +
      p(esc(aboutCall(b, host))) +
      tagline(),
      b.joinUrl ? { label: 'Join on Zoom', href: b.joinUrl } : undefined,
      { label: 'Reschedule or cancel', href: manage }),
    text: `${first(b.name)},\n\n${rescheduled ? `Your ${callWord(b)} with Relève is now set for ${l.text}.` : `Your ${callWord(b)} with Relève is set for ${l.text}.`} The invitation is attached for your calendar.\n\n${aboutCall(b, host)}${b.joinUrl ? `\n\nJoin on Zoom: ${b.joinUrl}` : ''}\nReschedule or cancel: ${manage}\n\nConsider it handled.\nRelève`,
    icalEvent: { method: 'REQUEST', filename: 'releve-call.ics', content: bookingIcs(b, { method: 'REQUEST', host, sequence: rescheduled ? 1 : 0 }) }
  };
}

export function cancelledEmail(b: Booking, host: string): Message {
  const l = line(b);
  return {
    kind: 'bookingCancelled',
    from: SENDER,
    subject: `Cancelled: your ${callWord(b)}, ${l.day}`,
    html: shell('Your call is cancelled',
      p(`${esc(first(b.name))},`) +
      p(`Your ${callWord(b)} for ${esc(l.text)} has been taken off your calendar.`) +
      p('If you would like to talk another time, choose one below.') +
      tagline(),
      { label: 'Choose a new time', href: isScreening(b) ? SCREENING_LINK : 'https://relevestaffing.com/book/' }),
    text: `${first(b.name)},\n\nYour ${callWord(b)} for ${l.text} is cancelled and has been taken off your calendar.\n\nIf you would like to talk another time, choose one here: ${isScreening(b) ? SCREENING_LINK : 'https://relevestaffing.com/book/'}\n\nConsider it handled.\nRelève`,
    icalEvent: { method: 'CANCEL', filename: 'releve-call.ics', content: bookingIcs(b, { method: 'CANCEL', host, sequence: 2 }) }
  };
}

/* The team's note: who, when (Pacific), phone, and what they told us. */
export async function tellTeam(kind: 'booked' | 'rescheduled' | 'cancelled', b: Booking, calendarWritten: boolean) {
  try {
    const to = await teamEmails();
    if (!to.length) return;
    const pt = when(b.start, 'America/Los_Angeles');
    const verb = kind === 'booked' ? `booked a ${callWord(b)}` : kind === 'rescheduled' ? `moved their ${callWord(b)}` : `cancelled their ${callWord(b)}`;
    const subject = `${kind === 'cancelled' ? 'Cancelled' : kind === 'rescheduled' ? 'Rescheduled' : isScreening(b) ? 'New screening call' : 'New call'}: ${b.name}, ${pt.day} ${pt.time}`;
    const facts = [
      `${b.email}${b.phone ? ` · ${b.phone}` : ''}${b.org ? ` · ${b.org}` : ''}`,
      `${pt.day} at ${pt.time} ${pt.zone}`,
      b.joinUrl ? `Zoom: ${b.joinUrl}` : 'No Zoom link was made: create one by hand.',
      !calendarWritten && kind !== 'cancelled' ? 'Not on the hello@ calendar yet (calendar writing is not switched on): the file is attached.' : ''
    ].filter(Boolean);
    const msg: Message = {
      kind: `bookingTeam_${kind}`,
      subject,
      html: shell(`${esc(b.name)} ${verb}`,
        facts.map(f => p(esc(f))).join('') +
        (b.notes && kind !== 'cancelled' ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #B0C4B2;white-space:pre-wrap;">${esc(b.notes)}</p>` : '')),
      text: `${b.name} ${verb}.\n\n${facts.join('\n')}${b.notes && kind !== 'cancelled' ? `\n\nWhat they told us:\n${b.notes}` : ''}`,
      ...(!calendarWritten && kind !== 'cancelled'
        ? { icalEvent: { method: 'REQUEST', filename: 'discovery-call.ics', content: bookingIcs(b, { method: 'REQUEST', host: 'Relève' }) } } : {})
    };
    for (const addr of to) await send(addr, msg);
  } catch (e) { console.error('[booking] team note failed', e); }
}

export async function sendConfirmed(b: Booking, host: string, rescheduled = false) {
  return send(b.email, confirmedEmail(b, host, rescheduled));
}
export async function sendCancelled(b: Booking, host: string) {
  return send(b.email, cancelledEmail(b, host));
}
