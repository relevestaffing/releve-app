import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* The service-role client, for the handful of server-side writes that no
   signed-in session may make for itself: the email log, the application rate
   limiter, a stranger's job application, a webhook. It bypasses row level
   security entirely, so it is only ever constructed on the server and only
   ever used for a narrow, already-validated write.

   Supabase renamed this key over time. Older projects call it the
   service_role key; newer ones issue an sb_secret_... key. Any of the three
   names works. */
export function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? process.env.SUPABASE_SECRET_KEY
      ?? process.env.SUPABASE_SERVICE_KEY;
}

export function hasServiceKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && serviceKey());
}

/** Throws when the server has no service key. Never import from client code. */
export function adminClient(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('adminClient is server-only.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceKey();
  if (!url || !key) throw new Error('Server is missing its Supabase service key.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Every Relève admin's address, read with the service role, so it works the
    same from an anonymous request (an applicant, a webhook) as from a
    signed-in one. Empty list on any failure: telling the team is never worth
    failing the request that triggered it. */
export async function teamEmailsAdmin(): Promise<string[]> {
  if (!hasServiceKey()) return [];
  try {
    const { data, error } = await adminClient()
      .from('profiles').select('email').eq('role', 'admin');
    if (error) { console.error('[teamEmailsAdmin]', error.message); return []; }
    return ((data ?? []) as { email: string | null }[])
      .map(r => r.email).filter((e): e is string => Boolean(e));
  } catch (e) {
    console.error('[teamEmailsAdmin]', e);
    return [];
  }
}
