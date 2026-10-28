/* Reading and writing business audits. Console reads and writes go through the
   signed-in session (row level security, team only). The public audit page is
   the one exception: it reads a single row by its unguessable token with the
   service role, because the prospect who opens the link has no account. */

import { randomBytes } from 'crypto';
import { configured, supabaseServer } from './supabase/server';
import { adminClient, hasServiceKey } from './supabase/admin';
import type { Audit, AuditInputs } from './audits-public';

export * from './audits-public';

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

/* Demo fixtures so preview mode shows the feature alive. */
const DEMO_AUDITS: Audit[] = [
  {
    id: 'demo-audit-1', prospect_id: 'demo-prospect-1',
    title: 'Business VA Audit: Northwind Studio',
    inputs: { plan: 'starter_then_essential', elivate: true } as AuditInputs,
    content: '# Business VA Audit: Northwind Studio\n\n## Executive summary\n\nA sample audit shown in preview mode.',
    status: 'draft', view_token: 'demo-token', created_by: 'demo-admin',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), sent_at: null
  }
];

export async function listAudits(prospectId: string): Promise<Audit[]> {
  if (!configured()) return DEMO_AUDITS.filter(a => a.prospect_id === prospectId);
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from('lead_audits').select('*')
      .eq('prospect_id', prospectId).order('created_at', { ascending: false });
    return (data ?? []) as Audit[];
  } catch { return []; }
}

export async function getAudit(id: string): Promise<Audit | null> {
  if (!configured()) return DEMO_AUDITS.find(a => a.id === id) ?? null;
  const sb = await supabaseServer();
  const { data } = await sb.from('lead_audits').select('*').eq('id', id).maybeSingle();
  return (data as Audit) ?? null;
}

export async function createAudit(row: {
  prospectId: string; title: string; inputs: AuditInputs; content: string; createdBy?: string;
}): Promise<{ id: string; token: string }> {
  const sb = await supabaseServer();
  const token = newToken();
  const { data, error } = await sb.from('lead_audits').insert({
    prospect_id: row.prospectId, title: row.title, inputs: row.inputs,
    content: row.content, view_token: token, created_by: row.createdBy ?? null
  }).select('id').single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, token };
}

export async function updateAudit(id: string, patch: { title?: string; content?: string }) {
  const sb = await supabaseServer();
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.content !== undefined) row.content = patch.content;
  if (!Object.keys(row).length) return;
  const { error } = await sb.from('lead_audits').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAuditSent(id: string) {
  const sb = await supabaseServer();
  const { error } = await sb.from('lead_audits')
    .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* For the public branded page. Returns the audit plus the few prospect fields
   the page shows. Service role, because the reader has no session. Null when
   the token matches nothing. */
export type PublicAudit = { title: string; content: string; company: string | null; status: string };
export async function getAuditByToken(token: string): Promise<PublicAudit | null> {
  if (!hasServiceKey()) return null;
  try {
    const sb = adminClient();
    const { data } = await sb.from('lead_audits')
      .select('title, content, status, prospect:prospect_id(org_name)')
      .eq('view_token', token).maybeSingle();
    if (!data) return null;
    const company = (data as any).prospect?.org_name ?? null;
    return { title: (data as any).title, content: (data as any).content, company, status: (data as any).status };
  } catch { return null; }
}
