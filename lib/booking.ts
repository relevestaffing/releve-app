import crypto from 'crypto';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { busyBlocks, createCalendarEvent, deleteCalendarEvent, calendarConfigured } from '@/lib/calendar';
import { createZoomMeeting, cancelZoomMeeting, zoomConfigured } from '@/lib/zoom';

/* Relève's own discovery-call booking (Nona, 2 November 2026).
   -----------------------------------------------------------
   "I need a link I can send people for booking a discovery call with me",
   without paying for a scheduler and without anyone outside the signed
   clients ever being inside the app. So the page lives on the website
   (relevestaffing.com/book) and this file does the work behind it:

   - the hours, rules and page wording are one settings row Nona edits in
     the console (content_settings, key 'booking'), copied from Calendly on
     the day it was built;
   - open times come from those hours minus hello@'s calendar (free/busy)
     and the calls already booked here, with the buffer, the daily cap, the
     minimum notice and the booking window applied;
   - booking makes the Zoom meeting on Relève's Pro account, puts the call on
     hello@'s calendar, stores the booking, and returns a private link for
     the guest to reschedule or cancel on the website.

   Bookings are stored as content_settings rows too (key 'booking:<id>'), so
   none of this needs a database change. Times are stored in UTC; the hours
   are kept in the settings' own time zone. */

export type Range = { start: string; end: string };            // 'HH:MM' in the settings time zone
export type BookingSettings = {
  enabled: boolean;
  timezone: string;
  weekly: Record<string, Range[]>;                             // '0' Sunday .. '6' Saturday
  overrides: { date: string; ranges: Range[] }[];              // YYYY-MM-DD; [] = closed that day
  durationMin: number;
  incrementMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  maxPerDay: number;
  minNoticeHours: number;
  daysAhead: number;
  page: { title: string; intro: string; button: string; host: string };
};

/* Calendly's Discovery Call, as it stood on 2 November 2026. */
export const DEFAULT_SETTINGS: BookingSettings = {
  enabled: true,
  timezone: 'America/Los_Angeles',
  weekly: {
    '0': [], '1': [{ start: '09:00', end: '13:00' }], '2': [{ start: '09:00', end: '13:00' }], '3': [],
    '4': [{ start: '09:00', end: '17:00' }], '5': [{ start: '09:00', end: '13:00' }], '6': []
  },
  overrides: [],
  durationMin: 30,
  incrementMin: 30,
  bufferBeforeMin: 15,
  bufferAfterMin: 0,
  maxPerDay: 5,
  minNoticeHours: 24,
  daysAhead: 30,
  page: {
    title: 'Book your discovery call',
    intro: 'A focused thirty minutes on the virtual professional you need. We cover the role, the standards and the kind of person you would trust, and you leave knowing exactly how your 14-day search works.',
    button: 'Choose my time',
    host: 'Sage Jackson'
  }
};

const KEY = 'booking';
const SITE = 'https://relevestaffing.com';

export function bookingReady() {
  return hasServiceKey() && calendarConfigured();
}

/* ---------- settings ---------- */

