import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { setApplicationState, resumeLink, setCall, getApplication } from '@/lib/jobs';
import { createZoomMeeting, cancelZoomMeeting, zoomConfigured } from '@/lib/zoom';
import { createPerson } from '@/lib/store';
import { markInvited } from '@/lib/jobs';
import { send, templates } from '@/lib/email';
import { supabaseServer } from '@/lib/supabase/server';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin')
    return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

/* A signed link to a resume, good for a minute. The bucket is private. */
export async function GET(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'which resume?' }, { status: 400 });
  const url = await resumeLink(path);
  if (!url) return NextResponse.json({ error: 'could not open that file' }, { status: 404 });
  return NextResponse.json({ url });
}

export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: 'which application?' }, { status: 400 });

  try {
    /* ---- the screening call, before they have an account at all ---- */
    if (b.action === 'book_call' || b.action === 'move_call') {
      const app = await getApplication(b.id);
      if (!app) return NextResponse.json({ error: 'that application is gone' }, { status: 404 });
      const startISO = String(b.startISO ?? '');
      if (!startISO || Number.isNaN(Date.parse(startISO)))
        return NextResponse.json({ error: 'pick a date and a time' }, { status: 400 });
      if (Date.parse(startISO) < Date.now() - 60_000)
        return NextResponse.json({ error: 'that time is in the past' }, { status: 400 });
      const minutes = Number(b.minutes) > 0 ? Math.min(120, Number(b.minutes)) : 30;

      /* Moving a call should not leave the old meeting standing. */
      if (b.action === 'move_call' && app.call_id) {
        try { await cancelZoomMeeting(app.call_id); } catch { /* the booking still moves */ }
      }

      let meeting: { url: string; id: string } | null = null;
      let warning: string | null = null;
      try {
        meeting = await createZoomMeeting({
          topic: `Relève — a call with ${app.full_name}`,
          startISO, durationMin: minutes, timezone: 'UTC',
          agenda: `Screening call for ${(app as any).post?.title ?? 'a role'} at Relève Executive Staffing.`
        });
      } catch (e: any) { warning = e.message; }
      if (!zoomConfigured()) warning = 'Zoom is not connected, so no joining link was created. Send one by hand.';

      await setCall(b.id, {
        call_state: 'invited', call_at: startISO,
        call_url: meeting?.url ?? null, call_id: meeting?.id ?? null,
        call_sent_at: new Date().toISOString(),
        state: 'call_booked'
      });

      /* The applicant hears about it in their own timezone if they gave us
         one, and in ours if they did not — never in UTC. */
      const tz = app.timezone || 'UTC';
      const when = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      }).format(new Date(startISO));

      let mailed = false;
      try {
        const first = String(app.full_name).split(/\s+/)[0];
        const tpl = b.action === 'move_call'
          ? templates.callMoved({ name: first, when, url: meeting?.url ?? app.call_url ?? null })
          : templates.callInvite({
              name: first, role: (app as any).post?.title ?? 'the role',
              when, url: meeting?.url ?? null, minutes });
        mailed = await send(app.email, tpl);
      } catch { /* the booking stands either way */ }

      return NextResponse.json({ ok: true, mailed, warning, url: meeting?.url ?? null });
    }

    if (b.action === 'call_result') {
      if (!['held', 'no_show', 'none'].includes(b.result))
        return NextResponse.json({ error: 'unknown outcome' }, { status: 400 });
      await setCall(b.id, {
        call_state: b.result,
        call_notes: typeof b.notes === 'string' ? b.notes.slice(0, 4000) : undefined,
        state: b.result === 'held' ? 'call_held' : 'call_booked'
      });
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'invite') {
      const sb = await supabaseServer();
      const { data: app } = await sb.from('job_applications')
        .select('*, post:post_id(title)').eq('id', b.id).maybeSingle();
      if (!app) return NextResponse.json({ error: 'that application is gone' }, { status: 404 });
      const a = app as any;

      /* They become a talent record now, and only now — unless they already
         are one. A good applicant answers two postings, and pending_people
         keys on email, so creating blindly meant the second invitation died
         on a duplicate key and left the application stuck. Reuse whatever
         already exists for that address instead. */
      const email = String(a.email).toLowerCase();
      const [{ data: already }, { data: signedUp }] = await Promise.all([
        sb.from('pending_people').select('id').ilike('email', email).maybeSingle(),
        sb.from('profiles').select('id').ilike('email', email).maybeSingle()
      ]);

      let pendingId: string | null = (already as any)?.id ?? null;
      if (!pendingId && !signedUp) {
        const person = await createPerson({
          role: 'talent',
          full_name: a.full_name,
          email: a.email,
          headline: a.post?.title ?? undefined,
          timezone: a.timezone || undefined,
          location: a.location || undefined,
          years_exp: a.years ?? undefined,
          stage: 'Applied'
        });
        pendingId = person.id;
      }

      /* Someone who already has an account needs no record made for them —
         the invitation is then simply the letter. */
      await markInvited(b.id, pendingId as any);
      try {
        const tpl = templates.applicationInvited({
          name: String(a.full_name).split(/\s+/)[0],
          role: a.post?.title ?? 'the role'
        });
        await send(a.email, tpl);
      } catch { /* the record stands whether or not the mail server answered */ }
      return NextResponse.json({ ok: true });
    }

    if (!['new', 'reviewing', 'declined'].includes(b.state))
      return NextResponse.json({ error: 'unknown state' }, { status: 400 });
    await setApplicationState(b.id, b.state, b.team_note);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
