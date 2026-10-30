import { NextResponse } from 'next/server';
import { currentProfile } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import {
  getPost, updatePost, kick, draftWeek, redraftPost, putSetting, getSetting, publishDue, weekStart, getGroups
} from '@/lib/content';
import { isManual, type ContentPost, type Slide } from '@/lib/content-model';
import { pageAccess } from '@/lib/social-linkedin';
import type { MetaConn } from '@/lib/social-meta';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

async function guard() {
  const p = await currentProfile();
  if (!p) return { error: NextResponse.json({ error: 'not signed in' }, { status: 401 }) };
  if (p.role !== 'admin') return { error: NextResponse.json({ error: 'not permitted' }, { status: 403 }) };
  return { p };
}

const nodash = (s: unknown, max: number) => String(s ?? '').replace(/[–—]/g, ', ').trim().slice(0, max);

/* Where a post goes back to when it is released from a hold. */
function readyStatus(p: ContentPost): ContentPost['status'] {
  if (p.channel === 'li_personal') return p.image_path ? 'scheduled' : 'needs_image';
  if (p.format === 'video' && p.channel !== 'li_group') {
    if (!p.video_path) return 'needs_video';
    return p.channel === 'li_page_client' && !pageAccess() ? 'manual' : 'scheduled';
  }
  if (p.channel === 'li_group') return 'manual';
  if (isManual(p.channel) && !pageAccess()) return 'manual';
  return 'scheduled';
}

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const g = await guard(); if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case 'draft_week': {
        const week = /^\d{4}-\d{2}-\d{2}$/.test(String(b.week)) ? String(b.week) : weekStart(new Date(), 1);
        await putSetting(`draft:${week}`, { status: 'drafting', at: new Date().toISOString() });
        if (await kick('draft_week', { week })) return ok({ queued: true });
        const made = await draftWeek(week);                     // no worker (local dev): do it here
        await putSetting(`draft:${week}`, { status: 'done', at: new Date().toISOString() });
        return ok({ made: made.length });
      }
      case 'groups': {
        const list = (Array.isArray(b.list) ? b.list : []).slice(0, 4).map((x: any) => ({
          name: nodash(x?.name, 80), url: /^https:\/\/(www\.)?linkedin\.com\//i.test(String(x?.url ?? '').trim()) ? String(x.url).trim().slice(0, 300) : ''
        }));
        await putSetting('groups', { list });
        return ok({ groups: await getGroups() });
      }
      case 'style': {
        const ch = String(b.channel ?? '');
        if (!['li_personal', 'li_group', 'ig_client', 'ig_careers'].includes(ch)) return bad('Which account?');
        await putSetting(`style:${ch}`, { text: String(b.text ?? '').slice(0, 6000) });
        return ok();
      }
      case 'map_meta': {
        const meta = await getSetting<MetaConn>('conn:meta');
        if (!meta) return bad('Connect Instagram and Facebook first.');
        const valid = (id: unknown) => (typeof id === 'string' && meta.pages.some(p => p.id === id) ? id : null);
        await putSetting('conn:meta', { ...meta, client: valid(b.client), careers: valid(b.careers) });
        return ok();
      }
      case 'disconnect': {
        if (b.provider !== 'meta' && b.provider !== 'linkedin') return bad('Which account?');
        await adminClient().from('content_settings').delete().eq('key', `conn:${b.provider}`);
        return ok();
      }
    }

    const post = b.id ? await getPost(String(b.id)) : null;
    if (!post) return bad('Which post?');
    const done = post.status === 'posted' || post.status === 'publishing';

    switch (b.action) {
      case 'hold':
        if (done) return bad('This one has already gone out.', 409);
        await updatePost(post.id, { status: 'held', hold_reason: 'Held by the team.' } as any);
        break;
      case 'resume':
        if (done) return bad('This one has already gone out.', 409);
        await updatePost(post.id, { status: readyStatus(post), hold_reason: null, error: null } as any);
        break;
      case 'skip':
        if (done) return bad('This one has already gone out.', 409);
        await updatePost(post.id, { status: 'skipped' } as any);
        break;
      case 'edit': {
        if (done) return bad('This one has already gone out.', 409);
        const patch: any = { written_by: 'team' };
        if ('caption' in b) patch.caption = nodash(b.caption, 3000);
        if ('caption_fb' in b) patch.caption_fb = nodash(b.caption_fb, 2000) || null;
        if ('hook' in b) patch.hook = nodash(b.hook, 300);
        if (b.card && typeof b.card === 'object') patch.card = { kicker: nodash(b.card.kicker, 40), quote: nodash(b.card.quote, 200), sub: nodash(b.card.sub, 160) || undefined };
        if (Array.isArray(b.slides)) patch.slides = (b.slides as Slide[]).map(s => ({ title: nodash(s?.title, 140), body: nodash(s?.body, 420) })).filter(s => s.title).slice(0, 10);
        if (b.script && typeof b.script === 'object') patch.script = {
          hook: nodash(b.script.hook, 300), close: nodash(b.script.close, 400),
          beats: (b.script.beats ?? []).map((x: unknown) => nodash(x, 500)).filter(Boolean).slice(0, 8),
          onscreen: (b.script.onscreen ?? []).map((x: unknown) => nodash(x, 120)).filter(Boolean).slice(0, 6)
        };
        if (!patch.caption && 'caption' in b) return bad('The post needs some words.');
        await updatePost(post.id, patch);
        break;
      }
      case 'redraft':
        if (done) return bad('This one has already gone out.', 409);
        if (!(await kick('redraft', { id: post.id }))) await redraftPost(post);
        return ok({ queued: true });
      case 'set_image': {
        const path = String(b.path ?? '');
        if (!path.startsWith(`${post.id}/`)) return bad('That picture did not upload.');
        const next = { ...post, image_path: path };
        await updatePost(post.id, { image_path: path, status: post.status === 'held' || done ? post.status : readyStatus(next) } as any);
        break;
      }
      case 'set_video': {
        const path = String(b.path ?? '');
        if (!path.startsWith(`${post.id}/`)) return bad('That video did not upload.');
        /* The video lives on the group post; its Instagram and LinkedIn page
           copies pick it up and become ready to post. */
        const root = post.parent_id ? await getPost(post.parent_id) : post;
        if (!root) return bad('Which post?');
        await updatePost(root.id, { video_path: path } as any);
        const { data: kids } = await adminClient().from('content_posts').select('*').eq('parent_id', root.id).eq('format', 'video');
        for (const k of (kids ?? []) as ContentPost[]) {
          const next = { ...k, video_path: path };
          await updatePost(k.id, { video_path: path, status: k.status === 'needs_video' ? readyStatus(next) : k.status } as any);
        }
        break;
      }
      case 'group_tick': {
        const i = Number(b.i);
        if (!Number.isInteger(i) || i < 0 || i > 3) return bad('Which group?');
        const groups = { ...(post.results?.groups ?? {}) };
        if (b.on) groups[i] = new Date().toISOString(); else delete groups[i];
        const wanted = (await getGroups()).filter(x => x.name || x.url).length || 4;
        const all = Object.keys(groups).length >= wanted;
        await updatePost(post.id, { results: { ...post.results, groups }, status: all ? 'posted' : 'manual', posted_at: all ? new Date().toISOString() : null } as any);
        break;
      }
      case 'mark_posted':
        await updatePost(post.id, { status: 'posted', posted_at: new Date().toISOString(), error: null } as any);
        break;
      case 'retry':
      case 'post_now': {
        if (post.status === 'posted') return bad('This one has already gone out.', 409);
        if (post.channel === 'li_personal' && !post.image_path) return bad('Add your picture first.');
        await updatePost(post.id, { status: 'scheduled', error: null, hold_reason: null, ...(b.action === 'post_now' || Date.now() - new Date(post.publish_at).getTime() > 30 * 3600000 ? { publish_at: new Date().toISOString() } : {}) } as any);
        if (!(await kick('publish_due'))) await publishDue();
        return ok({ queued: true });
      }
      default:
        return bad('Unknown action.');
    }
    return ok({ post: await getPost(post.id) });
  } catch (e: any) {
    return bad(e?.message ?? 'Something went wrong.', 500);
  }
}
