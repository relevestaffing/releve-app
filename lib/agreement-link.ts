import { adminClient, hasServiceKey } from '@/lib/supabase/admin';

/* Signing the agreement from the onboarding email, before any account exists.
   ---------------------------------------------------------------------------
   The email's signed link names one search. From it we find who is signing:
   either a client account (already created) or a pending person (not yet).
   A pending person's signature is filed in storage under pending/<id>/ and
   promoted into their account the first time anything reads their agreement
   after they sign up, so nothing is lost and no database change is needed. */

export type LinkSigner = {
  searchId: string; clientId: string | null; pendingId: string | null;
  name: string; email: string; business: string | null;
};

export async function signerForSearch(searchId: string): Promise<LinkSigner | null> {
  if (!hasServiceKey()) return null;
  const { data: s } = await adminClient().from('searches')
    .select('id, client_id, pending_id, closed_at, client:client_id(full_name, email, org_name), pending:pending_id(full_name, email, org_name)')
    .eq('id', searchId).maybeSingle();
  if (!s || (s as any).closed_at) return null;
  const who = (s as any).client ?? (s as any).pending;
  if (!who) return null;
  return {
    searchId, clientId: (s as any).client_id ?? null, pendingId: (s as any).pending_id ?? null,
    name: String(who.full_name ?? '').trim(), email: String(who.email ?? ''), business: who.org_name ?? null
  };
}

const pdfPath = (pendingId: string) => `pending/${pendingId}/client-agreement.pdf`;
const notePath = (pendingId: string) => `pending/${pendingId}/signed.json`;

export async function savePendingSignature(pendingId: string, pdf: Buffer | Uint8Array, note: { name: string; at: string; version: string }) {
  const st = adminClient().storage.from('agreements');
  const a = await st.upload(pdfPath(pendingId), pdf, { contentType: 'application/pdf', upsert: true });
  if (a.error) throw new Error(a.error.message);
  const b = await st.upload(notePath(pendingId), Buffer.from(JSON.stringify(note)), { contentType: 'application/json', upsert: true });
  if (b.error) throw new Error(b.error.message);
}

export async function pendingSigned(pendingId: string): Promise<boolean> {
  if (!hasServiceKey()) return false;
  const { data } = await adminClient().storage.from('agreements').list(`pending/${pendingId}`, { limit: 10 });
  return Boolean((data ?? []).some(f => f.name === 'signed.json'));
}

/* Has whoever this search belongs to signed? */
export async function searchSigned(searchId: string): Promise<boolean> {
  const who = await signerForSearch(searchId);
  if (!who) return false;
  if (who.clientId) {
    await promotePendingAgreement(who.clientId);
    const { data } = await adminClient().from('client_agreements').select('state').eq('client_id', who.clientId).maybeSingle();
    return (data as any)?.state === 'verified';
  }
  return who.pendingId ? pendingSigned(who.pendingId) : false;
}

/* When a pending person has signed and later made their account, move the
   signed copy onto the account. Safe to call any number of times. */
export async function promotePendingAgreement(clientId: string): Promise<void> {
  if (!hasServiceKey()) return;
  try {
    const ad = adminClient();
    const { data: row } = await ad.from('client_agreements').select('state').eq('client_id', clientId).maybeSingle();
    if ((row as any)?.state === 'verified') return;
    const { data: pend } = await ad.from('pending_people').select('id').eq('claimed_by', clientId).maybeSingle();
    const pid = (pend as any)?.id as string | undefined;
    if (!pid || !(await pendingSigned(pid))) return;
    const st = ad.storage.from('agreements');
    const [pdf, note] = await Promise.all([st.download(pdfPath(pid)), st.download(notePath(pid))]);
    if (pdf.error || !pdf.data) return;
    const meta = note.data ? JSON.parse(await note.data.text()) : {};
    const dest = `${clientId}/client-agreement.pdf`;
    const up = await st.upload(dest, Buffer.from(await pdf.data.arrayBuffer()), { contentType: 'application/pdf', upsert: true });
    if (up.error) return;
    const at = meta.at ? new Date(meta.at) : new Date();
    await ad.from('client_agreements').upsert({
      client_id: clientId, state: 'verified', file_path: dest,
      file_name: 'Relève Client Services Agreement (signed).pdf',
      signed_on: at.toISOString().slice(0, 10), verified_at: at.toISOString(),
      envelope_id: null, reject_reason: null
    }, { onConflict: 'client_id' });
  } catch { /* never worth failing a page over */ }
}
