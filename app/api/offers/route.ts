import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { answerOffer, getOffer, makeOffer, placeFromOffer, sendOffer, withdrawOffer } from '@/lib/offer';
import { send, templates } from '@/lib/email';
import { personEmail, teamEmails } from '@/lib/work';
import { fmtDate } from '@/lib/words';
import { safeMessage } from '@/lib/errors';

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
        const answer: 'yes' | 'no' = b.answer === 'yes' ? 'yes' : 'no';
        const out = await answerOffer(String(b.id), answer);
        /* The answer is the moment the business earns money, and nobody was
           told: not Relève, not the other side. Now the team hears every
           answer, and both sides hear when it is agreed. Nothing here can
           undo the answer if the mail server is down. */
        try {
          const o = await getOffer(String(b.id));
          if (o) {
            const side = me.role === 'client' ? 'executive' : 'talent';
            const both = out === 'accepted';
            const who = me.role === 'client' ? (o.client_name ?? 'The executive') : (o.talent_name ?? 'The talent');
            for (const t of await teamEmails())
              await send(t, templates.offerAnswered({ who, side, answer, role: o.role_title, both }));
            if (both) {
              const on = o.starts_on;
              const [exec, talent] = await Promise.all([personEmail(o.client_id), personEmail(o.talent_id)]);
              if (exec?.email && talent)
                await send(exec.email, templates.offerAgreed({ name: exec.name, withWhom: talent.full, role: o.role_title, startsOn: on }));
              if (talent?.email && exec)
                await send(talent.email, templates.offerAgreed({ name: talent.name, withWhom: exec.full, role: o.role_title, startsOn: on }));
            }
          }
        } catch { /* the answer stands */ }
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
              await send(p.email, tpl);
            }
          }
        }
        return NextResponse.json({ ok: true, offer: o });
      }
      case 'send': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await sendOffer(String(b.id));
        /* "Send" used to flip the state and tell nobody, while the console
           toasted "Sent to both sides". Same letter the make-and-send path
           already sends. */
        const o = await getOffer(String(b.id));
        let mailed = 0;
        if (o) {
          for (const who of [o.client_id, o.talent_id]) {
            const p = await personEmail(who);
            if (p?.email) {
              const ok = await send(p.email, templates.offerMade(
                (p.name ?? '').split(' ')[0] || 'there', o.role_title, o.starts_on));
              if (ok) mailed++;
            }
          }
        }
        return NextResponse.json({ ok: true, mailed });
      }

      case 'withdraw':
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        await withdrawOffer(String(b.id), b.reason);
        return NextResponse.json({ ok: true });

      case 'place': {
        if (!team) return NextResponse.json({ error: 'Relève team only' }, { status: 403 });
        const offer = await getOffer(String(b.id));
        const pid = await placeFromOffer(String(b.id));

        /* This used to tell nobody — an accepted offer became a real
           placement in silence, and the two-week onboarding plan sat in an
           account neither side had been pointed at. Same letter the hand-made
           placement path already sends. */
        if (offer) {
          try {
            const on = fmtDate(offer.starts_on);
            const [exec, talent] = await Promise.all([
              personEmail(offer.client_id), personEmail(offer.talent_id)
            ]);
            if (exec?.email && talent) {
              await send(exec.email, templates.placementStarted({
                name: exec.name, withWhom: talent.full, startsOn: on, side: 'client' }));
            }
            if (talent?.email && exec) {
              await send(talent.email, templates.placementStarted({
                name: talent.name, withWhom: exec.full, startsOn: on, side: 'talent' }));
            }
          } catch { /* the placement stands whether or not the mail went */ }
        }

        return NextResponse.json({ ok: true, placement_id: pid });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
