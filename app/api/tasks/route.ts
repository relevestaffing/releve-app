import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { createTask, deleteTask, listTasks, updateTask } from '@/lib/work';

export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const placement = new URL(req.url).searchParams.get('placement');
  if (!placement) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
  return NextResponse.json({ tasks: await listTasks(placement) });
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
    return NextResponse.json({ ok: true, task });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: 'which task?' }, { status: 400 });
  try {
    await updateTask(id, patch, me.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
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
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
