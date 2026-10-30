import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/* An executive's own signed copy: a short-lived link to the PDF filed when
   they signed. Only ever their own file. */
export async function GET(req: Request) {
  const site = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const me = await currentProfile();
  if (!me || me.role !== 'client') return NextResponse.redirect(new URL('/app', site));
  if (!configured() || !hasServiceKey()) return NextResponse.redirect(new URL('/app', site));
  const ad = adminClient();
  const { data: row } = await ad.from('client_agreements')
    .select('file_path, state').eq('client_id', me.id).maybeSingle();
  const path = (row as any)?.file_path as string | undefined;
  if (!path || (row as any)?.state !== 'verified' || !path.startsWith(`${me.id}/`))
    return NextResponse.redirect(new URL('/app', site));
  const { data } = await ad.storage.from('agreements').createSignedUrl(path, 120, { download: 'Releve-Client-Services-Agreement-signed.pdf' });
  if (!data?.signedUrl) return NextResponse.redirect(new URL('/app', site));
  return NextResponse.redirect(data.signedUrl);
}
