/* ============================================================
   GOOGLE CALENDAR — optional free/busy sync.
   ⚠ SERVER ONLY. Uses a stored refresh token to ask Google when
   the person is busy. Relève never reads event titles, guests, or
   descriptions — only the blocks of time. That is the whole point
   of the freebusy endpoint rather than the events endpoint.
   ============================================================ */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export const googleConfigured = () => !!(CLIENT_ID && CLIENT_SECRET);
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';

export type Interval = { start: string; end: string };

async function accessToken(refreshToken: string): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!,
      refresh_token: refreshToken, grant_type: 'refresh_token'
    })
  });
  if (!r.ok) throw new Error(`Google refused the refresh token (${r.status}). The person may have revoked access.`);
  return (await r.json()).access_token;
}

/** The blocks of time this person is already busy, between two instants. */
export async function busyIntervals(refreshToken: string, fromISO: string, toISO: string): Promise<Interval[]> {
  if (!googleConfigured() || !refreshToken) return [];
  const token = await accessToken(refreshToken);
  const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin: fromISO, timeMax: toISO, items: [{ id: 'primary' }] })
  });
  if (!r.ok) throw new Error(`Google Calendar would not answer (${r.status}).`);
  const d = await r.json();
  const cal = d.calendars?.primary;
  if (cal?.errors?.length) throw new Error(cal.errors[0].reason ?? 'calendar unavailable');
  return (cal?.busy ?? []) as Interval[];
}
