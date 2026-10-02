import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Who is on the Relève team, managed from the console. Owner-only, and the
   owner check fails closed: anything other than a clear "yes, owner" from
   is_owner() is a refusal (S14). The database enforces the same rules again
   inside team_promote / team_set_role / team_remove / team_cancel_invite and
   the triggers in PART 39, including "never leave Relève without an owner".

   POST   add someone. A new email becomes a pending admin, promoted the first
          time they sign in with it. An email that already has a Relève
          account is promoted straight away, but only once the owner has
          confirmed that is what they meant (confirm_existing).
   PATCH  change someone's team role.
   DELETE remove someone's console access, or withdraw an unused invitation. */

const ROLES = ['owner', 'manager', 'client_success', 'talent_success'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownerOnly() {
  const me = await currentProfile();
  if (!me || me.role !== 'admin')
    return { error: NextResponse.json({ error: 'Relève team only' }, { status: 403 }) } as const;
  if (!configured()) return { me, sb: null } as const;
  const sb = await supabaseServer();
  const { data: owner, error } = await sb.rpc('is_owner');
  if (error || owner !== true)
    return { error: NextResponse.json({ error: 'Only an owner can manage the team.' }, { status: 403 }) } as const;
  return { me, sb } as const;
}

export async function POST(req: Request) {
  const gate = await ownerOnly();
  if ('error' in gate) return gate.error;
  const { sb } = gate;

  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase().slice(0, 200);
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const teamRole = ['manager', 'client_success', 'talent_success'].includes(b.team_role)
    ? String(b.team_role) : 'manager';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  if (!sb) return NextResponse.json({ ok: true, mode: 'invited' });

  const { data: existing } = await sb.from('profiles')
    .select('id, role, full_name').ilike('email', email.replace(/[%_\\]/g, m => '\\' + m)).limit(1).maybeSingle();

  if (existing) {
    if ((existing as any).role === 'admin')
      return NextResponse.json({ error: 'That person is already on the Relève team.' }, { status: 409 });
    if (b.confirm_existing !== true) {
      return NextResponse.json({
        needsConfirm: true,
        name: (existing as any).full_name ?? null,
        side: (existing as any).role === 'client' ? 'executive' : 'talent',
        error: 'That email already has a Relève account.'
      }, { status: 409 });
    }
    const { error } = await sb.rpc('team_promote', { p_email: email, p_team_role: teamRole });
    if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
    return NextResponse.json({ ok: true, mode: 'promoted' });
  }

  if (name.length < 2)
    return NextResponse.json({ error: 'Please give their name.' }, { status: 400 });

  const { error } = await sb.from('pending_people')
    .upsert({ email, role: 'admin', full_name: name, team_role: teamRole, stage: 'Active' },
            { onConflict: 'email' });
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
  return NextResponse.json({ ok: true, mode: 'invited' });
}

export async function PATCH(req: Request) {
  const gate = await ownerOnly();
  if ('error' in gate) return gate.error;
  const { sb } = gate;

  const b = await req.json().catch(() => ({}));
  const userId = String(b.user_id ?? '');
  const teamRole = String(b.team_role ?? '');
  if (!UUID.test(userId) && sb) return NextResponse.json({ error: 'Which person?' }, { status: 400 });
  if (!(ROLES as readonly string[]).includes(teamRole))
    return NextResponse.json({ error: 'That is not a team role.' }, { status: 400 });
  if (!sb) return NextResponse.json({ ok: true });

  const { error } = await sb.rpc('team_set_role', { p_user: userId, p_team_role: teamRole });
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const gate = await ownerOnly();
  if ('error' in gate) return gate.error;
  const { sb, me } = gate;

  const b = await req.json().catch(() => ({}));
  const userId = b.user_id ? String(b.user_id) : '';
  const inviteId = b.invite_id ? String(b.invite_id) : '';
  if (!userId && !inviteId) return NextResponse.json({ error: 'Which person?' }, { status: 400 });
  if (!sb) return NextResponse.json({ ok: true });

  if (inviteId) {
    if (!UUID.test(inviteId)) return NextResponse.json({ error: 'Which invitation?' }, { status: 400 });
    const { error } = await sb.rpc('team_cancel_invite', { p_id: inviteId });
    if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (!UUID.test(userId)) return NextResponse.json({ error: 'Which person?' }, { status: 400 });
  const { error } = await sb.rpc('team_remove', { p_user: userId });
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
  return NextResponse.json({ ok: true, self: userId === me.id });
}
