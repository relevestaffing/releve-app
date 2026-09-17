import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer } from '@/lib/supabase/server';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Add a second Relève admin from the console, so the founder is never the only
   person who can reach it. Owner-only. It creates a pending-person row with
   role='admin'; the existing claim_pending() trigger promotes them the first
   time they sign in with that email, and gives them a team_roles row. No
   database editing, no invitation dependency — the same path executives
   already come in on. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin')
    return NextResponse.json({ error: 'Relève team only' }, { status: 403 });

  const sb = await supabaseServer();

  /* Only an owner may create another admin. is_owner() keys on the caller's
     own session, so a manager-level admin cannot use this. */
  const { data: owner } = await sb.rpc('is_owner');
  if (owner === false)
    return NextResponse.json({ error: 'Only the account owner can add an admin.' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase();
  const name = String(b.name ?? '').trim().slice(0, 120);
  const teamRole = ['manager', 'client_success', 'talent_success'].includes(b.team_role)
    ? b.team_role : 'manager';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  if (name.length < 2)
    return NextResponse.json({ error: 'Please give their name.' }, { status: 400 });

  /* If they already have a Relève account, the pending path will not re-fire
     (claim_pending runs only when a profile is first created). Say so plainly
     rather than silently doing nothing. */
  const { data: existing } = await sb.from('profiles').select('id, role').eq('email', email).maybeSingle();
  if (existing) {
    if ((existing as any).role === 'admin')
      return NextResponse.json({ error: 'That person is already an admin.' }, { status: 409 });
    return NextResponse.json({
      error: 'That email already has a Relève account (as a client or talent). Promoting an existing account is not supported here yet — reach out and it can be done directly.'
    }, { status: 409 });
  }

  const { error } = await sb.from('pending_people')
    .upsert({ email, role: 'admin', full_name: name, team_role: teamRole, stage: 'Active' },
            { onConflict: 'email' });
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });

  return NextResponse.json({ ok: true });
}
