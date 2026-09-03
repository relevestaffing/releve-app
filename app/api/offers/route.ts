import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { answerOffer, makeOffer, placeFromOffer, sendOffer, withdrawOffer } from '@/lib/offer';
import { send, templates } from '@/lib/email';
import { personEmail } from '@/lib/work';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? '');
  const team = me.role === 'admin';

  try {
    switch (action) {
      /* ---- either side answering their own offer ---- */
      case 'answer': {
        const out = await answerOffer(String(b.id), b.answer === 'yes' ? 'yes' : 'no');
        return NextResponse.json({ ok: true, result: out });
      }

      /* ---- everything else is Relève ---- */
      case 'make': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        if (!b.role_title || !b.starts_on)
          return NextResponse.json({ error: 'a role and a start date, at minimum' }, { status: 400 });
        const o = await makeOffer(b);
        if (b.send && o) {
          /* Tell both sides. An offer nobody hears about is a draft. */
          for (const who of [o.client_id, o.talent_id]) {
            const p = await personEmail(who);
            if (p?.email) {
              const tpl = templates.offerMade(
                (p.name ?? '').split(' ')[0] || 'there', o.role_title, o.starts_on);
              await send(p.email, tpl.subject, { text: tpl.text, html: tpl.html });
            }
          }
        }
        return NextResponse.json({ ok: true, offer: o });
      }
      case 'send':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await sendOffer(String(b.id));
        return NextResponse.json({ ok: true });

      case 'withdraw':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await withdrawOffer(String(b.id), b.reason);
        return NextResponse.json({ ok: true });

      case 'place': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        const pid = await placeFromOffer(String(b.id));
        return NextResponse.json({ ok: true, placement_id: pid });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
