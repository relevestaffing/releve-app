import { NextResponse } from 'next/server';
import { configured, currentProfile, supabaseServer } from '@/lib/supabase/server';
import { markOnboarded, saveSelfProfile } from '@/lib/store';

export async function PATCH(req: Request) {
  const p = await currentProfile();
  if (!p) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json();

  if (body.onboarded) { await markOnboarded(p.id); return NextResponse.json({ ok: true }); }

  /* a person editing their own profile. Pay is deliberately not in this list —
     talent can never set what they are paid. */
  const allowed = ['full_name', 'headline', 'org_name', 'location', 'timezone', 'years_exp', 'english', 'bio', 'skills', 'photo_url'];
  const patch: Record<string, unknown> = {};
  allowed.forEach(k => { if (k in body) patch[k] = body[k]; });
  await saveSelfProfile(p.id, patch);
  return NextResponse.json({ ok: true });
}
