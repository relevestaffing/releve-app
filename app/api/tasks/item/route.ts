import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { personEmail } from '@/lib/work';
import { getTask, updateTaskChecked, addComment } from '@/lib/tasks-extra';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Change a task after it exists: its status, or what it says.
   -----------------------------------------------------------
   The review step lives here, not in the database, so the words stay
   honest on both sides:

   - The talent finishing a task the executive assigned sends it for review
     ("Finished, awaiting review"), and the executive is emailed. A task the
     talent added for themselves closes outright.
   - The executive (or Relève) marking a task done closes it. Accepting a
     task in review closes it and tells the talent.
   - "send_back" reopens a task in review with a note, and tells the talent.

   A refusal from row level security or the edit guard comes back as an
   error, never as a quiet { ok: true }. */
export async function PATCH(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'which task?' }, { status: 400 });

  try {
    const before = await getTask(id);
    if (!before) return NextResponse.json({ error: 'That task is not on a placement you are part of.' }, { status: 404 });
    const byName = (me.full_name ?? '').trim() || me.email;
    const assignedByOther = before.created_by !== me.id;
    const executiveSide = me.role === 'client' || me.role === 'admin';

    /* Send back: the executive's "not quite", with a note the talent reads. */
    if (b.action === 'send_back') {
      if (!executiveSide) return NextResponse.json({ error: 'Only the executive sends a task back.' }, { status: 403 });
      const note = String(b.note ?? '').trim();
      if (!note) return NextResponse.json({ error: 'Say what needs changing, in a sentence or two.' }, { status: 400 });
      const after = await updateTaskChecked(id, { status: 'in_progress', review_note: note }, me.id);
      try { await addComment(id, me.id, note, false); } catch { /* the note is on the task either way */ }
      try {
        const who = await personEmail(before.done_by ?? before.seen_by ?? before.created_by);
        const talent = await talentFor(before.placement_id);
        const to = talent?.email ?? who?.email;
        if (to) await send(to, templates.taskSentBack({ name: talent?.name ?? who?.name ?? '', by: byName, title: after.title, note }));
      } catch { /* the task is back on the list regardless */ }
      return NextResponse.json({ ok: true, task: after });
    }

    const allowed = ['title', 'detail', 'priority', 'due_on', 'status', 'done', 'due_time', 'repeat_weekly'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in b) patch[k] = b[k];
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 });

    /* Finishing: who closes it depends on who assigned it. */
    const wantsDone = patch.status === 'done' || patch.done === true;
    if (wantsDone && !executiveSide && assignedByOther && before.status !== 'review') {
      delete patch.done;
      patch.status = 'review';
    }
    if (wantsDone && executiveSide) { patch.status = 'done'; delete patch.done; patch.review_note = null; }

    const after = await updateTaskChecked(id, patch, me.id);

    if (after.status === 'review' && before.status !== 'review') {
      /* The executive hears the moment something is ready to look at. */
      try {
        const who = await personEmail(after.created_by);
        if (who?.email) await send(who.email, templates.taskReview({ name: who.name, by: byName, title: after.title }));
      } catch { /* in review is in review */ }
    } else if (!before.done && after.done) {
      if (before.status === 'review' && executiveSide) {
        /* Accepted: the talent hears it was good. */
        try {
          const talent = await talentFor(after.placement_id);
          if (talent?.email) await send(talent.email, templates.taskAccepted({ name: talent.name, by: byName, title: after.title }));
        } catch { /* done is done */ }
      } else if (assignedByOther) {
        try {
          const who = await personEmail(after.created_by);
          if (who?.email) await send(who.email, templates.taskDone({ name: who.name, by: byName, title: after.title }));
        } catch { /* done is done */ }
      }
    }
    return NextResponse.json({ ok: true, task: after });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

async function talentFor(placementId: string): Promise<{ email: string; name: string } | null> {
  const { supabaseServer } = await import('@/lib/supabase/server');
  const sb = await supabaseServer();
  const { data } = await sb.from('placements').select('talent_id').eq('id', placementId).maybeSingle();
  if (!(data as any)?.talent_id) return null;
  const who = await personEmail((data as any).talent_id);
  return who?.email ? { email: who.email, name: who.name } : null;
}
