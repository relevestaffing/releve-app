import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentProfile } from '@/lib/supabase/server';
import { getMySignature, rankBench, getBench } from '@/lib/data';
import { getAvailability, listInterviews, listMatches, bookedSlots, getCalendar, noteCalendarError, getSelfProfile, getSearch } from '@/lib/store';
import { busyIntervals } from '@/lib/google-calendar';
import { overlappingSlots, formatSlot, formatTime } from '@/lib/scheduling';
import Shell from '@/components/Shell';
import { Portrait } from '@/components/Viz';
import BookInterview from '@/components/BookInterview';
import InterviewStatus from '@/components/InterviewStatus';
import InterviewFeedback from '@/components/InterviewFeedback';
import { listFeedback } from '@/lib/work';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function Interviews() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  const isClient = profile.role === 'client';
  const mine = await listInterviews(isClient ? { clientId: profile.id } : { talentId: profile.id });
  const myAvail = await getAvailability(profile.id, 'America/Los_Angeles');
  const tz = myAvail.timezone;
  const feedback = await listFeedback({ authorId: profile.id });
  const fbByInterview = Object.fromEntries(feedback.map(f => [f.interview_id, f]));
  const past = (iso: string) => new Date(iso).getTime() < Date.now();

  /* talent: who they are actually meeting, and what the job is */
  const meeting = isClient ? [] : await Promise.all(
    [...new Map(mine.filter(i => ['Proposed', 'Confirmed'].includes(i.status))
      .map(i => [i.client_id, i])).values()]
      .map(async i => ({
        id: i.client_id, name: i.client_name,
        who: await getSelfProfile(i.client_id),
        brief: await getSearch(i.client_id)
      }))
  );

  /* a client can book anyone released to them */
  let bookable: { id: string; name: string; role: string; slots: any[] }[] = [];
  if (isClient) {
    const sig = await getMySignature(profile, 'client');
    const released = (await listMatches(profile.id)).filter(m => m.released).map(m => m.talent_id);
    const bench = await getBench();
    const busy = await bookedSlots(profile.id);
    const from = new Date();
    const to = new Date(from.getTime() + 10 * 86400000);

    /* if either side has connected a calendar, its real conflicts come out of the slots */
    async function calendarBusy(userId: string) {
      const conn = await getCalendar(userId);
      if (!conn) return [];
      try { return await busyIntervals(conn.refresh_token, from.toISOString(), to.toISOString()); }
      catch (e: any) { await noteCalendarError(userId, e.message); return []; }
    }
    const myBusyCal = await calendarBusy(profile.id);

    for (const id of released) {
      const person = bench.find(b => b.id === id);
      if (!person) continue;
      const theirs = await getAvailability(id, 'Asia/Manila');
      const theirBusy = await bookedSlots(id);
      const theirBusyCal = await calendarBusy(id);
      const slots = overlappingSlots(myAvail, theirs, from, 10, 45,
        [...busy, ...theirBusy], [...myBusyCal, ...theirBusyCal]).slice(0, 20)
        .map(s => ({ ...s, label: formatTime(s.startISO, tz),
          day: new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(s.startISO)) }));
      bookable.push({ id, name: person.name, role: person.role, slots });
    }
  }

  return (
    <Shell profile={profile} active="/app/interviews" title="Interviews" crumb={isClient ? 'Book and track' : 'Your schedule'}
      action={<Link className="btn sm ghost" href="/app/availability">Set your availability</Link>}>

      <div className="card">
        <div className="card-head"><h3>Scheduled</h3>
          <span className="pill">{mine.length} total</span></div>
        {mine.length === 0
          ? <p className="small muted">Nothing scheduled yet.</p>
          : (
            <table className="data">
              <thead><tr><th>{isClient ? 'Candidate' : 'Client'}</th><th>Stage</th><th>When ({tz.split('/')[1]?.replace('_', ' ')})</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {mine.map(iv => (
                  <tr key={iv.id}>
                    <td><b>{isClient ? iv.talent_name : iv.client_name}</b></td>
                    <td className="small">{iv.stage}</td>
                    <td className="small">{formatSlot(iv.starts_at, tz)}</td>
                    <td><InterviewStatus id={iv.id} status={iv.status} canEdit={!isClient} /></td>
                    <td>{past(iv.starts_at) || iv.status === 'Completed'
                      ? <InterviewFeedback interviewId={iv.id}
                          who={(isClient ? iv.talent_name : iv.client_name).split(' ')[0]}
                          side={isClient ? 'client' : 'talent'}
                          existing={fbByInterview[iv.id] ?? null} />
                      : iv.meeting_url
                        ? <a className="btn sm ghost" href={iv.meeting_url} target="_blank" rel="noreferrer">Join</a>
                        : <span className="xs muted">Link to follow</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {isClient && bookable.length > 0 && (
        <>
          <div className="section-title"><h2>Book someone in</h2>
            <span className="small muted">Times shown are yours; they see theirs</span></div>
          {bookable.map(b => (
            <div className="card" key={b.id}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
                <div className="row">
                  <Portrait id={b.id} name={b.name} />
                  <div><h3 style={{ fontSize: 19 }}>{b.name}</h3>
                    <div className="small muted">{b.role} · {b.slots.length} times you are both free</div></div>
                </div>
              </div>
              <BookInterview talentId={b.id} talentName={b.name} slots={b.slots} tz={tz} />
            </div>
          ))}
        </>
      )}

      {!isClient && meeting.length > 0 && (
        <>
          <div className="section-title"><h2>Who you are meeting</h2>
            <span className="small muted">Read this before the call</span></div>
          {meeting.map(m => (
            <div className="card" key={m.id}>
              <div className="row" style={{ gap: 16, marginBottom: m.who.bio || m.brief ? 18 : 0 }}>
                <Portrait id={m.id} name={m.name} cls="lg" url={m.who.photo_url} />
                <div>
                  <h3 style={{ fontSize: 20 }}>{m.who.full_name ?? m.name}</h3>
                  <div className="small muted">
                    {[m.who.headline, m.who.org_name, m.who.location].filter(Boolean).join(' · ') || 'Executive'}
                  </div>
                </div>
              </div>
              {m.who.bio && <p className="small" style={{ maxWidth: 640 }}>{m.who.bio}</p>}
              {m.brief?.role_title && (
                <>
                  <div className="eyebrow" style={{ marginTop: 22, marginBottom: 10 }}>The role</div>
                  <p style={{ fontFamily: 'Marcellus,serif', fontSize: 19, color: 'var(--fern)' }}>{m.brief.role_title}</p>
                  <dl className="brief-facts">
                    {m.brief.scope && <><dt>Owns</dt><dd>{m.brief.scope}</dd></>}
                    {m.brief.hours && <><dt>Hours</dt><dd>{m.brief.hours}</dd></>}
                    {m.brief.tools && <><dt>Tools</dt><dd>{m.brief.tools}</dd></>}
                    {m.brief.target_at && <><dt>Start</dt><dd>{m.brief.target_at}</dd></>}
                  </dl>
                </>
              )}
            </div>
          ))}
        </>
      )}

      {!isClient && (
        <div className="card tight">
          <p className="small muted">
            Executives can only book you inside the hours you have marked as free.
            Keep them current and you will never be offered a call at 3am.
          </p>
        </div>
      )}
    </Shell>
  );
}
