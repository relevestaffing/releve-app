import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { personEmail } from '@/lib/work';
import { getTask, updateTaskChecked } from '@/lib/tasks-extra';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Change a task after it exists: its status (to do, in progress, waiting,
   done), or what it says. A refusal from row level security or the edit
   guard comes back as an error, never as a quiet { ok: true }. */
export async function PATCH(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'which task?' }, { status: 400 });

  const allowed = ['title', 'detail', 'priority', 'due_on', 'status', 'done'] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in b) patch[k] = b[k];
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 });

  try {
    const before = await getTask(id);
    if (!before) return NextResponse.json({ error: 'That task is not on a placement you are part of.' }, { status: 404 });
    const after = await updateTaskChecked(id, patch, me.id);

    /* Finishing a task somebody else gave you is the moment they want to
       hear about; ticking your own is not. */
    if (!before.done && after.done && after.created_by !== me.id) {
      try {
        const by = (me.full_name ?? '').trim() || me.email;
        const who = await personEmail(after.created_by);
        if (who?.email) await send(who.email, templates.taskDone({ name: who.name, by, title: after.title }));
      } catch { /* done is done */ }
    }
    return NextResponse.json({ ok: true, task: after });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
