/* Real-time read of the hello@relevestaffing.com Google Calendar, so the
   console can show discovery calls, interviews and anything else booked
   there without anyone re-typing it in. Talks to the Calendar API directly
   over fetch with a hand-signed service-account JWT — no googleapis
   dependency, nothing new to install.

   Needs three things on the site, all from a Google Cloud service account
   with domain-wide delegation authorised for the Calendar readonly scope:
     GOOGLE_CALENDAR_CLIENT_EMAIL  — the service account's client_email
     GOOGLE_CALENDAR_PRIVATE_KEY   — its private_key, newlines as \n
     GOOGLE_CALENDAR_ID            — the calendar to read (defaults to
                                      hello@relevestaffing.com, which is also
                                      who the service account impersonates)
   Absent config returns an empty list rather than throwing, the same way
   the rest of this app degrades when Supabase isn't configured. */

import crypto from 'crypto';

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;       // ISO instant, or 'YYYY-MM-DD' for an all-day event
  end: string;
  allDay: boolean;
  location: string | null;
  meetingLink: string | null;
  attendees: string[];
  description?: string | null;   // Calendly writes the answers, cancel and reschedule links here
};

const CALENDAR_ID = () => process.env.GOOGLE_CALENDAR_ID || 'hello@relevestaffing.com';

export function calendarConfigured() {
  return !!(process.env.GOOGLE_CALENDAR_CLIENT_EMAIL && process.env.GOOGLE_CALENDAR_PRIVATE_KEY);
}

function base64url(input: Buffer | string) {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Reused across requests on a warm server instance; a service-account token
   is good for an hour, and there is no reason to mint a new one every load. */
const cachedTokens = new Map<string, { token: string; exp: number }>();
const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
/* Writing events (the discovery-call booking page, 2 Nov 2026) needs this
   scope added to the service account's domain-wide delegation entry in
   Google Workspace admin, next to calendar.readonly. Until it is, writes
   fail cleanly and bookings still stand (see lib/booking.ts). */
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

async function accessToken(scope: string = READ_SCOPE): Promise<string | null> {
  const email = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
  const key = process.env.GOOGLE_CALENDAR_PRIVATE_KEY;
  if (!email || !key) return null;

  const now = Math.floor(Date.now() / 1000);
  const cachedToken = cachedTokens.get(scope);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    sub: CALENDAR_ID(),
    iat: now, exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(key.replace(/\\n/g, '\n')));
  const jwt = `${unsigned}.${signature}`;

  let res: Response;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });
  } catch (e) {
    console.error('[calendar] token request threw', e);
    return null;
  }
  if (!res.ok) {
    console.error('[calendar] token request failed', res.status, await res.text().catch(() => ''));
    return null;
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  cachedTokens.set(scope, { token: json.access_token, exp: now + json.expires_in });
  return json.access_token;
}

/* Everything from now through `daysAhead` days out, soonest first. Never
   throws — a Google outage or a missing key should shrink the calendar
   widget to its empty state, not take the console page down with it. */
export async function upcomingCalendarEvents(daysAhead = 14, fresh = false): Promise<CalendarEvent[]> {
  const token = await accessToken();
  if (!token) return [];

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86_400_000).toISOString();
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID())}/events`);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '50');

  let res: Response;
  try {
    /* fresh skips the two-minute cache, for the import a new booking sets off,
       which has to see the event Calendly wrote seconds ago. */
    res = await fetch(url, fresh
      ? { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' }
      : { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 120 } });
  } catch (e) {
    console.error('[calendar] events request threw', e);
    return [];
  }
  if (!res.ok) {
    console.error('[calendar] events request failed', res.status, await res.text().catch(() => ''));
    return [];
  }
  const json = await res.json() as { items?: any[] };
  return (json.items ?? [])
    .filter(e => e.status !== 'cancelled')
    .map(e => ({
      id: e.id as string,
      title: (e.summary as string) || '(no title)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: !e.start?.dateTime,
      location: e.location || null,
      description: e.description || null,
      meetingLink: e.hangoutLink
        || e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri
        || null,
      attendees: ((e.attendees ?? []) as any[]).map(a => a.email).filter(Boolean)
    }));
}


/* ---------- the booking page (2 November 2026) ---------- */

/** Busy blocks on hello@'s calendar between two instants (free/busy only:
    no titles or guests are read). Throws if the calendar cannot be read, so
    the booking page never offers a time it could not check. */
export async function busyBlocks(fromISO: string, toISO: string): Promise<{ start: string; end: string }[]> {
  const token = await accessToken(READ_SCOPE);
  if (!token) throw new Error('The calendar is not connected.');
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST', cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin: fromISO, timeMax: toISO, items: [{ id: CALENDAR_ID() }] })
  });
  if (!res.ok) throw new Error(`Google Calendar free/busy failed (${res.status})`);
  const d = await res.json();
  const cal = d.calendars?.[CALENDAR_ID()];
  if (cal?.errors?.length) throw new Error(`Google Calendar free/busy: ${cal.errors[0].reason}`);
  return (cal?.busy ?? []) as { start: string; end: string }[];
}

/** Put a booked call on hello@'s calendar with the guest attached. Google
    sends nothing to the guest (sendUpdates none): Relève's own confirmation
    carries the calendar file. Returns the event id, or null if writing is
    not permitted yet. */
export async function createCalendarEvent(e: {
  title: string; start: string; end: string; description: string; location?: string | null;
  guestEmail: string; guestName: string;
}): Promise<string | null> {
  const token = await accessToken(WRITE_SCOPE);
  if (!token) return null;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID())}/events?sendUpdates=none`;
  const res = await fetch(url, {
    method: 'POST', cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: e.title, description: e.description, location: e.location || undefined,
      start: { dateTime: e.start }, end: { dateTime: e.end },
      attendees: [{ email: e.guestEmail, displayName: e.guestName }],
      reminders: { useDefault: true }
    })
  });
  if (!res.ok) { console.error('[calendar] create failed', res.status, await res.text().catch(() => '')); return null; }
  return (await res.json()).id ?? null;
}

export async function deleteCalendarEvent(id: string) {
  if (!id) return;
  const token = await accessToken(WRITE_SCOPE);
  if (!token) return;
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID())}/events/${encodeURIComponent(id)}?sendUpdates=none`, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) console.error('[calendar] delete failed', res.status);
}
