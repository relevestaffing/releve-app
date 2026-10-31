import { redirect } from 'next/navigation';
import Shell from '@/components/Shell';
import ContentDesk from '@/components/ContentDesk';
import { currentProfile } from '@/lib/supabase/server';
import {
  listWeek, getGroups, getSetting, imageUrl, pdfUrl, mediaUrl, imageCount, tablesReady, weekStart
} from '@/lib/content';
import { metaAppReady, type MetaConn } from '@/lib/social-meta';
import { linkedinAppReady, pageAccess, type LinkedInConn } from '@/lib/social-linkedin';
import { dayLabel, whenLabel } from '@/lib/content-model';

export const metadata = { title: 'Content' };
export const dynamic = 'force-dynamic';

/* The week of Relève content: what Claude drafted, what posts itself, and
   what needs a person today (30 October 2026). */
export default async function Content({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');
  const sp = await searchParams;

  const thisWeek = weekStart(new Date());
  const week = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? '') ? sp.week! : thisWeek;
  const shift = (w: string, d: number) => { const t = new Date(`${w}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

  const ready = await tablesReady();
  const [posts, groups, meta, li, draftNext, style, va] = ready
    ? await Promise.all([
        listWeek(week), getGroups(),
        getSetting<MetaConn>('conn:meta'), getSetting<LinkedInConn>('conn:linkedin'),
        getSetting<{ status: string; at: string; error?: string }>(`draft:${weekStart(new Date(), 1)}`),
        getSetting<{ text: string }>('style:li_personal'),
        getSetting<{ status: string; at: string; error?: string; files?: number }>(`va:${week}`)
      ])
    : [[], [], null, null, null, null, null];

  const rows = posts.map(p => ({
    ...p,
    when: whenLabel(p.publish_at), day: dayLabel(p.publish_at),
    images: Array.from({ length: imageCount(p) }, (_, i) => imageUrl(p.id, i, 'png')),
    pdf: p.format === 'carousel' && imageCount(p) ? pdfUrl(p.id) : null,
    imageSrc: p.image_path ? mediaUrl(p.image_path) : null,
    videoSrc: p.video_path ? mediaUrl(p.video_path) : null
  }));

  return (
    <Shell profile={profile} active="/console/content" title="Content" crumb="Every account, every week">
      <ContentDesk
        week={week} thisWeek={thisWeek} prevWeek={shift(week, -7)} nextWeek={shift(week, 7)}
        posts={rows as any} groups={groups}
        meta={meta ? { pages: meta.pages.map(p => ({ id: p.id, name: p.name, ig: p.ig?.username ?? null })), client: meta.client, careers: meta.careers, user: meta.user_name ?? null } : null}
        linkedin={li ? { name: li.name, expires_at: li.expires_at, pages: li.scopes.includes('w_organization_social') } : null}
        setup={{ ready, metaApp: metaAppReady(), linkedinApp: linkedinAppReady(), pageAccess: pageAccess(), ai: Boolean(process.env.ANTHROPIC_API_KEY) }}
        draftNext={draftNext}
        sageStyle={style?.text ?? ''}
        va={va ? { ...va, when: new Date(va.at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT' } : null}
        liDays={li ? Math.floor((new Date(li.expires_at).getTime() - Date.now()) / 86400000) : null}
        today={dayLabel(new Date().toISOString())}
        flash={{ connected: sp.connected ?? null, error: sp.error ?? null, setup: sp.setup ?? null }}
      />
    </Shell>
  );
}
