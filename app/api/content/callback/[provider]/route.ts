import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { currentProfile } from '@/lib/supabase/server';
import { putSetting, getSetting } from '@/lib/content';
import { metaExchange, type MetaConn } from '@/lib/social-meta';
import { linkedinExchange } from '@/lib/social-linkedin';

export const dynamic = 'force-dynamic';
const APP = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');

/* Where Meta and LinkedIn send Sage back after she approves. The tokens are
   stored where only the server can read them (content_settings 'conn:' rows). */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const u = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(`${APP()}/console/content?${q}`);
    res.cookies.set(`rel_oauth_${provider}`, '', { path: '/', maxAge: 0 });
    return res;
  };
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.redirect(`${APP()}/`);
  const jar = await cookies();
  const state = jar.get(`rel_oauth_${provider}`)?.value;
  if (!state || state !== u.searchParams.get('state')) return back(`error=${encodeURIComponent('That connection link expired. Try again.')}`);
  const code = u.searchParams.get('code');
  if (!code) return back(`error=${encodeURIComponent(u.searchParams.get('error_description') || 'The connection was cancelled.')}`);
  const redirect = `${APP()}/api/content/callback/${provider}`;
  try {
    if (provider === 'meta') {
      const { pages, user_name } = await metaExchange(code, redirect);
      if (!pages.length) return back(`error=${encodeURIComponent('Meta returned no Facebook pages. Choose the Relève pages when Facebook asks.')}`);
      const old = await getSetting<MetaConn>('conn:meta');
      const keep = (id: string | null | undefined) => (id && pages.some(p => p.id === id) ? id : null);
      const careers = keep(old?.careers) ?? pages.find(p => /career/i.test(p.name))?.id ?? null;
      const client = keep(old?.client) ?? pages.find(p => p.id !== careers && p.ig)?.id ?? pages.find(p => p.id !== careers)?.id ?? null;
      await putSetting('conn:meta', { pages, client, careers, connected_at: new Date().toISOString(), user_name } satisfies MetaConn);
      return back('connected=meta');
    }
    if (provider === 'linkedin') {
      await putSetting('conn:linkedin', await linkedinExchange(code, redirect));
      return back('connected=linkedin');
    }
  } catch (e: any) {
    return back(`error=${encodeURIComponent(String(e?.message ?? 'The connection did not complete.').slice(0, 200))}`);
  }
  return back('');
}
