import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { isOwner } from '@/lib/money';
import { getAction, finishAction, claimAction, planFor } from '@/lib/ai/actions';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* The founder's one click. A proposal is executed once, by the founder
   only, through the same handler the console button uses, and the outcome
   is written back to the log whichever way it goes. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'admin' || !(await isOwner()))
    return NextResponse.json({ error: 'Only the founder confirms the assistant’s actions.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? '');
  const decision = b.decision === 'dismiss' ? 'dismiss' : 'confirm';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which action?' }, { status: 400 });

  const row = await getAction(id);
  if (!row) return NextResponse.json({ error: 'That proposal is gone.' }, { status: 404 });
  if (row.user_id !== me.id) return NextResponse.json({ error: 'That proposal is not yours.' }, { status: 403 });
  if (row.status !== 'proposed') return NextResponse.json({ error: `Already ${row.status}.` }, { status: 409 });
  if (!(await claimAction(id))) return NextResponse.json({ error: 'That proposal is already being handled.' }, { status: 409 });

  if (decision === 'dismiss') {
    await finishAction(id, 'dismissed', null);
    return NextResponse.json({ ok: true, status: 'dismissed' });
  }
  try {
    const run = planFor(row.kind, row.params ?? {}, me.email);
    const result = await run();
    await finishAction(id, 'done', result ?? { ok: true });
    return NextResponse.json({ ok: true, status: 'done', result });
  } catch (e: any) {
    const error = safeMessage(e);
    await finishAction(id, 'failed', { error });
    return NextResponse.json({ error, status: 'failed' }, { status: 400 });
  }
}
