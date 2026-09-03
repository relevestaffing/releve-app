import { NextResponse } from 'next/server';
import { send, templates } from '@/lib/email';
import { personEmail } from '@/lib/work';
import { currentProfile } from '@/lib/supabase/server';
import { createInterview, setInterviewStatus, listInterviews, getAvailability } from '@/lib/store';
import { createZoomMeeting, zoomConfigured } from '@/lib/zoom';
import { getBench } from '@/lib/data';

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
  const { talentId, clientId, startISO, durationMin = 45, stage = 'First interview' } = await req.json();

  const cid = p.role === 'admin' ? clientId : p.id;
  const bench = await getBench();
  const talent = bench.find(t => t.id === talentId);

  let meeting = null;
  let warning: string | null = null;
  try {
    meeting = await createZoomMeeting({
      topic: `Relève interview — ${talent?.name ?? 'candidate'}`,
      startISO, durationMin, timezone: 'UTC',
      agenda: 'Introductory interview arranged by Relève Executive Staffing.'
    });
  } catch (e: any) {
    warning = e.message;                       // booking still stands; the link can be added by hand
  }
  if (!zoomConfigured()) warning = 'Zoom is not connected yet — add the meeting link manually.';

  const iv = await createInterview({
    client_id: cid, talent_id: talentId,
    client_name: p.role === 'admin' ? 'Client' : (p.full_name ?? p.email),
    talent_name: talent?.name ?? 'Candidate',
    stage, starts_at: startISO, duration_min: durationMin,
    status: 'Confirmed',                        // client self-serve: booking it confirms it
    meeting_url: meeting?.url ?? null, meeting_id: meeting?.id ?? null, notes: null
  });
  /* Confirm it to both sides, each in their own timezone. */
  const when = (tz: string | null) => new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'UTC', weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(new Date(startISO));

  for (const [personId, otherName] of [[cid, iv.talent_name], [talentId, iv.client_name]] as const) {
    const who = await personEmail(personId);
    if (!who) continue;
    const theirTz = (await getAvailability(personId, 'UTC')).timezone;
    const tpl = templates.interviewBooked({
      name: who.name, withWhom: otherName, when: when(theirTz), url: meeting?.url ?? null
    });
    await send(who.email, tpl.subject, { text: tpl.text, html: tpl.html });
  }

  return NextResponse.json({ interview: iv, warning });
}

export async function PATCH(req: Request) {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { id, status } = await req.json();
  await setInterviewStatus(id, status);
  return NextResponse.json({ ok: true });
}
