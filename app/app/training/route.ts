import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { ensureTraining, isPrefetch } from '@/lib/learn';
import { siteOrigin } from '@/lib/site';

export const dynamic = 'force-dynamic';

/* Working with Relève, from the talent's own account (10 November 2026).
   The checklist step and the menu link point here; it finds or makes this
   person's own copy of the training and opens it. Their progress is tracked
   on that copy, so the console's Training tab and their Onboarding status
   both show how far they have come. */
export async function GET(req: Request) {
  const base = siteOrigin(req);
  if (isPrefetch(req)) return new NextResponse(null, { status: 204 });
  const profile = await currentProfile();
  if (!profile) return NextResponse.redirect(new URL('/', base));
  if (profile.role !== 'talent') return NextResponse.redirect(new URL('/app', base));
  const row = await ensureTraining({ id: profile.id, email: profile.email, full_name: profile.full_name });
  if (!row) return NextResponse.redirect(new URL('/app?training=unavailable', base));
  return NextResponse.redirect(new URL(`/learn/${row.token}`, base));
}
