import { NextResponse } from 'next/server';
import { configured, supabaseServer } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  if (configured()) {
    const sb = await supabaseServer();
    /* Signing out on a shared machine must also stop its push notifications:
       remove every subscription bound to this person before the session ends. */
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (user && hasServiceKey()) await adminClient().from('push_subscriptions').delete().eq('user_id', user.id);
    } catch { /* best-effort */ }
    await sb.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
