import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { currentProfile } from '@/lib/supabase/server';
import { metaAuthUrl, metaAppReady } from '@/lib/social-meta';
import { linkedinAuthUrl, linkedinAppReady } from '@/lib/social-linkedin';

export const dynamic = 'force-dynamic';
const APP = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');

/* Starts connecting Instagram/Facebook (meta) or LinkedIn. Team only. */
export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.redirect(`${APP()}/`);
  const state = randomBytes(18).toString('hex');
  const redirect = `${APP()}/api/content/callback/${provider}`;
  let url: string;
  if (provider === 'meta') {
    if (!metaAppReady()) return NextResponse.redirect(`${APP()}/console/content?setup=meta`);
    url = metaAuthUrl(redirect, state);
  } else if (provider === 'linkedin') {
    if (!linkedinAppReady()) return NextResponse.redirect(`${APP()}/console/content?setup=linkedin`);
    url = linkedinAuthUrl(redirect, state);
  } else return NextResponse.redirect(`${APP()}/console/content`);
  const res = NextResponse.redirect(url);
  res.cookies.set(`rel_oauth_${provider}`, state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
