import { NextResponse } from 'next/server';
import { send, templates } from '@/lib/email';
import { personEmail, teamEmails } from '@/lib/work';
import { currentProfile } from '@/lib/supabase/server';
import { createInterview, setInterviewStatus, listInterviews, getInterview, getAvailability } from '@/lib/store';
import { createZoomMeeting, zoomConfigured, cancelZoomMeeting } from '@/lib/zoom';
import { getBench } from '@/lib/data';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGES = ['First interview', 'Second interview', 'Final interview', 'Working session'];

/* Each side reads a time in their own timezone, never the other person's. */
const when = (iso: string, tz: string | null) => new Intl.DateTimeFormat('en-GB', {
  timeZone: tz || 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
}).format(new Date(iso));

export async function GET() {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const filter = p.role === 'client' ? { clientId: p.id } : p.role === 'talent' ? { talentId: p.id } : undefined;
  return NextResponse.json(await listInterviews(filter));
}

/* Booking. The client self-serves from the talent's open slots. */
export async function POST(req: Request) {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { talentId, clientId } = body ?? {};

  /* Checked here as well as in the database: a time that is not a time, a
     meeting that runs for a day, or a stage name nobody chose. */
  const start = typeof body?.startISO === 'string' ? new Date(body.startISO) : null;
  if (!start || Number.isNaN(start.getTime()))
    return NextResponse.json({ error: 'Please choose a time for the interview.' }, { status: 400 });
  if (start.getTime() < Date.now() - 5 * 60_000)
    return NextResponse.json({ error: 'That time has already passed. Please choose another.' }, { status: 400 });
  if (start.getTime() > Date.now() + 366 * 86_400_000)
    return NextResponse.json({ error: 'Please choose a time within the next year.' }, { status: 400 });
  const startISO = start.toISOString();
  const durationMin = body?.durationMin == null ? 45 : Number(body.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 180)
    return NextResponse.json({ error: 'An interview runs between 15 minutes and 3 hours.' }, { status: 400 });
  const stage = body?.stage == null ? 'First interview' : String(body.stage);
  if (!STAGES.includes(stage))
    return NextResponse.json({ error: 'That is not an interview stage.' }, { status: 400 });
  if (typeof talentId !== 'string' || !UUID.test(talentId))
    return NextResponse.json({ error: 'which candidate?' }, { status: 400 });
  if (p.role === 'admin' && (typeof clientId !== 'string' || !UUID.test(clientId)))
    return NextResponse.json({ error: 'which executive?' }, { status: 400 });

  /* Interviews are booked by the executive (from the candidate's slots) or
     by Relève on their behalf. A talent calling this used to become both
     parties of their own interview, since cid fell through to p.id. */
  if (p.role === 'talent')
    return NextResponse.json({ error: 'Interviews are booked by the executive or by Relève.' }, { status: 403 });
  const cid = p.role === 'admin' ? clientId : p.id;
  if (!cid || !talentId)
    return NextResponse.json({ error: 'which executive, and which candidate?' }, { status: 400 });
  const bench = await getBench();
  const talent = bench.find(t => t.id === talentId);
  /* getBench() already reads through the signed-in session, so for an
     executive it comes back as only the candidates released to them —
     row level security on talent_directory sees to that. If the id they
     booked isn't in that list, it was never released to this client, and
     nothing past this point should run: without this check a client could
     book any candidate on the bench directly, sight unseen by them and
     unannounced to the talent, just by knowing or guessing an id. */
  if (p.role === 'client' && !talent)
    return NextResponse.json({ error: 'That candidate has not been released to you yet.' }, { status: 403 });

  /* When Relève books on someone's behalf, the executive's name has to be
     looked up. It used to be recorded as the literal word "Client". */
  const execName = p.role === 'admin' ? (await personEmail(cid))?.full ?? 'Executive'
                                      : (p.full_name ?? p.email);

  let meeting = null;
  let warning: string | null = null;
  try {
    meeting = await createZoomMeeting({
      topic: `Relève interview: ${talent?.name ?? 'candidate'}`,
      startISO, durationMin, timezone: 'UTC',
      agenda: 'Introductory interview arranged by Relève Executive Staffing.'
    });
  } catch (e: any) {
    warning = e.message;                       // booking still stands; the link can be added by hand
  }
  if (!zoomConfigured()) warning = 'Zoom is not connected yet. Add the meeting link by hand.';

  const iv = await createInterview({
    client_id: cid, talent_id: talentId,
    client_name: execName,
    talent_name: talent?.name ?? 'Candidate',
    stage, starts_at: startISO, duration_min: durationMin,
    status: 'Confirmed',                        // client self-serve: booking it confirms it
    meeting_url: meeting?.url ?? null, meeting_id: meeting?.id ?? null, notes: null
  });
  /* Confirm it to both sides, each in their own timezone. */
  for (const [personId, otherName] of [[cid, iv.talent_name], [talentId, iv.client_name]] as const) {
    const who = await personEmail(personId);
    if (!who) continue;
    const theirTz = (await getAvailability(personId, 'UTC')).timezone;
    const tpl = templates.interviewBooked({
      name: who.name, withWhom: otherName, when: when(startISO, theirTz), url: meeting?.url ?? null
    });
    await send(who.email, tpl);
  }

  /* A booking with no meeting link is a link somebody at Relève owes — and
     both sides were just told it is coming. Tell the one person who has to
     send it. */
  if (warning) {
    try {
      const whenUtc = when(startISO, null);
      for (const t of await teamEmails())
        await send(t, templates.meetingLinkOwed({ who: iv.client_name, withWhom: iv.talent_name, when: whenUtc }));
    } catch { /* the booking stands */ }
  }

  return NextResponse.json({ interview: iv, warning });
}

