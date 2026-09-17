import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const configured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* Demo mode is something you turn ON, never something that happens to you.
   ----------------------------------------------------------------------
   It used to be inferred from `!configured()` alone, which made a missing
   environment variable indistinguishable from a deliberate preview build —
   and the demo path hands out an admin profile on the strength of an
   unsigned cookie anyone can set. Next inlines NEXT_PUBLIC_* at BUILD time,
   so a production build that ran without those variables present would have
   shipped a site serving full admin to `releve_demo_role=admin`, while the
   Netlify dashboard still listed the variables as set.

   Requiring an explicit opt-in reverses the failure direction: a
   misconfigured build now signs nobody in, instead of signing everybody in
   as Relève. Set NEXT_PUBLIC_DEMO_MODE=1 on a preview deploy that is meant
   to be a walkthrough; never on app.relevestaffing.com. */
export const demoMode = () =>
  process.env.NEXT_PUBLIC_DEMO_MODE === '1' && !configured();

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
    /* No database. Without the explicit opt-in above this is a broken deploy,
       not a demo, and a broken deploy gets nobody — not an admin. */
    if (!demoMode()) return null;
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
