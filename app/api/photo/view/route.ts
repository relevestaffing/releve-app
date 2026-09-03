import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/* Photos are in a private bucket now, so there is no lasting public link to
   anyone's face. Every <img> points here instead. This checks who is asking,
   mints a link that dies in a minute, and redirects to it.

   The cost is one redirect per photo. The benefit is that a link copied out of
   the page stops working almost immediately, and a deleted account's photo
   stops being reachable at all. */
export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const who = new URL(req.url).searchParams.get('u');
  if (!who || !/^[0-9a-f-]{36}$/i.test(who))
    return NextResponse.json({ error: 'no such photo' }, { status: 400 });

  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 404 });

  const sb = await supabaseServer();

  /* Row level security decides this too — the storage policy allows the owner,
     the Relève team, and people who share a placement or a released match. The
     check here is so a refusal reads as 404 rather than a broken image. */
  const { data, error } = await sb.storage.from('avatars')
    .createSignedUrl(`${who}/photo.jpg`, 60);

  if (error || !data?.signedUrl)
    return NextResponse.json({ error: 'no such photo' }, { status: 404 });

  /* 302, not 301: the signed link changes every time and must never be
     cached by the browser as permanent. */
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'cache-control': 'private, max-age=50' }
  });
}
