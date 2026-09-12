import { configured, supabaseServer } from '@/lib/supabase/server';
import type { JobPost, JobApplication, ApplicationState } from '@/lib/jobs-public';
export * from '@/lib/jobs-public';

/* ---------- postings ---------- */

/** Everything, including drafts. Team only — RLS enforces it, not this. */
export async function listPostings(): Promise<JobPost[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('job_posts').select('*')
    .order('sort', { ascending: true }).order('created_at', { ascending: false });
  return (data ?? []) as JobPost[];
}

/** What the world sees. Readable without signing in — the policy says so. */
export async function openPostings(): Promise<JobPost[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('job_posts').select('*').eq('state', 'open')
    .order('sort', { ascending: true }).order('created_at', { ascending: false });
  return (data ?? []) as JobPost[];
}

export async function getPosting(id: string): Promise<JobPost | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('job_posts').select('*').eq('id', id).maybeSingle();
  return (data as JobPost) ?? null;
}

export async function savePosting(row: Partial<JobPost> & { title: string; slug: string }) {
  const sb = await supabaseServer();
  const { data, error } = await sb.from('job_posts')
    .upsert(row, { onConflict: 'id' }).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id as string | undefined;
}

export async function deletePosting(id: string) {
  const sb = await supabaseServer();
  const { error } = await sb.from('job_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* A slug has to be unique, and two roles called "Executive Assistant" is the
   normal case rather than the odd one. Append -2, -3 until it is free. */
export async function freeSlug(base: string, ignoreId?: string): Promise<string> {
  if (!configured()) return base;
  const sb = await supabaseServer();
  const { data } = await sb.from('job_posts').select('id, slug').like('slug', `${base}%`);
  const taken = new Set((data ?? [])
    .filter((r: any) => r.id !== ignoreId).map((r: any) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 60; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now()}`;
}

/* ---------- applications ---------- */

export async function listApplications(): Promise<JobApplication[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('job_applications')
    .select('*, post:post_id(title, slug)')
    .order('created_at', { ascending: false });
  return (data ?? []) as JobApplication[];
}

/** Everyone who applied to one posting — the posting's own file, not the
    team-wide queue. Same shape as listApplications, just narrowed. */
export async function listApplicationsForPost(postId: string): Promise<JobApplication[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('job_applications')
    .select('*, post:post_id(title, slug)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });
  return (data ?? []) as JobApplication[];
}

/* The screening call. It hangs off the application rather than the interviews
   table, because the person it is with does not exist as a user yet. */
export async function setCall(id: string, patch: {
  call_state?: 'none' | 'invited' | 'held' | 'no_show';
  call_at?: string | null;
  call_url?: string | null;
  call_id?: string | null;
  call_notes?: string | null;
  call_sent_at?: string | null;
  state?: ApplicationState;
}) {
  const sb = await supabaseServer();
  const { error } = await sb.from('job_applications').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getApplication(id: string): Promise<JobApplication | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('job_applications')
    .select('*, post:post_id(title, slug)').eq('id', id).maybeSingle();
  return (data as JobApplication) ?? null;
}

export async function setApplicationState(
  id: string, state: ApplicationState, teamNote?: string | null
) {
  const sb = await supabaseServer();
  const patch: Record<string, unknown> = { state, decided_at: new Date().toISOString() };
  if (teamNote !== undefined) patch.team_note = teamNote;
  const { error } = await sb.from('job_applications').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Links the application to the unclaimed talent record it produced. Null
    when the applicant already had an account and none needed making. */
export async function markInvited(id: string, pendingId: string | null) {
  const sb = await supabaseServer();
  const { error } = await sb.from('job_applications')
    .update({ state: 'invited', invited_id: pendingId, decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** A short-lived link to a resume. Team only — the bucket is private. */
export async function resumeLink(path: string): Promise<string | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.storage.from('applications').createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}

