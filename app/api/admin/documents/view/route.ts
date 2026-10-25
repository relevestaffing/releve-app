import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { getDocument } from '@/lib/documents';

export const dynamic = 'force-dynamic';

/* Opens one file through a one-minute signed link. The bucket is private,
   so this route is the only door, and it checks the person at it. */
export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: 'no storage in preview mode' }, { status: 404 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const doc = await getDocument(id);
  if (!doc) return NextResponse.json({ error: 'no such file' }, { status: 404 });
  const sb = await supabaseServer();
  const { data, error } = await sb.storage.from('documents').createSignedUrl(doc.file_path, 60, { download: doc.name });
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'no such file' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'cache-control': 'private, no-store' } });
}
