import { adminClient, hasServiceKey, teamEmailsAdmin } from './supabase/admin';
import { send, templates } from './email';
import { signinStageLabel, type SigninStage } from './signin-public';

/* Recording a failed sign-in must never be able to make the sign-in worse
   than it already is. Every path here swallows its own errors: the person in
   front of the screen has a problem, and a second problem behind the scenes
   is not theirs to carry. Service role, because at the moment this runs there
   is usually no usable session to write with. */
export async function noteSigninTrouble(o: {
  email?: string | null;
  stage: SigninStage;
  detail?: string | null;
}): Promise<void> {
  const email = o.email?.trim().toLowerCase() || null;
  const detail = o.detail ? String(o.detail).slice(0, 500) : null;

  console.error('[signin]', o.stage, email ?? '(unknown)', detail ?? '');
  if (!hasServiceKey()) return;

  try {
    const sb = adminClient();
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    /* The exchange stage fires for any junk code on an unauthenticated URL,
       so somebody looping it could fill the table and, worse, trip the
       once-an-hour rule below so that a real invitee's failure sends no
       email. Exchange failures are capped, and the hourly rule only counts
       failures that name a person. */
    if (o.stage === 'exchange') {
      const { count: junk } = await sb.from('signin_failures')
        .select('id', { count: 'exact', head: true }).eq('stage', 'exchange').gte('at', hourAgo);
      if ((junk ?? 0) >= 20) return;
    }

    const { error } = await sb.from('signin_failures')
      .insert({ email, stage: o.stage, detail });
    /* One migration behind is not a reason to throw. The console log above
       has already carried the fact. */
    if (error) { console.error('[signin-watch] could not record:', error.message); return; }

    /* One email an hour, not one per attempt. Somebody who cannot get in
       tries three or four times in a minute, and a deploy that breaks sign-in
       for everyone would otherwise bury the team in identical mail at the
       exact moment they need to read one message clearly. */
    const recent = sb.from('signin_failures').select('id', { count: 'exact', head: true }).gte('at', hourAgo);
    const { count } = email ? await recent.eq('email', email) : await recent.eq('stage', o.stage);
    if ((count ?? 0) > 1) return;

    const team = await teamEmailsAdmin();
    const msg = templates.signinTrouble({
      email, where: signinStageLabel(o.stage), detail
    });
    await Promise.all(team.map(addr => send(addr, msg)));
  } catch (e) {
    console.error('[signin-watch]', e);
  }
}
