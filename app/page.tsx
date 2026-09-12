import { redirect } from 'next/navigation';
import { configured, supabaseServer, currentProfile } from '@/lib/supabase/server';
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
  let bootError: string | null = null;

  if (configured()) {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const profile = await currentProfile();
      if (profile) redirect('/app');

      /* A session with no profile row behind it — the exact gap the auth
         callback's own check cannot fully close (its insert can succeed
         there and the row still not be visible here, or the row can fail
         to write for a reason that never reaches that check). Previously
         this page saw the session and sent them to /app; /app saw no
         profile and sent them right back here — a loop with no way out,
         which is what a talent's very first sign-in hit. So this page
         makes the row itself, once, rather than assuming the callback
         already did. */
      const { error: made } = await sb.from('profiles').insert({
        id: user.id, email: user.email,
        full_name: (user.user_metadata as any)?.full_name ?? null,
        role: 'talent'
      });
      if (!made) redirect('/app');

      /* The insert can fail here too — most likely because another
         request (the callback, or a second tab) made the row a moment
         ago, which shows up as a duplicate-key error rather than success.
         Check once more before calling it a real failure. */
      const retry = await currentProfile();
      if (retry) redirect('/app');

      bootError = 'Your account could not be set up. Please try again, or write to hello@relevestaffing.com.';
    }
  }
  const { error } = await searchParams;
  return <SignIn initialError={bootError ?? error} />;
}
