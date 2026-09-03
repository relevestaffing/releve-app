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
  /* PostgREST rejects an empty patch, and the error was never read — so a
     body with no recognised field reported success and changed nothing. */
  const patch: Record<string, unknown> = {};
  allowed.forEach(k => { if (k in body) patch[k] = body[k]; });
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'nothing to save' }, { status: 400 });

  try {
    await saveSelfProfile(p.id, patch);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