function clean(s: any): BookingSettings {
  const d = DEFAULT_SETTINGS;
  const hhmm = (v: any) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : null;
  const ranges = (rs: any): Range[] => (Array.isArray(rs) ? rs : [])
    .map((r: any) => ({ start: hhmm(r?.start), end: hhmm(r?.end) }))
    .filter((r: any) => r.start && r.end && r.start < r.end)
    .sort((a: any, b: any) => a.start.localeCompare(b.start)) as Range[];
  const num = (v: any, lo: number, hi: number, dflt: number) => {
    const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  const tz = (() => { try { new Intl.DateTimeFormat('en-US', { timeZone: s?.timezone }); return String(s?.timezone || d.timezone); } catch { return d.timezone; } })();
  const weekly: Record<string, Range[]> = {};
  for (let i = 0; i < 7; i++) weekly[String(i)] = s?.weekly ? ranges(s.weekly[String(i)]) : d.weekly[String(i)];
  const text = (v: any, max: number, dflt: string) => { const t = String(v ?? '').trim().slice(0, max); return t || dflt; };
  return {
    enabled: s?.enabled === undefined ? d.enabled : Boolean(s.enabled),
    timezone: tz,
    weekly,
    overrides: (Array.isArray(s?.overrides) ? s.overrides : [])
      .filter((o: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(o?.date)))
      .map((o: any) => ({ date: String(o.date), ranges: ranges(o.ranges) }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date)).slice(0, 200),
    durationMin: num(s?.durationMin, 10, 240, d.durationMin),
    incrementMin: num(s?.incrementMin, 5, 120, d.incrementMin),
    bufferBeforeMin: num(s?.bufferBeforeMin, 0, 240, d.bufferBeforeMin),
    bufferAfterMin: num(s?.bufferAfterMin, 0, 240, d.bufferAfterMin),
    maxPerDay: num(s?.maxPerDay, 0, 50, d.maxPerDay),
    minNoticeHours: num(s?.minNoticeHours, 0, 24 * 30, d.minNoticeHours),
    daysAhead: num(s?.daysAhead, 1, 120, d.daysAhead),
    page: {
      title: text(s?.page?.title, 120, d.page.title),
      intro: text(s?.page?.intro, 600, d.page.intro),
      button: text(s?.page?.button, 40, d.page.button),
      host: text(s?.page?.host, 80, d.page.host)
    }
  };
}

export async function getBookingSettings(): Promise<BookingSettings> {
  if (!hasServiceKey()) return DEFAULT_SETTINGS;
  const { data } = await adminClient().from('content_settings').select('value').eq('key', KEY).maybeSingle();
  return clean(data?.value ?? DEFAULT_SETTINGS);
}

export async function saveBookingSettings(input: unknown): Promise<BookingSettings> {
  const s = clean(input);
  const { error } = await adminClient().from('content_settings')
    .upsert({ key: KEY, value: s, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return s;
}

/* ---------- time zone arithmetic ---------- */

function offsetMin(at: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(at).map(x => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - at.getTime()) / 60000);
}
/* The UTC instant of a wall-clock time on a calendar date in a zone. */
export function wallToUtc(date: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi));
  const first = new Date(guess.getTime() - offsetMin(guess, timeZone) * 60000);
  return new Date(guess.getTime() - offsetMin(first, timeZone) * 60000);   // second pass settles DST edges
}
function dateIn(at: Date, timeZone: string) {
  return at.toLocaleDateString('en-CA', { timeZone });
}
function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/* ---------- stored bookings ---------- */

export type Booking = {
  id: string; status: 'booked' | 'cancelled';
  name: string; email: string; phone: string | null; org: string | null; notes: string | null;
  start: string; end: string; timezone: string;
  zoomId: string | null; joinUrl: string | null; eventId: string | null;
  source: string | null; created_at: string; cancelled_at?: string | null; rescheduled_from?: string | null;
  /* Screening calls (source 'screening') belong to a job application, so a move or a cancel can keep that application's call in step. */
  applicationId?: string | null;
  /* The calendar UID stays the same across reschedules so the guest's calendar
     replaces the old time instead of keeping both (QA, 2 Nov 2026). */
  uid?: string; sequence?: number;
};

export async function listBookings(opts: { fromISO?: string; includeCancelled?: boolean } = {}): Promise<Booking[]> {
  const { data } = await adminClient().from('content_settings').select('value').like('key', 'booking:%').limit(2000);
  const from = opts.fromISO ? Date.parse(opts.fromISO) : -Infinity;
  return ((data ?? []).map(r => r.value as Booking))
    .filter(b => b && b.start && Date.parse(b.end) >= from && (opts.includeCancelled || b.status === 'booked'))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function getBooking(id: string): Promise<Booking | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await adminClient().from('content_settings').select('value').eq('key', `booking:${id}`).maybeSingle();
  return (data?.value as Booking) ?? null;
}

