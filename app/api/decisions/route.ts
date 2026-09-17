import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { setDecision, teamEmails, personEmail } from '@/lib/work';
import { send, templates } from '@/lib/email';
import { safeMessage } from '@/lib/errors';

/* An executive's yes or no on the candidate in front of them.
   -----------------------------------------------------------
   Written by the executive from their own account — or, since a high-touch
   agency hears most answers on a call, by Relève on their behalf with the
   executive named in the body and the team member recorded against the row.
   Either way the team is told, approval and decline alike: a decline is what
   brings the next person forward, and it only does that if somebody hears. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (me.role !== 'client' && me.role !== 'admin')
    return NextResponse.json({ error: 'executives only' }, { status: 403 });
  if (!b.talent_id || !b.state) return NextResponse.json({ error: 'missing a decision' }, { status: 400 });

  const onBehalf = me.role === 'admin';
  const clientId = onBehalf ? String(b.client_id ?? '') : me.id;
  if (!clientId) return NextResponse.json({ error: 'which executive?' }, { status: 400 });

  try {
    await setDecision({
      client_id: clientId, talent_id: b.talent_id, state: b.state,
      reason: b.reason, note: b.note, recorded_by: onBehalf ? me.id : null
    });

    /* Relève hears both answers. Not when Relève wrote it down themselves. */
    if (!onBehalf && (b.state === 'shortlisted' || b.state === 'passed')) {
      try {
        const who = me.full_name ?? me.email;
        const cand = await personEmail(String(b.talent_id));
        const candidate = cand?.full ?? 'the candidate';
        for (const addr of await teamEmails()) {
          const tpl = b.state === 'shortlisted'
            ? templates.shortlisted({ name: 'there', who, candidate })
            : templates.candidateDeclined({ name: 'there', who, candidate, reason: b.reason ?? null, note: b.note ?? null });
          await send(addr, tpl);
        }
      } catch { /* the decision stands */ }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
