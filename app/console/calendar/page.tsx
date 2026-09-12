import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { calendarConfigured, upcomingCalendarEvents, type CalendarEvent } from '@/lib/calendar';
import Shell from '@/components/Shell';
import { fmtDay } from '@/lib/words';

export const dynamic = 'force-dynamic';

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/* Google gives an all-day event's date as a bare YYYY-MM-DD and a timed
   event's start as a full instant — group by the calendar day either one
   falls on, in the viewer's own timezone for timed events, since that is
   the day Sage will actually be on the call. */
const dayKey = (e: CalendarEvent) => e.allDay ? e.start : e.start.slice(0, 10);

function groupByDay(events: CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  return [...groups.entries()];
}

const todayKey = () => new Date().toISOString().slice(0, 10);

export default async function ConsoleCalendar() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const configured = calendarConfigured();
  const events = configured ? await upcomingCalendarEvents(30) : [];
  const days = groupByDay(events);
  const t = todayKey();

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
                {dayEvents.map(e => (
                  <li key={e.id}>
                    <span className="past-date" style={{ minWidth: 92 }}>
                      {e.allDay ? 'All day' : `${timeOf(e.start)} – ${timeOf(e.end)}`}
                    </span>
                    <span>
                      <b>{e.title}</b>
                      {(e.location || e.meetingLink || e.attendees.length > 0) && (
                        <div className="xs muted">
                          {e.meetingLink ? 'Video call' : e.location || ''}
                          {e.attendees.length > 0 && `${e.meetingLink || e.location ? ' · ' : ''}${e.attendees.length} attendee${e.attendees.length === 1 ? '' : 's'}`}
                        </div>
                      )}
                    </span>
                    {e.meetingLink && (
                      <a className="btn sm ghost" href={e.meetingLink} target="_blank" rel="noreferrer">Join</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
