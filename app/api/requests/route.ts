import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getPlacement } from '@/lib/work';
import { createRequest, managerEmailsFor, updateRequest, REQUEST_KINDS, type RequestKind } from '@/lib/experience';
import { send } from '@/lib/email';
import { experienceEmails } from '@/lib/email-experience';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const ymd = (v: unknown) => {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/* An executive asks for a replacement, a pause or a quarterly review. It is
   recorded as a request the console's Care page lists with its next step, the
   assigned Client Success Manager (or the whole team) is told at once, and the
   executive gets a note confirming what happens next. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'client') return NextResponse.json({ error: 'Requests come from the executive on a placement.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind ?? '') as RequestKind;
  const meta = REQUEST_KINDS.find(k => k.key === kind);
  if (!meta) return NextResponse.json({ error: 'Which kind of request?' }, { status: 400 });
  const placementId = typeof b.placement_id === 'string' ? b.placement_id : '';
  const p = placementId ? await getPlacement(placementId) : null;
  if (!p || p.client_id !== me.id || p.ended_on)
    return NextResponse.json({ error: 'That placement is not yours, or it has ended.' }, { status: 403 });

  const pause_from = kind === 'pause' ? ymd(b.pause_from) : null;
  const pause_until = kind === 'pause' ? ymd(b.pause_until) : null;
  if (kind === 'pause' && (!pause_from || !pause_until))
    return NextResponse.json({ error: 'Tell us the first and last day you have in mind.' }, { status: 400 });
  if (pause_from && pause_until && pause_until < pause_from)
    return NextResponse.json({ error: 'The last day cannot be before the first.' }, { status: 400 });

  try {
    await createRequest({
      placement_id: placementId, client_id: me.id, kind,
      note: typeof b.note === 'string' ? b.note : null,
      preferred: kind === 'pause' && pause_from && pause_until
        ? `${pause_from} to ${pause_until}`
        : (typeof b.preferred === 'string' ? b.preferred : null),
      pause_from, pause_until
    });

    try {
      const client = (me.full_name ?? '').trim() || me.email;
      const what = meta.label.replace(/^(Book|Request) an? /, '').replace(/^./, c => c.toUpperCase());
      for (const addr of await managerEmailsFor(me.id, 'client'))
        await send(addr, experienceEmails.clientRequestTeam({
          client: p.org_name ? `${client} (${p.org_name})` : client, talent: p.talent_name,
          what, note: typeof b.note === 'string' ? b.note.slice(0, 1200) : null,
          preferred: kind === 'pause' ? `${pause_from} to ${pause_until}` : (typeof b.preferred === 'string' ? b.preferred : null),
          action: meta.teamAction
        }));
      if (me.email) await send(me.email, experienceEmails.clientRequestReceived({
        name: client.split(/\s+/)[0] || 'Hello', what: what.toLowerCase(), promise: meta.promise
      }));
    } catch { /* the request stands */ }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

/* The console moves a request along: in hand, done, or closed. */
export async function PATCH(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const state = String(b.state ?? '');
  if (!['open', 'in_hand', 'done', 'declined'].includes(state))
    return NextResponse.json({ error: 'That is not a state a request can be in.' }, { status: 400 });
  if (typeof b.id !== 'string' || !b.id) return NextResponse.json({ error: 'which request?' }, { status: 400 });
  try {
    await updateRequest(b.id, me.id, { state, outcome: typeof b.outcome === 'string' ? b.outcome : null });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
