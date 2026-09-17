import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { createTask, deleteTask, listTasks, updateTask, getPlacement, personEmail } from '@/lib/work';
import { send, templates } from '@/lib/email';
import { dayLabel } from '@/lib/money-public';
import { safeMessage } from '@/lib/errors';

export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const placement = new URL(req.url).searchParams.get('placement');
  if (!placement) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
  return NextResponse.json({ tasks: await listTasks(placement) });
}

/* The other person in the placement, for the two moments they need to hear
   about: a task given to them, and a task they gave being finished. Relève
   creating or finishing something tells both sides. */
async function counterparts(placementId: string, actorId: string): Promise<{ email: string; name: string }[]> {
  const pl = await getPlacement(placementId);
  if (!pl) return [];
  const ids = [pl.client_id, pl.talent_id].filter(id => id !== actorId);
  const out: { email: string; name: string }[] = [];
  for (const id of ids) {
    const who = await personEmail(id);
    if (who?.email) out.push({ email: who.email, name: who.name });
  }
  return out;
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json();
  if (!b.placement_id) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
  const title = String(b.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'a task needs a title' }, { status: 400 });
  try {
    const task = await createTask({ ...b, title, created_by: me.id });
    /* Work handed to somebody is only handed over once they know. An
       executive (or Relève) adding a task is assigning it; a talent adding
       one is logging their own work, and the executive sees it on the board
       without a letter for every line. */
    if (me.role !== 'talent') {
      try {
        const from = me.full_name ?? me.email;
        for (const who of await counterparts(String(b.placement_id), me.id))
          await send(who.email, templates.taskAssigned({
            name: who.name, from, title, due: b.due_on ? dayLabel(String(b.due_on)) : null,
            priority: b.priority && b.priority !== 'normal' ? String(b.priority) : null }));
      } catch { /* the task stands */ }
    }
    return NextResponse.json({ ok: true, task });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: 'which task?' }, { status: 400 });
  try {
    const after = await updateTask(id, patch, me.id);
    /* Finishing a task somebody else gave you is the moment they want to
       hear about; ticking your own is not. */
    if (after && patch.done === true && after.created_by !== me.id) {
      try {
        const by = me.full_name ?? me.email;
        const who = await personEmail(after.created_by);
        if (who?.email) await send(who.email, templates.taskDone({ name: who.name, by, title: after.title }));
      } catch { /* done is done */ }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'which task?' }, { status: 400 });
  try {
    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
