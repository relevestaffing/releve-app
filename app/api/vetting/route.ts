import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import { decideVetting, personEmail, recordVetting, teamEmails, vettingFileLink } from '@/lib/work';
import { send, templates } from '@/lib/email';
import { VETTING_ITEMS } from '@/lib/work-public';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const KINDS = ['identity', 'agreement', 'nda'];

/* The browser's declared content-type is whatever the uploader's OS or a
   rename said it was, not a fact about the bytes — this is what actually
   looks at them before anything with that extension lands in the bucket. */
function looksLike(type: string, bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (type === 'application/pdf') return bytes.subarray(0, 5).toString('latin1') === '%PDF-';
  if (type === 'image/jpeg') return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  if (type === 'image/png')
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  if (type === 'image/webp')
    return bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

/* A signed, short-lived link. These are passports — nothing here is ever public. */
export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'which document?' }, { status: 400 });
  if (me.role !== 'admin' && !path.startsWith(`${me.id}/`))
    return NextResponse.json({ error: 'not yours' }, { status: 403 });
  const url = await vettingFileLink(path);
  if (!url) return NextResponse.json({ error: 'could not open that document' }, { status: 404 });
  return NextResponse.json({ url });
}

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 400 });

  const form = await req.formData();
  const file = form.get('file');
  const kind = String(form.get('kind') ?? '');
  const expires = String(form.get('expires_on') ?? '');

  /* Relève files the agreement on a candidate's behalf — they never upload it. */
  const onBehalfOf = String(form.get('talent_id') ?? '');
  const signedOn = String(form.get('signed_on') ?? '').trim();
  if (onBehalfOf && me.role !== 'admin')
    return NextResponse.json({ error: 'not permitted' }, { status: 403 });
  const owner = onBehalfOf || me.id;
  const byTeam = Boolean(onBehalfOf);
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'unknown document type' }, { status: 400 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'no file received' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'that file is over 10MB' }, { status: 413 });
  if (!OK_TYPES.includes(file.type))
    return NextResponse.json({ error: 'send a PDF or a photo' }, { status: 415 });

  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1];
  const path = `${owner}/${kind}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLike(file.type, bytes))
    return NextResponse.json({ error: 'that file does not look like a PDF or a photo — try saving it again and re-uploading' }, { status: 415 });

  const sb = await supabaseServer();
  const { error } = await sb.storage.from('vetting')
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await recordVetting({
      talent_id: owner, kind, file_path: path,
      file_name: (file as File).name ?? `${kind}.${ext}`,
      expires_on: expires || null,
      issued_by_team: byTeam,
      signed_on: signedOn || null,
      /* A filed agreement counts as verified only when somebody states the
         date on the signature. Without that, "verified" meant a file of the
         right type had landed in a bucket. */
      verified: byTeam && !!signedOn
    } as any);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/* Relève's verdict. The database refuses this from anyone else. */
export async function PATCH(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  const b = await req.json();
  if (!b.id || !['verified', 'rejected'].includes(b.verdict))
    return NextResponse.json({ error: 'verified or rejected?' }, { status: 400 });
  try {
    await decideVetting(b.id, b.verdict, me.id,
      { reason: b.reason, note: b.note, expires_on: b.expires_on });

    if (b.talent_id) {
      const who = await personEmail(b.talent_id);
      if (who) {
        const label = VETTING_ITEMS.find(i => i.kind === b.kind)?.label ?? 'document';
        const tpl = b.verdict === 'verified'
          ? templates.vettingVerified(who.name)
          : templates.vettingRejected(who.name, label, b.reason ?? 'Please send another.');
        await send(who.email, tpl);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
