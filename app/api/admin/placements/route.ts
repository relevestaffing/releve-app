import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { createPlacement, endPlacement } from '@/lib/work';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  const { client_id, talent_id, started_on } = await req.json();
  if (!client_id || !talent_id)
    return NextResponse.json({ error: 'pick both an executive and a talent' }, { status: 400 });
  if (client_id === talent_id)
    return NextResponse.json({ error: 'those are the same person' }, { status: 400 });
  try {
    await createPlacement(client_id, talent_id, started_on);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  const { id, ended_on } = await req.json();
  if (!id) return NextResponse.json({ error: 'which placement?' }, { status: 400 });
  try {
    await endPlacement(id, ended_on);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
