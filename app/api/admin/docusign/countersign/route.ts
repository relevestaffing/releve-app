import { NextResponse } from 'next/server';
import { currentProfile, supabaseServer, configured } from '@/lib/supabase/server';
import { companySigner, embeddedSigningUrl } from '@/lib/docusign';
import { safeMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

/* Sage's half of both agreement flows. Whoever signed first (talent or
   client) already has an envelope sitting at routing order 2, waiting on
   the Company role — this looks up that envelope from whichever table
   'kind' points at and opens the same embedded view for her. If it is not
   actually her turn yet (the other side has not signed), DocuSign's own
   refusal comes back through safeMessage rather than this route trying to
   detect that itself. */
export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me || me.role !== 'admin') return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: 'no storage in demo mode' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind ?? '');
  const id = String(b.id ?? '');
  if (kind !== 'talent' && kind !== 'client')
    return NextResponse.json({ error: 'kind must be "talent" or "client"' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'Whose agreement?' }, { status: 400 });

  const sb = await supabaseServer();
  let row: any = null;
  if (kind === 'talent') {
    const { data } = await sb.from('vetting')
      .select('envelope_id, state').eq('talent_id', id).eq('kind', 'agreement').maybeSingle();
    row = data;
  } else {
    const { data } = await sb.from('client_agreements')
      .select('envelope_id, state').eq('client_id', id).maybeSingle();
    row = data;
  }

  if (!row || !row.envelope_id)
    return NextResponse.json({ error: 'No agreement has been sent for that person yet.' }, { status: 404 });
  if (row.state === 'verified')
    return NextResponse.json({ error: 'That agreement is already fully signed.' }, { status: 400 });

  try {
    const company = companySigner();
    const returnUrl = `${SITE}/console/${kind === 'talent' ? 'vetting' : 'people'}?countersigned=1`;
    const url = await embeddedSigningUrl({
      envelopeId: row.envelope_id, name: company.name, email: company.email,
      clientUserId: company.clientUserId, returnUrl
    });
    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
