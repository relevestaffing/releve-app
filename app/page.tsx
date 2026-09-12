import { redirect } from 'next/navigation';
import { configured, supabaseServer } from '@/lib/supabase/server';
import SignIn from '@/components/SignIn';

/* /auth/callback redirects failures here as ?error=… rather than throwing —
   a link already used, expired, or opened somewhere its one-time code was
   never issued (a different browser than the one that requested it, or an
   email scanner that "clicked" it first). Until now nothing read that back
   off the URL, so a failed sign-in looked identical to a fresh one: the
   click just silently landed back on this same page. */
export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (configured()) {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (user) redirect('/app');
  }
  const { error } = await searchParams;
  return <SignIn initialError={error} />;
}
