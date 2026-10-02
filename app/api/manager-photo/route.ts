import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import { myManagers, serviceClient } from '@/lib/experience';

export const dynamic = 'force-dynamic';

/* The photo of the Success Manager assigned to you.
   ------------------------------------------------
   Avatars are private, and the storage policy admits only people who work
   together on a placement; a manager is not on the placement row as either
   side, so their face could not reach the client or talent they look after.
   This checks, through my_managers(), that the person asked for really is
   your assigned manager, then signs a one-minute link with the service role.
   Nobody else's photo can be fetched through here. */
export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const who = new URL(req.url).searchParams.get('u');
  if (!who || !/^[0-9a-f-]{36}$/i.test(who))
    return NextResponse.json({ error: 'no such photo' }, { status: 400 });
  if (!configured()) return NextResponse.json({ error: 'no storage in preview mode' }, { status: 404 });

  let sb: any = null;
  if (me.role === 'admin') {
    sb = await supabaseServer();
  } else {
    const mine = await myManagers(me);
    if (!mine.some(m => m.id === who)) return NextResponse.json({ error: 'no such photo' }, { status: 404 });
    sb = serviceClient();
  }
  if (!sb) return NextResponse.json({ error: 'no such photo' }, { status: 404 });

  const { data, error } = await sb.storage.from('avatars').createSignedUrl(`${who}/photo.jpg`, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'no such photo' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, {
    status: 302, headers: { 'cache-control': 'private, max-age=50' }
  });
}
