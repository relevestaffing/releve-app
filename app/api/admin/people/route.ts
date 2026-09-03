import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { createPerson, listPending } from '@/lib/store';
import { send, templates } from '@/lib/email';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (configured() && p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}
export async function GET() {
  const g = await guard(); if (g.error) return g.error;
  return NextResponse.json(await listPending());
}
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const body = await req.json();
  if (!body.email || !body.full_name)
    return NextResponse.json({ error: 'A name and an email are required.' }, { status: 400 });
  try {
    const made = await createPerson(body);

    /* Tell them they exist. Until now nobody was ever told. */
    const first = String(body.full_name ?? '').split(' ')[0] ?? '';
    const tpl = body.role === 'client' ? templates.clientInvite(first) : templates.talentInvite(first);
    const sent = await send(body.email, tpl.subject, { text: tpl.text, html: tpl.html });

    return NextResponse.json({ ok: true, ...made, emailed: sent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
