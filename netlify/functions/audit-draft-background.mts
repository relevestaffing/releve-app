import { createClient } from '@supabase/supabase-js';
import { auditDraft } from '../../lib/ai';

/* Writes one business audit in the background (QA, 30 Oct 2026).
   A full audit from Claude takes longer than a web request is allowed to
   run, so the console files an empty draft and asks this function to write
   it. Netlify runs a "-background" function for up to 15 minutes and answers
   the caller at once with 202. The console polls the draft until it fills in.
   Called only by /api/admin/audits, with the shared CRON_SECRET. */
export default async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-key') !== secret) return new Response('not permitted', { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const id = String(body?.id ?? '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!id || !url || !key) return new Response('missing', { status: 400 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: audit } = await sb.from('lead_audits').select('id, prospect_id, inputs').eq('id', id).maybeSingle();
  if (!audit) return new Response('not found', { status: 404 });
  const { _state, _error, ...inputs } = (audit.inputs ?? {}) as Record<string, any>;
  const { data: lead } = await sb.from('prospects').select('full_name, org_name, website').eq('id', audit.prospect_id).maybeSingle();

  try {
    const draft = await auditDraft({
      name: lead?.full_name ?? '', company: lead?.org_name ?? '',
      inputs: { ...(inputs as any), website: inputs.website || lead?.website || undefined }
    });
    await sb.from('lead_audits').update({ title: draft.title, content: draft.content, inputs }).eq('id', id);
  } catch (e: any) {
    console.error('[audit-draft] failed:', e?.message ?? e);
    await sb.from('lead_audits').update({
      title: 'This audit could not be written',
      inputs: { ...inputs, _state: 'error', _error: String(e?.message ?? 'The audit could not be written.').slice(0, 300) }
    }).eq('id', id);
  }
  return new Response('done');
};
