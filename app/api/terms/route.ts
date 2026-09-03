import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { recordAcceptance, TERMS_VERSION } from '@/lib/money';

export const dynamic = 'force-dynamic';

/* Records that this person accepted the Terms and the Privacy Policy, tied to
   the version of the text they were shown. The address and browser are kept
   as evidence of the click, nothing else — no analytics, no profiling. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'sign in first' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  if (b.version && b.version !== TERMS_VERSION)
    return NextResponse.json({ error: 'those terms are out of date, please reload' }, { status: 409 });

  /* Netlify puts the real client address here; the first entry is the caller. */
  const ip = (req.headers.get('x-nf-client-connection-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]
    ?? '').trim() || null;

  try {
    await recordAcceptance({
      user_id: me.id, version: TERMS_VERSION,
      ip, user_agent: req.headers.get('user-agent')
    });
    return NextResponse.json({ ok: true, version: TERMS_VERSION });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
