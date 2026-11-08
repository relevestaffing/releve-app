import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { savePosting, deletePosting, freeSlug, getPosting } from '@/lib/jobs';
import { slugify, postReady } from '@/lib/jobs-public';
import { safeMessage } from '@/lib/errors';
import { kick, draftHiringPost } from '@/lib/content';

export const dynamic = 'force-dynamic';

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin')
    return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));

  if (b.action === 'delete') {
    if (!b.id) return NextResponse.json({ error: 'which posting?' }, { status: 400 });
    /* The console only shows Delete on a draft — a role that has ever gone
       live keeps its row (and its URL) even once closed, because the link
       may already be out there and its applications point back to it. That
       was a UI-only rule until now: nothing stopped this same action from
       being called directly on a live or closed posting. */
    const existing = await getPosting(b.id);
    if (existing && existing.state !== 'draft')
      return NextResponse.json({
        error: 'A posting that has been live can only be closed, not deleted. Its link may already be shared, and its applications point back to it.'
      }, { status: 400 });
    try { await deletePosting(b.id); return NextResponse.json({ ok: true }); }
    catch (e: any) { return NextResponse.json({ error: safeMessage(e) }, { status: 400 }); }
  }

  const title = String(b.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'A posting needs a title.' }, { status: 400 });

  const row: Record<string, unknown> = {
    title,
    discipline: b.discipline || null,
    summary:    String(b.summary ?? '').trim(),
    about:      String(b.about ?? '').trim() || null,
    owns:       String(b.owns ?? '').trim() || null,
    needs:      String(b.needs ?? '').trim() || null,
    hours:      String(b.hours ?? '').trim() || null,
    location:   String(b.location ?? '').trim() || null,
    pay_note:   String(b.pay_note ?? '').trim() || null,
    sort:       Number.isFinite(Number(b.sort)) ? Number(b.sort) : 0
  };

  /* Publishing is the moment it becomes public, so it is the moment the
     posting has to actually be finished. A draft may be as rough as you like. */
  const state = ['draft', 'open', 'closed'].includes(b.state) ? b.state : 'draft';
  if (state === 'open') {
    const missing = postReady({ ...row, ...b } as any);
    if (missing.length)
      return NextResponse.json({ error: missing.join(' ') }, { status: 400 });
  }
  row.state = state;
  let wasOpen = false;

  if (b.id) {
    row.id = b.id;
    const existing = await getPosting(b.id);
    wasOpen = existing?.state === 'open';
    /* Keep the URL stable once a role has been live — a changed slug breaks
       every link already shared. */
    row.slug = existing?.opened_at
      ? existing.slug
      : await freeSlug(slugify(b.slug || title) || 'role', b.id);
  } else {
    row.slug = await freeSlug(slugify(b.slug || title) || 'role');
  }

  try {
    const id = await savePosting(row as any);
    /* A role going live makes its hiring post: the graphic and the words, held
       for Nona's approval (6 Nov 2026). A failure here never blocks the posting. */
    let hiring: string | undefined;
    const pid = id ?? b.id;
    if (state === 'open' && !wasOpen && pid) {
      try {
        if (await kick('hiring_post', { id: pid })) hiring = 'queued';
        else { const r = await draftHiringPost(pid, { useAI: false }); hiring = r.created ? 'made' : r.why; }
      } catch (e: any) { console.error('[hiring] could not make the hiring post:', e?.message ?? e); hiring = 'failed'; }
    }
    return NextResponse.json({ ok: true, id: pid, slug: row.slug, hiring });
  } catch (e: any) {
    return NextResponse.json({ error: safeMessage(e) }, { status: 400 });
  }
}
