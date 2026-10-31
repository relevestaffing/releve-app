import { tick, draftWeek, previewWeek, redraftPost, getPost, publishDue, putSetting, weekStart, exportForVA } from '../../lib/content';

/* The content engine's worker (30 October 2026). Netlify runs a
   "-background" function for up to 15 minutes and answers its caller at once,
   which is what drafting a week with Claude and posting to three networks
   need. Called by cron-content (hourly) and by the Content tab's buttons,
   always with the shared CRON_SECRET. */
export default async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('x-cron-key') !== secret) return new Response('not permitted', { status: 401 });
  const b: any = await req.json().catch(() => ({}));
  try {
    switch (b.job) {
      case 'draft_week': {
        const monday = typeof b.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.week) ? b.week : weekStart(new Date(), 1);
        await putSetting(`draft:${monday}`, { status: 'drafting', at: new Date().toISOString() });
        try {
          const made = await draftWeek(monday);
          await putSetting(`draft:${monday}`, { status: 'done', at: new Date().toISOString(), made: made.length });
          if (made.length) await previewWeek(monday);
        } catch (e: any) {
          await putSetting(`draft:${monday}`, { status: 'failed', at: new Date().toISOString(), error: String(e?.message ?? e).slice(0, 300) });
          throw e;
        }
        break;
      }
      case 'redraft': {
        const post = await getPost(String(b.id ?? ''));
        if (post) await redraftPost(post);
        break;
      }
      case 'va_export': {
        const monday = typeof b.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.week) ? b.week : weekStart(new Date(), 1);
        console.log('[content] va', JSON.stringify(await exportForVA(monday, true)));
        break;
      }
      case 'publish_due':
        console.log('[content] publish', JSON.stringify(await publishDue()));
        break;
      default:
        console.log('[content] tick', JSON.stringify(await tick()));
    }
  } catch (e: any) {
    console.error('[content] worker failed:', e?.message ?? e);
  }
  return new Response('done');
};
