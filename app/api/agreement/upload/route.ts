import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 10 * 1024 * 1024;

/* The Client Services Agreement's manual fallback — the client-side
   mirror of IssueAgreement's "upload a signed copy" for talent. Lives
   beside app/api/agreement/docusign/route.ts rather than inside it: that
   route requires docusignClientReady(), this one is for exactly the
   opposite case, while the DocuSign Integration Key is a developer-account
   key that has not been through Go-Live and nothing sends through the API
   yet. Sage sends the agreement herself (DocuSign's own free web app, or
   any other way), gets it signed, and files the signed PDF here — same
   division of labor the talent side has always had. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 400 });

  const form = await req.formData();
  const file = form.get('file');
  const clientId = String(form.get('client_id') ?? '');
  const signedOn = String(form.get('signed_on') ?? '').trim();

  if (!clientId) return NextResponse.json({ error: 'Whose agreement?' }, { status: 400 });
  if (!signedOn) return NextResponse.json({ error: 'Date on the signature?' }, { status: 400 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'no file received' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'that file is over 10MB' }, { status: 413 });
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'send a PDF' }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length < 5 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-')
    return NextResponse.json({ error: 'That file does not look like a PDF. Try saving it again and re-uploading.' }, { status: 415 });

  const sb = await supabaseServer();
  const { data: person } = await sb.from('profiles').select('id').eq('id', clientId).maybeSingle();
  if (!person) return NextResponse.json({ error: 'Could not find that person.' }, { status: 404 });

  const path = `${clientId}/client-agreement.pdf`;
  const { error: upErr } = await sb.storage.from('agreements')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return NextResponse.json({ error: safeMessage(upErr) }, { status: 500 });

  const { error } = await sb.from('client_agreements').upsert({
    client_id: clientId, state: 'verified',
    file_path: path, file_name: (file as File).name ?? 'client-agreement.pdf',
    signed_on: signedOn, verified_at: new Date().toISOString(),
    envelope_id: null, reject_reason: null
  }, { onConflict: 'client_id' });
  if (error) return NextResponse.json({ error: safeMessage(error) }, { status: 400 });

  return NextResponse.json({ ok: true });
}
