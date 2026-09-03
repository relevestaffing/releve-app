import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const configured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Server-side Supabase client bound to the request's cookies. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options?: any }[]) => {
          try { list.forEach((c) => store.set(c.name, c.value, c.options)); }
          catch { /* called from a Server Component — middleware refreshes instead */ }
        }
      }
    }
  );
}

export type Profile = {
  id: string; email: string; full_name: string | null;
  role: 'client' | 'talent' | 'admin';
  org_name: string | null; headline: string | null;
};

/** The signed-in person, or null. In demo mode returns whichever demo
    account you are previewing — see the switcher in the sidebar. */
export async function currentProfile(): Promise<Profile | null> {
  if (!configured()) {
    const store = await cookies();
    const as = store.get('releve_demo_role')?.value;
    if (as === 'new') {
      /* a brand-new sign-up, so the first-run flow can be walked from zero */
      const side = store.get('releve_demo_new_side')?.value;
      return { ...DEMO_NEW, role: side === 'client' ? 'client' : 'talent' };
    }
    return as === 'talent' ? DEMO_TALENT : as === 'admin' ? DEMO_ADMIN : DEMO_PROFILE;
  }
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
  return (data as Profile) ?? null;
}

export const DEMO_PROFILE: Profile = {
  id: 'demo-client', email: 'demo@relevestaffing.com', full_name: 'Elena Marsh',
  role: 'client', org_name: 'Marsh & Co.', headline: 'Executive account · demo mode'
};
/* one of the candidates already released to the demo executive, so the
   talent preview shows a real booked interview rather than an empty page */
export const DEMO_TALENT: Profile = {
  id: 't1', email: 'maria@example.com', full_name: 'Maria Elena Santos',
  role: 'talent', org_name: null, headline: 'Executive Assistant'
};
/* nobody Relève has ever heard of — no side chosen, nothing filled in */
export const DEMO_NEW: Profile = {
  id: 'demo-new', email: 'someone@example.com', full_name: null,
  role: 'talent', org_name: null, headline: null
};
export const DEMO_ADMIN: Profile = {
  id: 'demo-admin', email: 'hello@relevestaffing.com', full_name: 'Rae Lindqvist',
  role: 'admin', org_name: 'Relève', headline: 'Talent Success'
};
