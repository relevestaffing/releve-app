import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { listInterviews, getAvailability, listMatches, bookedSlots } from '@/lib/store';
import { formatSlot, formatTime, overlappingSlots } from '@/lib/scheduling';
import { zoomConfigured } from '@/lib/zoom';
import Shell from '@/components/Shell';
import InterviewStatus from '@/components/InterviewStatus';
import BookInterview from '@/components/BookInterview';
import ClientSwitcher from '@/components/ClientSwitcher';
import TableSearch from '@/components/TableSearch';
import { Stat } from '@/components/Viz';
import { listPeople } from '@/lib/work';
import { getBench } from '@/lib/data';
import { listDecisions } from '@/lib/work';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

/* Booking used to be impossible from here.
   -----------------------------------------
   The Matching page told her to "book the introduction from Interviews", and
   Interviews was a read-only table that said executives book it themselves —
   so the most time-critical step in a search happened over email, outside the
   product. The API already accepted an admin booking; nothing called it. */
export default async function ConsoleInterviews({ searchParams }: {
  searchParams: Promise<{ client?: string }>;
}) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');

  const all = await listInterviews();
  /* The operator's own timezone, not a hardcoded Pacific. A London-based
     manager was reading every interview eight hours out. */
  const myAvail = await getAvailability(profile.id, '');
  const tz = myAvail.timezone?.trim() || 'America/Los_Angeles';
  const tzLabel = tz.split('/')[1]?.replace(/_/g, ' ') ?? tz;
  const count = (s: string) => all.filter(i => i.status === s).length;

  const now = Date.now();
  const dead = ['Cancelled', 'Declined', 'Completed', 'No-show'];
  /* Soonest first for what is coming, most recent first for what is done.
     The whole list used to be oldest-first with no split, so after six months
     tomorrow's interview sat below a year of finished ones. */
  const upcoming = all
    .filter(i => new Date(i.starts_at).getTime() >= now && !dead.includes(i.status))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = all.filter(i => !upcoming.includes(i))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  /* ---- who she can book, for whichever executive she picked ---- */
  const { client } = await searchParams;
  const people = await listPeople();
  const clients = people.filter(p => p.role === 'client');
  const clientId = client || clients[0]?.id || '';
  const chosen = clients.find(c => c.id === clientId) ?? null;

  const bookable: { id: string; name: string; role: string; slots: any[] }[] = [];
  if (clientId) {
    const matches = await listMatches(clientId);
    const decisions = await listDecisions(clientId);
    const declined = new Set(decisions.filter(d => d.state === 'passed').map(d => d.talent_id));
    const released = matches.filter(m => m.released && !declined.has(m.talent_id)).map(m => m.talent_id);
    if (released.length) {
      const bench = await getBench();
      const theirAvail = await getAvailability(clientId, tz);
      const busy = await bookedSlots(clientId);
      const from = new Date();
      for (const id of released) {
        const person = bench.find(b => b.id === id);
        if (!person) continue;
        const theirs = await getAvailability(id, 'Asia/Manila');
        const theirBusy = await bookedSlots(id);
        const slots = overlappingSlots(theirAvail, theirs, from, 10, 45, [...busy, ...theirBusy], [])
          .slice(0, 20)
          .map(s => ({ ...s, label: formatTime(s.startISO, tz),
            day: new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
              .format(new Date(s.startISO)) }));
        bookable.push({ id, name: person.name, role: person.role, slots });
      }
    }
  }

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/interviews" title="Interviews"
      crumb={upcoming.length ? `${upcoming.length} coming up` : 'Every account'}
      action={<span className={`pill ${zoomConfigured() ? 'good' : 'warn'}`}><span className="dot" />
        {zoomConfigured() ? 'Zoom connected' : 'Zoom not connected'}</span>}>

      <div className="grid-4">
        <Stat label="Coming up" value={upcoming.length} sub="Not yet held" />
        <Stat label="Completed" value={count('Completed')} sub="Interviews held" />
        <Stat label="Did not go ahead" value={count('Declined') + count('Cancelled')} sub="Cancelled or declined" />
        <Stat label="No-shows" value={count('No-show')} sub="Worth a conversation" />
      </div>

      <div className="card">
        <div className="card-head"><h3>Coming up</h3>
          <span className="pill">All times {tzLabel}</span></div>
        {upcoming.length === 0
          ? <p className="small muted">
              Nothing in the diary. Once you have approved a candidate for an executive,
              book the introduction below.
            </p>
          : (
            <table className="data">
              <thead><tr><th>Executive</th><th>Candidate</th><th>Stage</th><th>When</th><th>Status</th><th>Link</th></tr></thead>
              <tbody>
                {upcoming.map(iv => (
                  <tr key={iv.id}>
                    <td><b>{iv.client_name}</b></td>
                    <td>{iv.talent_name}</td>
                    <td className="small">{iv.stage}</td>
                    <td className="small">{formatSlot(iv.starts_at, tz)}</td>
                    <td><InterviewStatus id={iv.id} status={iv.status} mode="admin" /></td>
                    <td>{iv.meeting_url
                      ? <a className="btn sm ghost" href={iv.meeting_url} target="_blank" rel="noreferrer">Open</a>
                      : <span className="xs muted">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {/* ---------- book one ---------- */}
      <div className="section-title">
        <h2>Book an introduction</h2>
        <ClientSwitcher clients={clients as any} current={clientId} />
      </div>

      {!clients.length ? (
        <div className="card tight"><p className="small">No executives on the books yet.</p></div>
      ) : !bookable.length ? (
        <div className="card tight">
          <p className="small" style={{ margin: 0 }}>
            Nobody has been sent to <b>{chosen?.full_name ?? 'this executive'}</b> yet, or everyone sent was declined.
            Send a candidate from Matching and they appear here with the times the two of them are both free.
          </p>
        </div>
      ) : bookable.map(b => (
        <div className="card" key={b.id}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
            <div>
              <h3 style={{ margin: 0 }}>{b.name}</h3>
              <div className="small muted">
                {b.role} · {b.slots.length
                  ? `${b.slots.length} times they and ${chosen?.full_name ?? 'the executive'} are both free`
                  : 'no overlapping times — check both availabilities'}
              </div>
            </div>
          </div>
          {b.slots.length > 0 &&
            <BookInterview talentId={b.id} talentName={b.name} slots={b.slots} tz={tz} clientId={clientId} />}
        </div>
      ))}

      {past.length > 0 && (
        <details className="more">
          <summary>Past and cancelled ({past.length})</summary>
          <div className="inner">
            {past.length > 8 && <TableSearch scope="past-iv" placeholder="Search past interviews…" />}
            <table className="data" id="past-iv">
              <thead><tr><th>Executive</th><th>Candidate</th><th>When</th><th>Status</th></tr></thead>
              <tbody>
                {past.map(iv => (
                  <tr key={iv.id}>
                    <td><b>{iv.client_name}</b></td>
                    <td>{iv.talent_name}</td>
                    <td className="small">{formatSlot(iv.starts_at, tz)}</td>
                    <td><InterviewStatus id={iv.id} status={iv.status} mode="admin" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {!zoomConfigured() && (
        <div className="card tight">
          <p className="small muted">
            <b>Meeting links are being added by hand.</b> Zoom is not connected yet, so
            each booking is recorded without a link and somebody has to send one. Connecting
            Zoom makes that automatic — the steps are in your notes.
          </p>
        </div>
      )}
    </Shell>
  );
}