const STATUSES = ['Proposed','Confirmed','Declined','Completed','No-show','Cancelled'];

export async function PATCH(req: Request) {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { id, status } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !id)
    return NextResponse.json({ error: 'which interview?' }, { status: 400 });
  if (!STATUSES.includes(status))
    return NextResponse.json({ error: 'That is not an interview status.' }, { status: 400 });

  const before = await getInterview(id);
  if (!before) return NextResponse.json({ error: 'that interview no longer exists' }, { status: 404 });

  if (p.role !== 'admin') {
    /* Row level security already restricts an update to a party of the
       interview or an admin, but the status itself needs its own limit:
       InterviewStatus.tsx only ever sends 'Confirmed' or 'Cancelled' for a
       client or talent — everything else (Proposed, Declined, Completed,
       No-show) is Relève's own record of what actually happened, not a
       verdict either side gets to hand down about themselves or the other
       person by calling this endpoint directly. */
    if (before.client_id !== p.id && before.talent_id !== p.id)
      return NextResponse.json({ error: 'not yours' }, { status: 403 });
    if (!['Confirmed', 'Cancelled'].includes(status))
      return NextResponse.json({ error: 'only Relève can set that status' }, { status: 403 });
  }

  await setInterviewStatus(id, status);

  /* A booked Zoom meeting stays live and joinable (no waiting room) until
     someone tells Zoom otherwise. That used to only happen for 'Cancelled' —
     'Declined' and 'No-show' are just as final and left the link open
     indefinitely. All three end the meeting now. cancelZoomMeeting() itself
     swallows the fetch on failure; this logs that failure server-side
     instead of letting it disappear silently (admin-console audit, P0/P1). */
  const TERMINAL = ['Cancelled', 'Declined', 'No-show'];
  if (before && before.meeting_id && TERMINAL.includes(status) && !TERMINAL.includes(before.status)) {
    try { await cancelZoomMeeting(before.meeting_id); }
    catch (e) { console.error('[interviews] could not cancel Zoom meeting', before.meeting_id, 'for interview', id, e); }
  }

  /* "Cancelled" is the one status either side can set on themselves — the
     copy in InterviewStatus.tsx promises the other person will be told,
     which used to mean nothing happened at all. The person who cancelled it
     already knows; only the other side needs the letter. */
  if (before && status === 'Cancelled' && before.status !== 'Cancelled') {
    try {
      const other = p.role === 'talent' ? before.client_id
                  : p.role === 'client' ? before.talent_id
                  : null; // an admin cancelling it tells both sides
      const targets = other ? [other] : [before.client_id, before.talent_id];
      for (const personId of targets) {
        const who = await personEmail(personId);
        if (!who) continue;
        const withWhom = personId === before.client_id ? before.talent_name : before.client_name;
        const theirTz = (await getAvailability(personId, 'UTC')).timezone;
        const tpl = templates.interviewCancelled({ name: who.name, withWhom, when: when(before.starts_at, theirTz) });
        await send(who.email, tpl);
      }
      /* The copy promises "we will arrange another time" — and the person
         who arranges it is the one person this used to leave out. */
      if (other) {
        const canceller = p.role === 'talent' ? before.talent_name : before.client_name;
        const withWhom = p.role === 'talent' ? before.client_name : before.talent_name;
        for (const t of await teamEmails())
          await send(t, templates.interviewNeedsRebooking({ who: canceller, withWhom, when: when(before.starts_at, null) }));
      }
    } catch { /* the status change stands whether or not the letter went out */ }
  }

  return NextResponse.json({ ok: true });
}
