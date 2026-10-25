import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { recordDocument, removeDocument } from '@/lib/documents';
import { DOC_MAX_BYTES, DOC_TYPES } from '@/lib/documents-public';
import { looksLike } from '@/lib/filetype';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'Relève team only' }, { status: 403 }) };
  return { p };
}

/* Upload one file onto a person or a placement. Same discipline as every
   other upload route: the bytes are checked, not the browser's label. */
export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  if (!configured()) return NextResponse.json({ error: 'no storage in preview mode' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const kind = String(form?.get('owner_kind') ?? '');
  const ownerId = String(form?.get('owner_id') ?? '');
  const label = String(form?.get('label') ?? '').trim().slice(0, 120) || null;
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!['person', 'placement'].includes(kind) || !UUID.test(ownerId))
    return NextResponse.json({ error: 'Which record is this for?' }, { status: 400 });
  {
    const sbCheck = await supabaseServer();
    const table = kind === 'person' ? 'profiles' : 'placements';
    const { data: hit } = await sbCheck.from(table).select('id').eq('id', ownerId).maybeSingle();
    if (!hit) return NextResponse.json({ error: 'That record does not exist.' }, { status: 404 });
  }
  if (file.size > DOC_MAX_BYTES) return NextResponse.json({ error: 'That file is over 25MB.' }, { status: 413 });
  if (!DOC_TYPES.includes(file.type))
    return NextResponse.json({ error: 'Send a PDF, a Word file, or a photo (JPG, PNG or WEBP).' }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const real = file.type.startsWith('image/') ? looksLike('image', bytes) : looksLike('document', bytes);
  if (!real) return NextResponse.json({ error: 'That file does not look like what it says it is.' }, { status: 415 });

  const safeName = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
  const path = `${kind}/${ownerId}/${Date.now()}-${safeName}`;
  const sb = await supabaseServer();
  const { error } = await sb.storage.from('documents').upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 500 });

  try {
    const id = await recordDocument({
      owner_kind: kind as any, owner_id: ownerId, name: safeName, label,
      file_path: path, mime: file.type, bytes: file.size, uploaded_by: g.p.id
    });
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    await sb.storage.from('documents').remove([path]).catch(() => null);
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Which file?' }, { status: 400 });
  try { await removeDocument(String(id)); return NextResponse.json({ ok: true }); }
  catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
}
