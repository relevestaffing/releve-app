import { supabaseServer, configured } from './supabase/server';
import type { Doc, OwnerKind } from './documents-public';

export async function listDocuments(kind: OwnerKind, ownerId: string): Promise<Doc[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('documents').select('*')
    .eq('owner_kind', kind).eq('owner_id', ownerId)
    .order('uploaded_at', { ascending: false });
  return (data ?? []) as Doc[];
}

export async function recordDocument(row: Omit<Doc, 'id' | 'uploaded_at'>): Promise<string> {
  const sb = await supabaseServer();
  const { data, error } = await sb.from('documents').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return (data as any).id;
}

export async function getDocument(id: string): Promise<Doc | null> {
  const sb = await supabaseServer();
  const { data } = await sb.from('documents').select('*').eq('id', id).maybeSingle();
  return (data as Doc) ?? null;
}

export async function removeDocument(id: string) {
  const sb = await supabaseServer();
  const doc = await getDocument(id);
  if (!doc) return;
  await sb.storage.from('documents').remove([doc.file_path]);
  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
