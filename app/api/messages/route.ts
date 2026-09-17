import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import {
  getPlacement, listMessages, listPlacementMessages, listThreads,
  markThreadRead, personEmail, sendMessage, teamEmails
} from '@/lib/work';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';

export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const placementId = url.searchParams.get('placement');

  /* The direct line for a placement — client and talent talking to each
     other, not to Relève. Anyone else asking for it (a different client,
     a different talent) is turned away here rather than just getting an
     empty thread back from row level security. */
  if (placementId) {
    const p = await getPlacement(placementId);
    if (!p || (me.role !== 'admin' && p.client_id !== me.id && p.talent_id !== me.id))
      return NextResponse.json({ error: 'not your placement' }, { status: 403 });
    return NextResponse.json({ messages: await listPlacementMessages(placementId), placement: placementId });
  }

  const asked = url.searchParams.get('subject');
  if (me.role === 'admin' && !asked) return NextResponse.json({ threads: await listThreads() });
  const subject = me.role === 'admin' ? asked! : me.id;
  /* Opening a specific thread from the console is what marks it read —
     nothing else calls this, so a client reading their own single thread
     never touches the other side's unread count by mistake. */
  if (me.role === 'admin') await markThreadRead(subject);
  return NextResponse.json({ messages: await listMessages(subject), subject });
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json();
  /* Every other write route caps its text; this one did not, so a signed-in
     account could post an arbitrarily large body, repeatedly. */
  const body = String(b.body ?? '').trim().slice(0, 8000);
  if (!body) return NextResponse.json({ error: 'nothing to send' }, { status: 400 });
  const team = me.role === 'admin';
  const placementId = typeof b.placement_id === 'string' && b.placement_id ? b.placement_id : null;

  try {
    if (placementId) {
      const p = await getPlacement(placementId);
      if (!p || (!team && p.client_id !== me.id && p.talent_id !== me.id))
        return NextResponse.json({ error: 'not your placement' }, { status: 403 });

      /* A team member posting here is Relève stepping into the
         conversation, not one of the two sides — from_team marks that so
         the thread shows "Relève" rather than pretending to be whichever
         side happened to be signed in as admin. */
      await sendMessage({ placement_id: placementId, sender_id: me.id, body, from_team: team });

      const preview = body.length > 180 ? body.slice(0, 180) + '…' : body;
      const from = team ? 'Relève' : (me.full_name ?? me.email);
      const others = team
        ? [p.client_email, p.talent_email].filter(Boolean)
        : [me.id === p.client_id ? p.talent_email : p.client_email].filter(Boolean);
      for (const addr of others) {
        await send(addr as string, templates.newMessage({ name: 'there', from, preview, toTeam: false }));
      }
      return NextResponse.json({ ok: true });
    }

    const subject_id = team ? b.subject_id : me.id;
    if (!subject_id) return NextResponse.json({ error: 'who is this to?' }, { status: 400 });
    await sendMessage({ subject_id, sender_id: me.id, body, from_team: team });

    /* Tell somebody. A message nobody is told about is a message nobody reads. */
    const preview = body.length > 180 ? body.slice(0, 180) + '…' : body;
    if (team) {
      const who = await personEmail(subject_id);
      if (who) {
        await send(who.email,
          templates.newMessage({ name: who.name, from: 'Relève', preview, toTeam: false }));
      }
    } else {
      const from = me.full_name ?? me.email;
      for (const addr of await teamEmails()) {
        const tpl = templates.newMessage({ name: 'there', from, preview, toTeam: true });
        await send(addr, tpl);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
