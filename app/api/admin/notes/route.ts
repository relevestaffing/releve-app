import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { addNote } from '@/lib/work';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  const b = await req.json();
  const body = String(b.body ?? '').trim();
  if (!b.placement_id || !body) return NextResponse.json({ error: 'nothing to note' }, { status: 400 });
  try {
    await addNote({ placement_id: b.placement_id, author_id: me.id, body, kind: b.kind });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