async function putBooking(b: Booking) {
  const { error } = await adminClient().from('content_settings')
    .upsert({ key: `booking:${b.id}`, value: b, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

/* The guest's private link: the booking id signed with the server secret,
   so it cannot be guessed or altered. */
function secret() {
  const s = process.env.BOOKING_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('No signing secret is configured for booking links.');
  return s;
}
export function manageToken(id: string) {
  const sig = crypto.createHmac('sha256', secret()).update(id).digest('base64url').slice(0, 22);
  return `${id}.${sig}`;
}
export function readManageToken(token: string): string | null {
  const [id, sig] = String(token || '').split('.');
  if (!id || !sig) return null;
  const want = manageToken(id).split('.')[1];
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}
/* The applicant's own booking link: their application id, signed, so a link
   made for one person cannot be turned into another's. */
export function appToken(id: string) {
  const sig = crypto.createHmac('sha256', secret()).update(`app:${id}`).digest('base64url').slice(0, 22);
  return `${id}.${sig}`;
}
export function readAppToken(token: string): string | null {
  const [id, sig] = String(token || '').split('.');
  if (!id || !sig || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const want = appToken(id).split('.')[1];
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}
export const SCREENING_LINK = `${SITE}/book/screening/`;
export const screeningLinkFor = (applicationId: string) => `${SCREENING_LINK}?a=${encodeURIComponent(appToken(applicationId))}`;
export const isScreening = (b: { source: string | null }) => b.source === 'screening';
export const manageUrl = (id: string) => `${SITE}/book/manage/?b=${encodeURIComponent(manageToken(id))}`;

/* ---------- open times ---------- */

export async function openSlots(opts: { ignoreBookingId?: string } = {}): Promise<{ settings: BookingSettings; slots: string[] }> {
  const s = await getBookingSettings();
  if (!s.enabled) return { settings: s, slots: [] };
  const now = Date.now();
  const today = dateIn(new Date(now), s.timezone);
  const windowEnd = wallToUtc(addDays(addDays(today, s.daysAhead), 1), '00:00', s.timezone);
  const [busy, booked] = await Promise.all([
    busyBlocks(new Date(now).toISOString(), windowEnd.toISOString()),
    listBookings({ fromISO: new Date(now - 86400_000).toISOString() })
  ]);
  return { settings: s, slots: computeSlots(s, now, busy, booked.filter(b => b.id !== opts.ignoreBookingId)) };
}

/* The slot arithmetic on its own, so it can be checked without a calendar. */
export function computeSlots(s: BookingSettings, now: number, busy: { start: string; end: string }[], mine: { start: string; end: string }[]): string[] {
  const earliest = now + s.minNoticeHours * 3600_000;
  const today = dateIn(new Date(now), s.timezone);
  const lastDay = addDays(today, s.daysAhead);
  /* The calendar already holds our own bookings once written there; when it
     cannot be written yet, the stored bookings block their time instead. */
  const blocks = [...busy, ...mine].map(b => ({ s: Date.parse(b.start), e: Date.parse(b.end) }));
  const perDay = new Map<string, number>();
  for (const b of mine) { const k = dateIn(new Date(b.start), s.timezone); perDay.set(k, (perDay.get(k) ?? 0) + 1); }

  const before = s.bufferBeforeMin * 60000, after = s.bufferAfterMin * 60000, len = s.durationMin * 60000;
  const out: string[] = [];
  for (let date = today; date <= lastDay; date = addDays(date, 1)) {
    if (s.maxPerDay && (perDay.get(date) ?? 0) >= s.maxPerDay) continue;
    const override = s.overrides.find(o => o.date === date);
    const ranges = override ? override.ranges : (s.weekly[String(weekdayOf(date))] ?? []);
    for (const r of ranges) {
      const rs = wallToUtc(date, r.start, s.timezone).getTime(), re = wallToUtc(date, r.end, s.timezone).getTime();
      for (let t = rs; t + len <= re; t += s.incrementMin * 60000) {
        if (t < earliest) continue;
        if (blocks.some(b => t - before < b.e && t + len + after > b.s)) continue;
        out.push(new Date(t).toISOString());
      }
    }
  }
  return out;
}

/* ---------- booking, rescheduling, cancelling ---------- */

export class SlotTaken extends Error {}

export async function createBooking(o: {
  name: string; email: string; phone: string | null; org?: string | null; notes?: string | null;
  start: string; timezone: string; source?: string | null; rescheduleOf?: Booking | null; applicationId?: string | null;
}): Promise<Booking> {
  const { settings: s, slots } = await openSlots({ ignoreBookingId: o.rescheduleOf?.id });
  const startISO = new Date(o.start).toISOString();
  if (!slots.includes(startISO)) throw new SlotTaken('That time is no longer available.');
  /* Claim the slot before the slow Zoom and calendar calls, so two people
     who pass the check at the same moment cannot both book it (QA, 2 Nov 2026). */
  {
    const { error: claimErr } = await adminClient().from('content_settings')
      .insert({ key: `slot:${startISO}`, value: { at: new Date().toISOString(), email: o.email }, updated_at: new Date().toISOString() });
    if (claimErr) {
      if (String(claimErr.code) === '23505' || /duplicate|unique/i.test(claimErr.message ?? '')) {
        if (!o.rescheduleOf || o.rescheduleOf.start !== startISO) throw new SlotTaken('That time was just taken. Please choose another.');
      } else console.error('[booking] slot claim failed', claimErr.message);
    }
  }
  const end = new Date(Date.parse(startISO) + s.durationMin * 60000).toISOString();
  const id = crypto.randomUUID();

  let zoom: { url: string; id: string } | null = null;
  if (zoomConfigured()) {
    try {
      zoom = await createZoomMeeting({
        topic: o.source === 'screening' ? `Relève screening call: ${o.name}` : `Relève discovery call: ${o.name}`, startISO, durationMin: s.durationMin,
        timezone: s.timezone, agenda: o.source === 'screening' ? `Screening call with ${o.name}.` : `Discovery call with ${o.name}${o.org ? ` (${o.org})` : ''}.`
      });
    } catch (e) { console.error('[booking] zoom failed', e); }
  }

  const description = [
    `${o.source === 'screening' ? 'Screening call' : 'Discovery call'} with ${o.name} (${o.email}${o.phone ? `, ${o.phone}` : ''}).`,
    o.org ? `Business: ${o.org}` : '',
    o.notes ? `\nWhat they told us:\n${o.notes}` : '',
    zoom ? `\nZoom: ${zoom.url}` : '',
    `\nBooked on relevestaffing.com.`
  ].filter(Boolean).join('\n');
  let eventId: string | null = null;
  try {
    eventId = await createCalendarEvent({
      title: `${o.name} and ${s.page.host}`.slice(0, 200), start: startISO, end, description,
      location: zoom?.url ?? null, guestEmail: o.email, guestName: o.name
    });
  } catch (e) { console.error('[booking] calendar write failed', e); }

  const b: Booking = {
    id, status: 'booked', name: o.name, email: o.email, phone: o.phone, org: o.org ?? null, notes: o.notes ?? null,
    start: startISO, end, timezone: o.timezone, zoomId: zoom?.id ?? null, joinUrl: zoom?.url ?? null, eventId,
    source: o.source ?? null, created_at: new Date().toISOString(), rescheduled_from: o.rescheduleOf?.id ?? null,
    uid: o.rescheduleOf?.uid ?? o.rescheduleOf?.id ?? id, sequence: (o.rescheduleOf?.sequence ?? 0) + 1,
    applicationId: o.applicationId ?? o.rescheduleOf?.applicationId ?? null
  };
  try { await putBooking(b); }
  catch (e) { try { await adminClient().from('content_settings').delete().eq('key', `slot:${startISO}`); } catch {} throw e; }
  return b;
}

export async function cancelBooking(b: Booking): Promise<Booking> {
  if (b.status === 'cancelled') return b;
  try { if (b.zoomId) await cancelZoomMeeting(b.zoomId); } catch (e) { console.error('[booking] zoom cancel failed', e); }
  try { if (b.eventId) await deleteCalendarEvent(b.eventId); } catch (e) { console.error('[booking] calendar delete failed', e); }
  const done: Booking = { ...b, status: 'cancelled', cancelled_at: new Date().toISOString() };
  await putBooking(done);
  try { await adminClient().from('content_settings').delete().eq('key', `slot:${b.start}`); } catch {}
  return done;
}

/* ---------- the calendar file in the confirmation ---------- */

function icsStamp(iso: string) { return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsText(t: string) { return t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m); }

export function bookingIcs(b: Booking, opts: { method: 'REQUEST' | 'CANCEL'; host: string; sequence?: number }) {
  const lines = [
    'BEGIN:VCALENDAR', 'PRODID:-//Releve Executive Staffing//Booking//EN', 'VERSION:2.0', `METHOD:${opts.method}`,
    'BEGIN:VEVENT',
    `UID:${b.uid ?? b.id}@relevestaffing.com`,
    `SEQUENCE:${(b.sequence ?? 0) + (opts.sequence ?? 0)}`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(b.start)}`, `DTEND:${icsStamp(b.end)}`,
    `SUMMARY:${icsText(`Relève discovery call with ${opts.host}`)}`,
    `DESCRIPTION:${icsText(`${b.joinUrl ? `Join on Zoom: ${b.joinUrl}\n` : ''}Reschedule or cancel: ${manageUrl(b.id)}`)}`,
    b.joinUrl ? `LOCATION:${icsText(b.joinUrl)}` : '',
    'ORGANIZER;CN=Relève:mailto:hello@relevestaffing.com',
    `ATTENDEE;CN=${icsText(b.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${b.email}`,
    `STATUS:${opts.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean);
  return lines.join('\r\n');
}
