import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { recordAcceptance, TERMS_VERSION } from '@/lib/money';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/* Records that this person accepted the Terms and the Privacy Policy, tied to
   the version of the text they were shown. The address and browser are kept
   as evidence of the click, nothing else — no analytics, no profiling.

   An executive additionally types their name, which is stored as the
   signature. It is not a substitute for the services agreement a lawyer will
   draft — but it is considerably better evidence than a tick, and it gives
   that agreement somewhere to land when it exists. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'sign in first' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  if (b.version && b.version !== TERMS_VERSION)
    return NextResponse.json({ error: 'Those terms are out of date — please reload.' }, { status: 409 });

  /* An executive signs their name; talent tick, because they sign a separate
     agreement during vetting. Checked here rather than only in the browser —
     a gate enforced by the page it guards is not a gate. */
  let signed: string | null = null;
  if (me.role === 'client') {
    signed = String(b.signed_name ?? '').trim().replace(/\s+/g, ' ');
    if (signed.length < 3)
      return NextResponse.json({ error: 'Please type your full name as your signature.' }, { status: 400 });
    const onFile = String(me.full_name ?? '').trim().replace(/\s+/g, ' ');
    if (onFile && signed.toLowerCase() !== onFile.toLowerCase())
      return NextResponse.json({
        error: `that does not match the name on the account (${onFile}) — sign as yourself, or ask us to correct the name first`
      }, { status: 400 });
  }

  /* Netlify puts the real client address here; the first entry is the caller. */
  const ip = (req.headers.get('x-nf-client-connection-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]
    ?? '').trim() || null;

  try {
    await recordAcceptance({
      user_id: me.id, version: TERMS_VERSION, signed_name: signed,
      ip, user_agent: req.headers.get('user-agent')
    });
    return NextResponse.json({ ok: true, version: TERMS_VERSION });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
