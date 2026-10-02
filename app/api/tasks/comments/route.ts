import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getPlacement, personEmail } from '@/lib/work';
import { addComment, commentSummary, getTask, listComments, updateTaskChecked } from '@/lib/tasks-extra';
import { send } from '@/lib/email';
import { experienceEmails } from '@/lib/email-experience';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Comments on a task, and a talent's question about one. Read and written
   through the signed-in session: row level security limits both to the two
   people on the placement and Relève. */
export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const task = url.searchParams.get('task');
  const placement = url.searchParams.get('placement');
  if (task) {
    const [comments, t] = await Promise.all([listComments(task), getTask(task)]);
    /* Which side wrote each comment, so the thread can say "Relève" for the
       team without anyone's session reading another person's profile. */
    const sides: Record<string, 'client' | 'talent' | 'team'> = {};
    const p = t ? await getPlacement(t.placement_id) : null;
    for (const c of comments)
      sides[c.author_id] = p?.client_id === c.author_id ? 'client' : p?.talent_id === c.author_id ? 'talent' : 'team';
    return NextResponse.json({ comments, sides });
  }
  if (placement) {
    const p = await getPlacement(placement);
    if (!p || (me.role !== 'admin' && p.client_id !== me.id && p.talent_id !== me.id))
      return NextResponse.json({ error: 'not your placement' }, { status: 403 });
    return NextResponse.json({ summary: await commentSummary(placement) });
  }
  return NextResponse.json({ error: 'which task?' }, { status: 400 });
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const taskId = typeof b.task_id === 'string' ? b.task_id : '';
  const body = String(b.body ?? '').trim();
  const question = !!b.question;
  if (!taskId) return NextResponse.json({ error: 'which task?' }, { status: 400 });
  if (!body) return NextResponse.json({ error: 'Nothing to send.' }, { status: 400 });

  try {
    const task = await getTask(taskId);
    if (!task) return NextResponse.json({ error: 'That task is not on a placement you are part of.' }, { status: 404 });
    const comment = await addComment(taskId, me.id, body, question);

    /* A question from the talent means the work is waiting on the executive,
       and the board should say so without anyone having to remember to. */
    if (question && me.role === 'talent' && !task.done) {
      try { await updateTaskChecked(taskId, { status: 'waiting' }, me.id); } catch { /* the question stands */ }
    }

    /* The other side hears about it. Relève commenting tells both. */
    try {
      const p = await getPlacement(task.placement_id);
      if (p) {
        const others = [p.client_id, p.talent_id].filter(id => id !== me.id);
        const from = me.role === 'admin' ? 'Relève' : ((me.full_name ?? '').trim() || me.email);
        for (const id of others) {
          const who = await personEmail(id);
          if (who?.email) await send(who.email, experienceEmails.taskComment({
            name: who.name, from, title: task.title, body: body.length > 400 ? body.slice(0, 400) + '…' : body, question
          }));
        }
      }
    } catch { /* the comment stands */ }

    return NextResponse.json({ ok: true, comment });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
