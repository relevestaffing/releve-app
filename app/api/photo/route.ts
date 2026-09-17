import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import { saveSelfProfile, getSelfProfile } from '@/lib/store';
import { looksLike } from '@/lib/filetype';

export const dynamic = 'force-dynamic';

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024;   // the browser already shrank it; this is the backstop

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('photo');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'no photo received' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'that photo is too large' }, { status: 413 });
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'that file is not an image' }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  /* The bytes, not the browser's word for them — this route then writes
     everything as image/jpeg regardless, so an unchecked file would be stored
     and served under a type it never was. */
  if (!looksLike('image', bytes))
    return NextResponse.json({ error: 'that file is not an image' }, { status: 415 });

  /* Demo mode has no storage behind it — keep the photo inline so the
     walkthrough still works end to end on a laptop with no database. */
  if (!configured()) {
    const url = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    await saveSelfProfile(me.id, { photo_url: url });
    return NextResponse.json({ url });
  }

  const sb = await supabaseServer();
  const path = `${me.id}/photo.jpg`;
  const { error } = await sb.storage.from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* Not a public URL. The bucket is private, so what we store is a pointer at
     our own route, which checks who is asking before minting a short-lived
     link. The timestamp is a cache-buster, or the browser keeps showing the
     photo they just replaced. */
  const url = `/api/photo/view?u=${me.id}&v=${Date.now()}`;
  await saveSelfProfile(me.id, { photo_url: url });
  return NextResponse.json({ url });
}

export async function DELETE() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  if (configured()) {
    const sb = await supabaseServer();
    await sb.storage.from(BUCKET).remove([`${me.id}/photo.jpg`]);
  }
  const self = await getSelfProfile(me.id);
  if (self) await saveSelfProfile(me.id, { photo_url: null });
  return NextResponse.json({ ok: true });
}
