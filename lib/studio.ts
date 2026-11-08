/* The Audit Studio and the 90-Day Plan Studio: reading and writing their
   documents from the console. Both kinds share one shape, so one set of
   functions serves both. Console reads and writes go through the signed-in
   session (row level security, team only). The public pages are the one
   exception: they read a single row by its unguessable token with the service
   role, because the person who opens the link has no account. */

import { randomBytes } from 'crypto';
import { configured, supabaseServer } from './supabase/server';
import { adminClient, hasServiceKey } from './supabase/admin';
import { SITE } from './stripe';
import { TABLE, runTurn, type StudioKind, type ChatMsg, type EmailDraft } from './studio-core';

export type { StudioKind, ChatMsg, EmailDraft, Readiness } from './studio-core';
export { readinessFor } from './studio-core';

export type StudioDoc = {
  id: string; kind: StudioKind; owner_id: string; title: string; content: string;
  chat: ChatMsg[]; state: 'idle' | 'working' | 'error'; error: string | null;
  status: 'draft' | 'sent' | 'published'; email: EmailDraft | null; view_token: string;
  created_at: string; updated_at: string; done_at: string | null; audit_id: string | null;
};

const OWNER = { audit: 'prospect_id', plan: 'client_id' } as const;
const DONE = { audit: 'sent_at', plan: 'published_at' } as const;
/* A turn that has been "working" longer than this has died with its function. */
const STALE_MS = 9 * 60 * 1000;

export const newToken = () => randomBytes(24).toString('base64url');

function shape(kind: StudioKind, r: any): StudioDoc {
  let state = (r.state ?? 'idle') as StudioDoc['state'];
  let error = (r.error ?? null) as string | null;
  if (state === 'working' && Date.now() - new Date(r.updated_at).getTime() > STALE_MS) {
    state = 'error'; error = 'That took too long and stopped. Send it again.';
  }
  return {
    id: r.id, kind, owner_id: r[OWNER[kind]], title: r.title ?? '', content: r.content ?? '',
    chat: Array.isArray(r.chat) ? r.chat : [], state, error,
    status: r.status, email: r.email ?? null, view_token: r.view_token,
    created_at: r.created_at, updated_at: r.updated_at, done_at: r[DONE[kind]] ?? null,
    audit_id: kind === 'plan' ? (r.audit_id ?? null) : null
  };
}

export async function getStudioDoc(kind: StudioKind, id: string): Promise<StudioDoc | null> {
  if (!configured()) return null;
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from(TABLE[kind]).select('*').eq('id', id).maybeSingle();
    return data ? shape(kind, data) : null;
  } catch { return null; }
}

export async function listStudioDocs(kind: StudioKind, ownerId: string): Promise<StudioDoc[]> {
  if (!configured()) return [];
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from(TABLE[kind]).select('*').eq(OWNER[kind], ownerId).order('created_at', { ascending: false });
    return ((data ?? []) as any[]).map(r => shape(kind, r));
  } catch { return []; }
}

/* Plans for many executives at once, newest first per executive. */
export async function latestPlans(): Promise<Record<string, StudioDoc>> {
  if (!configured()) return {};
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from('success_plans').select('*').order('created_at', { ascending: false });
    const out: Record<string, StudioDoc> = {};
    for (const r of (data ?? []) as any[]) if (!out[r.client_id]) out[r.client_id] = shape('plan', r);
    return out;
  } catch { return {}; }
}

export async function createStudioDoc(kind: StudioKind, ownerId: string, o: { title: string; by?: string | null; auditId?: string | null }): Promise<string> {
  const sb = await supabaseServer();
  const row: Record<string, unknown> = {
    [OWNER[kind]]: ownerId, title: o.title, content: '', chat: [], state: 'working', view_token: newToken(), created_by: o.by ?? null
  };
  if (kind === 'plan' && o.auditId) row.audit_id = o.auditId;
  const { data, error } = await sb.from(TABLE[kind]).insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return (data as any).id as string;
}

export async function patchStudioDoc(kind: StudioKind, id: string, patch: Record<string, unknown>) {
  const sb = await supabaseServer();
  const { error } = await sb.from(TABLE[kind]).update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/* File the team member's message and mark the row as being worked on. */
export async function queueUserMessage(kind: StudioKind, doc: StudioDoc, text: string | null) {
  const chat = text ? [...doc.chat, { role: 'user', text, at: new Date().toISOString() } as ChatMsg] : doc.chat;
  await patchStudioDoc(kind, doc.id, { chat, state: 'working', error: null });
}

/* Ask the background function to write Claude's turn. Without it (local dev,
   or no CRON_SECRET), the turn is written here instead. */
export async function kickTurn(kind: StudioKind, id: string): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.URL ?? SITE).replace(/\/$/, '');
  const secret = process.env.CRON_SECRET;
  const kick = secret ? await fetch(`${base}/.netlify/functions/studio-turn-background`, {
    method: 'POST', headers: { 'x-cron-key': secret, 'content-type': 'application/json' }, body: JSON.stringify({ kind, id })
  }).catch(() => null) : null;
  if (kick && kick.status < 300) return;
  await runTurn(hasServiceKey() ? adminClient() : await supabaseServer(), kind, id);
}

/* Who the document is for: the lead for an audit, the executive for a plan. */
export type Owner = { name: string; email: string | null; company: string | null };
export async function ownerOf(kind: StudioKind, ownerId: string): Promise<Owner | null> {
  if (!configured()) return null;
  try {
    const sb = await supabaseServer();
    if (kind === 'audit') {
      const { data } = await sb.from('prospects').select('full_name, email, org_name').eq('id', ownerId).maybeSingle();
      return data ? { name: (data as any).full_name, email: (data as any).email ?? null, company: (data as any).org_name ?? null } : null;
    }
    const { data } = await sb.from('profiles').select('full_name, email, org_name').eq('id', ownerId).maybeSingle();
    return data ? { name: (data as any).full_name, email: (data as any).email ?? null, company: (data as any).org_name ?? null } : null;
  } catch { return null; }
}

/* For the public pages. An audit opens as soon as it has a link; a plan opens
   only once it has been published to the client. */
export type PublicDoc = { title: string; content: string; company: string | null };
export async function getPublicDoc(kind: StudioKind, token: string): Promise<PublicDoc | null> {
  if (!hasServiceKey()) return null;
  try {
    const sb = adminClient();
    if (kind === 'audit') {
      const { data } = await sb.from('lead_audits').select('title, content, prospect:prospect_id(org_name)')
        .eq('view_token', token).maybeSingle();
      if (!data || !(data as any).content) return null;
      return { title: (data as any).title, content: (data as any).content, company: (data as any).prospect?.org_name ?? null };
    }
    const { data } = await sb.from('success_plans').select('title, content, status, client:client_id(org_name, full_name)')
      .eq('view_token', token).maybeSingle();
    if (!data || (data as any).status !== 'published' || !(data as any).content) return null;
    const c = (data as any).client;
    return { title: (data as any).title, content: (data as any).content, company: c?.org_name || c?.full_name || null };
  } catch { return null; }
}
