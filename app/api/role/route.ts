import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import { saveSelfProfile, getSelfProfile } from '@/lib/store';

export const dynamic = 'force-dynamic';

/* A new account picks its own side, once. After that it is fixed — moving
   someone across is a Relève decision, not a self-service toggle, or anyone
   could promote themselves into the client side of the product. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const { role } = await req.json();
  if (role !== 'client' && role !== 'talent')
    return NextResponse.json({ error: 'that is not a side' }, { status: 400 });

  if (!configured()) {
    const store = await cookies();
    /* the new-sign-up preview keeps its own identity and just records the side;
       the other demo accounts are the sidebar switcher's business */
    if (me.id === 'demo-new') store.set('releve_demo_new_side', role, { path: '/' });
    else store.set('releve_demo_role', role, { path: '/' });
    await saveSelfProfile(me.id, { role_chosen_at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  const self = await getSelfProfile(me.id);
  if ((self as any)?.role_chosen_at)
    return NextResponse.json({ error: 'your account is already set up' }, { status: 409 });

  /* An ordinary update. The trigger on profiles decides whether it is allowed —
     once, and never for an account Relève assigned a side to. */
  const sb = await supabaseServer();
  const { error } = await sb.from('profiles')
    .update({ role, role_chosen_at: new Date().toISOString() })
    .eq('id', me.id);
  if (error) {
    console.error('[role] update failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  /* read it back, so a silently-ignored update surfaces instead of looping */
  const { data: after } = await sb.from('profiles').select('role, role_chosen_at').eq('id', me.id).maybeSingle();
  if (!after?.role_chosen_at) {
    /* The technical cause stays in the server log — a brand-new user choosing
       their side for the first time should never see a schema-migration
       instruction; that is a note for whoever operates the console, not
       something they can act on. */
    console.error('[role] update was ignored — is PART 7 of schema.sql applied?');
    return NextResponse.json(
      { error: 'Your account could not be set up. Please try again, or write to hello@relevestaffing.com.' },
      { status: 500 });
  }
  return NextResponse.json({ ok: true, role: after.role });
}
