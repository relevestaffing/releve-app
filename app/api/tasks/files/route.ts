import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { getTask, listFilesFor } from '@/lib/tasks-extra';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Documents on a task.
   -------------------
   The executive attaches the brief, the spreadsheet, the screenshot; the
   talent attaches the finished work. The bucket is private: the server
   checks the task is on a placement the caller belongs to (getTask reads
   through row level security), stores the file under the placement and
   task, and hands out short signed links. Nothing is ever public. */
const BUCKET = 'task-files';
/* Netlify hands a function at most 6 MB of request body; a bigger file
   fails before this route runs, so the limit and the copy say 6 MB. */
const MAX_BYTES = 6 * 1024 * 1024;
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const placement = url.searchParams.get('placement');
  const id = url.searchParams.get('id');

  /* Every file on every task of a placement, for the board. */
  if (placement && uuid(placement)) {
    try { return NextResponse.json({ files: await listFilesFor(placement) }); }
    catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  /* One file: a signed link that works for a minute. */
  if (!uuid(id)) return NextResponse.json({ error: 'which file?' }, { status: 400 });
  if (!hasServiceKey()) return NextResponse.json({ error: 'Files cannot be opened right now.' }, { status: 503 });
  const { supabaseServer } = await import('@/lib/supabase/server');
  const sb = await supabaseServer();
  const { data: f } = await sb.from('task_files').select('id, task_id, file_path, file_name').eq('id', id).maybeSingle();
  if (!f) return NextResponse.json({ error: 'That file is not on a task you can see.' }, { status: 404 });
  const { data: signed, error } = await adminClient().storage.from(BUCKET)
    .createSignedUrl((f as any).file_path, 60, { download: (f as any).file_name });
  if (error || !signed?.signedUrl) return NextResponse.json({ error: 'That file could not be opened.' }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, 302);
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (!hasServiceKey()) return NextResponse.json({ error: 'Files cannot be stored right now. Write to hello@relevestaffing.com and we will arrange it.' }, { status: 503 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'no file received' }, { status: 400 });
  const taskId = String(form.get('task_id') ?? '');
  const file = form.get('file');
  if (!uuid(taskId)) return NextResponse.json({ error: 'which task?' }, { status: 400 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'no file received' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is over 6 MB. Share a link to it instead.' }, { status: 413 });

  const task = await getTask(taskId);
  if (!task) return NextResponse.json({ error: 'That task is not on a placement you are part of.' }, { status: 404 });
  if (task.done) return NextResponse.json({ error: 'This task is finished. Reopen it to add a file.' }, { status: 409 });

  const rawName = ((file as File).name || 'file').slice(0, 140);
  const safeName = rawName.replace(/[^\w.\- ()]+/g, '_');
  const path = `${task.placement_id}/${task.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = file.type || 'application/octet-stream';
  const admin = adminClient();
  const { error: up } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (up) return NextResponse.json({ error: `The upload did not finish. ${safeMessage(up)}` }, { status: 500 });
  const { data: row, error } = await admin.from('task_files')
    .insert({ task_id: task.id, uploaded_by: me.id, file_path: path, file_name: rawName, content_type: type, size_bytes: file.size })
    .select('id, task_id, uploaded_by, file_name, content_type, size_bytes, created_at').maybeSingle();
  if (error || !row) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => null);
    return NextResponse.json({ error: 'The file was not saved to the task.' }, { status: 500 });
  }
  await admin.from('tasks').update({ updated_at: new Date().toISOString() }).eq('id', task.id);
  return NextResponse.json({ ok: true, file: row });
}

export async function DELETE(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!uuid(id)) return NextResponse.json({ error: 'which file?' }, { status: 400 });
  const { supabaseServer } = await import('@/lib/supabase/server');
  const sb = await supabaseServer();
  const { data: f } = await sb.from('task_files').select('id, uploaded_by, file_path').eq('id', id).maybeSingle();
  if (!f) return NextResponse.json({ error: 'That file is not on a task you can see.' }, { status: 404 });
  if ((f as any).uploaded_by !== me.id && me.role !== 'admin')
    return NextResponse.json({ error: 'Only the person who attached a file can remove it.' }, { status: 403 });
  const admin = adminClient();
  const { error } = await admin.from('task_files').delete().eq('id', id);
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
  await admin.storage.from(BUCKET).remove([(f as any).file_path]).catch(() => null);
  return NextResponse.json({ ok: true });
}
