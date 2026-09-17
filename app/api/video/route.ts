import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import { saveSelfProfile, getSelfProfile } from '@/lib/store';
import { looksLike } from '@/lib/filetype';

export const dynamic = 'force-dynamic';

const BUCKET = 'intros';
const MAX_BYTES = 40 * 1024 * 1024;   // a phone-shot thirty-to-sixty-second clip fits well inside this

/* Talent's own introduction, in their own voice, uploaded once and shown to
   whichever executive they are released to. Unlike a photo there is no safe
   way to re-encode video in the browser, so this stores whatever they send —
   capped in size, checked for a video mime type, nothing more. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('video');
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'no video received' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `That video is over ${MAX_BYTES / (1024 * 1024)}MB. Trim it down and try again.` }, { status: 413 });
  if (!file.type.startsWith('video/')) return NextResponse.json({ error: 'That file isn’t a video.' }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  /* Checked for real, like the photo and the vetting upload. This one is
     shown to an executive, so a file that is not a video is a file nobody
     asked for sitting in front of a paying client. */
  if (!looksLike('video', bytes))
    return NextResponse.json({ error: 'That file isn’t a video.' }, { status: 415 });

  /* Demo mode has no storage behind it — same fallback pattern as the photo
     route, so the walkthrough still works with no database. */
  if (!configured()) {
    const url = `data:${file.type};base64,${bytes.toString('base64')}`;
    await saveSelfProfile(me.id, { intro_video_url: url });
    return NextResponse.json({ url });
  }

  const sb = await supabaseServer();
  const path = `${me.id}/intro`;
  const { error } = await sb.storage.from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true, cacheControl: '3600' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* Not a public URL — same reasoning as the photo route: the bucket is
     private, so what we store is a pointer at our own route, which checks
     who is asking before minting a short-lived link. */
  const url = `/api/video/view?u=${me.id}&v=${Date.now()}`;
  await saveSelfProfile(me.id, { intro_video_url: url });
  return NextResponse.json({ url });
}

export async function DELETE() {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  if (configured()) {
    const sb = await supabaseServer();
    await sb.storage.from(BUCKET).remove([`${me.id}/intro`]);
  }
  const self = await getSelfProfile(me.id);
  if (self) await saveSelfProfile(me.id, { intro_video_url: null });
  return NextResponse.json({ ok: true });
}
