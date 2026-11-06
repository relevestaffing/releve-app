import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { getCampaign, updateCampaign, sendTest, sendCampaign, draftUpcoming, writeDraft, mailingAddress } from '@/lib/campaigns';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

const nodash = (s: unknown, max: number) => String(s ?? '').replace(/[–—]/g, ', ').trim().slice(0, max);

export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === 'draft_next') {
      const made = await draftUpcoming(new Date(), true);
      return NextResponse.json({ ok: true, made });
    }
    const c = b.id ? await getCampaign(b.id) : null;
    if (!c) return NextResponse.json({ error: 'Which email?' }, { status: 400 });
    const locked = c.status === 'sent' || c.status === 'sending';

    switch (b.action) {
      case 'hold':
        if (locked) return NextResponse.json({ error: 'This email has already gone out.' }, { status: 409 });
        await updateCampaign(c.id, { status: 'held', hold_reason: 'Held by the team.' } as any);
        break;
      case 'resume':
        if (locked) return NextResponse.json({ error: 'This email has already gone out.' }, { status: 409 });
        if (!mailingAddress()) return NextResponse.json({ error: 'Add the mailing address (CAMPAIGN_MAILING_ADDRESS in Netlify) first. The law requires it in every marketing email.' }, { status: 409 });
        await updateCampaign(c.id, { status: 'scheduled', hold_reason: null } as any);
        /* Past its time already? Send it now rather than wait an hour. */
        if (new Date(c.send_at).getTime() <= Date.now()) {
          const r: any = await sendCampaign({ ...c, status: 'scheduled' });
          if (r?.done && r.total > 0 && r.delivered === 0) return NextResponse.json({ error: 'The mail host refused every send. The email is marked failed; check the Resend dashboard and press Send on schedule to try again.' }, { status: 502 });
          if (r?.busy) return NextResponse.json({ ok: true, note: 'It is already sending.' });
        }
        break;
      case 'cancel':
        if (locked) return NextResponse.json({ error: 'This email has already gone out.' }, { status: 409 });
        await updateCampaign(c.id, { status: 'cancelled' } as any);
        break;
      case 'edit': {
        if (locked) return NextResponse.json({ error: 'This email has already gone out.' }, { status: 409 });
        const paragraphs = (Array.isArray(b.paragraphs) ? b.paragraphs : String(b.body ?? '').split(/\n\s*\n/))
          .map((p: unknown) => nodash(p, 2000)).filter(Boolean);
        if (!nodash(b.subject, 90) || !paragraphs.length) return NextResponse.json({ error: 'A subject and some text are needed.' }, { status: 400 });
        await updateCampaign(c.id, {
          subject: nodash(b.subject, 90), preheader: nodash(b.preheader, 140), paragraphs,
          cta_label: nodash(b.cta_label, 40) || c.cta_label, written_by: 'team'
        } as any);
        break;
      }
      case 'redraft': {
        if (locked) return NextResponse.json({ error: 'This email has already gone out.' }, { status: 409 });
        const { data: recent } = await adminClient().from('campaigns').select('subject').order('send_at', { ascending: false }).limit(10);
        const day = new Date(c.send_at).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long' }) === 'Thursday' ? 'Thursday' : 'Tuesday';
        const d = await writeDraft(day, (recent ?? []).map((r: any) => r.subject), Math.floor(Math.random() * 100));
        await updateCampaign(c.id, { subject: d.subject, preheader: d.preheader, paragraphs: d.paragraphs, cta_label: d.cta_label, cta_url: d.cta_url, topic: d.topic, written_by: 'claude',
          ...(d.notes?.length ? { status: 'held', hold_reason: `The editor found: ${d.notes.join(' | ')}`.slice(0, 500) } : {}) } as any);
        break;
      }
      case 'test': {
        const to = String(b.to || g.p!.email || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ error: 'Which address should the test go to?' }, { status: 400 });
        const ok = await sendTest(c, to);
        if (!ok) return NextResponse.json({ error: 'The test could not be sent.' }, { status: 502 });
        return NextResponse.json({ ok: true, to });
      }
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, campaign: await getCampaign(c.id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Something went wrong.' }, { status: 500 });
  }
}
