import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { calendarConfigured, upcomingCalendarEvents, type CalendarEvent } from '@/lib/calendar';
import { attendeeTimezones } from '@/lib/store';
import Shell from '@/components/Shell';
import { fmtDay } from '@/lib/words';

export const dynamic = 'force-dynamic';

/* hello@relevestaffing.com runs on Pacific time — that's the zone the
   Relève team itself reads this page in. Netlify's server clock is UTC,
   and toLocaleTimeString/toISOString fall back to that unless a zone is
   given explicitly, which was silently turning a 9am PT call into
   "4:00 PM" and could push an evening PT event into the next UTC day.
   Every date/time read on this page pins a zone explicitly. */
const TZ = 'America/Los_Angeles';

const timeOf = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });

/* PST vs PDT, EST vs EDT — the right one for the actual date of the event,
   not a flat label that goes wrong for half the year. Zones with no common
   abbreviation (Asia/Manila) fall back to a GMT offset, which is still
   clearer than nothing. */
const tzAbbrev = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date(iso)).find(p => p.type === 'timeZoneName')?.value ?? tz;

/* Google gives an all-day event's date as a bare YYYY-MM-DD (no zone to
   convert) and a timed event's start as a full instant — group timed
   events by the Pacific calendar day that instant falls on, not by
   whatever offset happened to be on the raw string. */
const dayKey = (e: CalendarEvent) =>
  e.allDay ? e.start : new Date(e.start).toLocaleDateString('en-CA', { timeZone: TZ });

function groupByDay(events: CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  return [...groups.entries()];
}

const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

export default async function ConsoleCalendar() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const configured = calendarConfigured();
  const events = configured ? await upcomingCalendarEvents(30) : [];
  const days = groupByDay(events);
  const t = todayKey();
  /* One batched lookup for every attendee across every event, rather than
     a query per event — so a client on Eastern or talent joining from
     Manila shows up in their own time next to ours. */
  const attendeeTz = await attendeeTimezones(events.flatMap(e => e.attendees));

  return (
    <Shell profile={profile} active="/console/calendar" title="Calendar"
      crumb="hello@relevestaffing.com, next 30 days">

      {!configured ? (
        <div className="card">
          <div className="empty"><span className="tick" />
            <p className="small">
              This isn't connected yet. Once the Google Calendar service account
              is authorised and its key is added to the site, discovery calls,
              interviews and everything else booked on hello@relevestaffing.com
              will show up here automatically.
            </p>
          </div>
        </div>
      ) : !days.length ? (
        <div className="card">
          <div className="empty"><span className="tick" />
            <p className="small">Nothing booked on hello@ in the next 30 days.</p>
          </div>
        </div>
      ) : (
        <div className="stack">
          {days.map(([key, dayEvents]) => (
            <div className="card" key={key}>
              <div className="card-head">
                <h3>{key === t ? 'Today' : fmtDay(key.slice(0, 10))}</h3>
                <span className="pill">{dayEvents.length}</span>
              </div>
              <ul className="past-list">
                {dayEvents.map(e => {
                  /* A real Google Meet/Zoom integration sets meetingLink.
                     A Zoom link someone pasted straight into the location
                     field instead doesn't — it shows up as plain text in
                     e.location, unclickable, with no "Join" button. Treat
                     a location that's itself a URL the same as a real
                     meetingLink so it always renders as a clickable Join. */
                  const locationIsLink = !!e.location && /^https?:\/\//i.test(e.location.trim());
                  const link = e.meetingLink || (locationIsLink ? e.location : null);
                  /* Who on this event is a known Relève account, other than
                     hello@ itself — that's whose local time is worth
                     showing. Talent and clients pick their own zone on the
                     Availability page; this is just reading it back. */
                  const theirs = e.attendees
                    .filter(a => a.toLowerCase() !== 'hello@relevestaffing.com')
                    .map(a => attendeeTz.get(a.toLowerCase()))
                    .filter((info): info is NonNullable<typeof info> => !!info);
                  return (
                    <li key={e.id}>
                      <span className="past-date" style={{ minWidth: 92 }}>
                        {e.allDay ? 'All day' : `${timeOf(e.start, TZ)} – ${timeOf(e.end, TZ)} ${tzAbbrev(e.start, TZ)}`}
                      </span>
                      <span>
                        <b>{e.title}</b>
                        {(e.location || link || e.attendees.length > 0) && (
                          <div className="xs muted">
                            {link ? 'Video call' : e.location || ''}
                            {e.attendees.length > 0 && `${link || e.location ? ' · ' : ''}${e.attendees.length} attendee${e.attendees.length === 1 ? '' : 's'}`}
                          </div>
                        )}
                        {!e.allDay && theirs.length > 0 && (
                          <div className="xs muted">
                            {theirs.map((info, i) => (
                              <span key={i}>
                                {i > 0 && ' · '}
                                {info.name ?? (info.role === 'talent' ? 'Talent' : 'Client')}: {timeOf(e.start, info.timezone)} {tzAbbrev(e.start, info.timezone)}
                              </span>
                            ))}
                          </div>
                        )}
                      </span>
                      {link && (
                        <a className="btn sm ghost" href={link} target="_blank" rel="noreferrer">Join</a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
