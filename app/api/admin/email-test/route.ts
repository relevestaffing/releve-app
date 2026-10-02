import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { emailReady, sendOrThrow, templates } from '@/lib/email';

export const dynamic = 'force-dynamic';

/* Does email actually work?
   ------------------------
   Twenty places in this app send mail, and every one of them calls send(),
   which swallows its errors on purpose — losing a notification is a nuisance,
   losing the request that triggered it is a bug. The cost of that choice is
   that a completely broken mail setup looked exactly like a working one, which
   is how an applicant was approved and never told. Every attempt is now written
   to email_log as well, so the console can say so without anybody pressing
   this button — but this is still the only place that reports the mail host's
   own words.

   This is the one place that does not swallow. It reports what the server can
   see and what the mail host actually said, in the operator's own words. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin')
    return NextResponse.json({ error: 'Relève team only' }, { status: 403 });

  const seen = {
    SMTP_HOST: process.env.SMTP_HOST ?? '(unset, defaults to smtp.gmail.com)',
    SMTP_PORT: process.env.SMTP_PORT ?? '(unset, defaults to 465)',
    SMTP_USER: process.env.SMTP_USER ? 'set' : 'MISSING',
    SMTP_PASS: process.env.SMTP_PASS ? 'set' : 'MISSING',
    SMTP_FROM: process.env.SMTP_FROM ?? '(unset, falls back to SMTP_USER)'
  };

  if (!emailReady())
    return NextResponse.json({
      ok: false,
      stage: 'not configured',
      says: 'The server has no username or password for a mail host, so every email in the platform is being skipped before it is even attempted.',
      seen
    }, { status: 200 });

  const { to } = await req.json().catch(() => ({ to: null }));
  const target = String(to ?? me.email);
  const tpl = templates.emailTest(me.full_name?.split(' ')[0] ?? 'there');

  try {
    const info = await sendOrThrow(target, tpl);
    return NextResponse.json({
      ok: true, stage: 'accepted', to: target, seen,
      says: `The mail host accepted it for ${target}. If it does not arrive within a minute or two, check spam. That is a deliverability problem rather than a configuration one.`,
      response: (info as any)?.response ?? null
    });
  } catch (e: any) {
    /* Nodemailer's own words, which name the real problem far better than
       any guess: bad credentials, a refused sender, a blocked port. */
    return NextResponse.json({
      ok: false, stage: 'refused', to: target, seen,
      says: 'The mail host refused it. The exact wording below is what it said.',
      error: String(e?.message ?? e),
      code: e?.code ?? null,
      responseCode: e?.responseCode ?? null
    }, { status: 200 });
  }
}
