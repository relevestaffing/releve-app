import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { saveRoleBreakdown, saveSkills } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  try {
    if (b.action === 'role') {
      if (me.role !== 'client' && me.role !== 'admin')
        return NextResponse.json({ error: 'executives only' }, { status: 403 });
      await saveRoleBreakdown(b.client_id ?? me.id, b.data);
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'skills') {
      if (me.role !== 'talent' && me.role !== 'admin')
        return NextResponse.json({ error: 'talent only' }, { status: 403 });
      await saveSkills(b.talent_id ?? me.id, b.data);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
