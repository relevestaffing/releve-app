import { send, shell, p, esc } from '@/lib/email';
import type { Message } from '@/lib/email';
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

export const BOOK_URL = 'https://calendly.com/hello-relevestaffing/30min';
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
    subject: 'Your discovery call with Relève',
    html: shell('Your discovery call.',
      p(`${esc(first)},`) +
      p('Thank you for reaching out to Relève.') +
      p('If you already chose a time, you are set: the confirmation is on its way from Calendly. If you did not finish, choose your time below. Thirty minutes, and we come prepared with what you told us.') +
      p('Consider it handled.'),
      { label: 'Choose your time', href: link }),
    text: `${first},\n\nThank you for reaching out to Relève.\n\nIf you already chose a time, you are set: the confirmation is on its way from Calendly. If you did not finish, choose your time here. Thirty minutes, and we come prepared with what you told us.\n\n${link}\n\nConsider it handled.\nRelève`
  };
}

export function bookingFollowUp(o: { name: string; email: string; handoff?: string | null }): Message {
  const first = firstName(o.name);
  const link = bookLink(o.name, o.email);
  const what = o.handoff ? o.handoff.toLowerCase() : null;
  const opener = what
    ? `Yesterday you told us you want to hand off ${esc(what)}. Your discovery call is still open.`
    : 'Yesterday you asked about Relève. Your discovery call is still open.';
  const openerText = what
    ? `Yesterday you told us you want to hand off ${what}. Your discovery call is still open.`
    : 'Yesterday you asked about Relève. Your discovery call is still open.';
  return {
    kind: FOLLOW_UP_KIND,
    from: SENDER,
    subject: 'Your discovery call is still open',
    html: shell('Still yours.',
      p(`${esc(first)},`) +
      p(opener) +
      p('Thirty minutes to map what comes off your plate first and the professional who takes it. We take on ten new clients a year.') +
      p('Consider it handled.'),
      { label: 'Choose your time', href: link }),
    text: `${first},\n\n${openerText}\n\nThirty minutes to map what comes off your plate first and the professional who takes it. We take on ten new clients a year.\n\nChoose your time: ${link}\n\nConsider it handled.\nRelève`
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
