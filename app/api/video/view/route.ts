import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/* Same pattern as /api/photo/view: intros live in a private bucket, so every
   <video> in the app points here instead of a storage URL. This checks who
   is asking, mints a link that dies in a minute, and redirects to it. Row
   level security decides who is allowed — the owner, the Relève team, and
   whoever the owner shares a placement or a released match with — so a
   refusal here reads as 404 rather than a broken player. */
export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const who = new URL(req.url).searchParams.get('u');
  if (!who || !/^[0-9a-f-]{36}$/i.test(who))
    return NextResponse.json({ error: 'no such video' }, { status: 400 });

  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 404 });

  const sb = await supabaseServer();
  const { data, error } = await sb.storage.from('intros')
    .createSignedUrl(`${who}/intro`, 60);

  if (error || !data?.signedUrl)
    return NextResponse.json({ error: 'no such video' }, { status: 404 });

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'cache-control': 'private, max-age=50' }
  });
}
