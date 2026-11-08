import { cronAllowed } from '../../lib/cron-auth';
import { draftHiringPost, tick, runDraft, alertAdmins, redraftPost, getPost, publishDue, putSetting, weekStart, exportForVA, writePostFromImage, rebuildLinkedInWeek, kick } from '../../lib/content';

/* The content engine's worker (30 October 2026). Netlify runs a
   "-background" function for up to 15 minutes and answers its caller at once,
   which is what drafting a week with Claude and posting to three networks
   need. Called by cron-content (hourly) and by the Content tab's buttons,
   always with the shared CRON_SECRET. */
export default async (req: Request) => {
  if (!cronAllowed(req)) return new Response('not permitted', { status: 401 });
  const b: any = await req.json().catch(() => ({}));
  try {
    switch (b.job) {
      case 'draft_week': {
        const monday = typeof b.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.week) ? b.week : weekStart(new Date(), 1);
        await runDraft(monday, Number(b.attempt) > 0 ? Number(b.attempt) : 1);
        break;
      }
      case 'redraft': {
        const post = await getPost(String(b.id ?? ''));
        if (post) await redraftPost(post);
        break;
      }
      case 'write_image': {
        const post = await getPost(String(b.id ?? ''));
        if (post) await writePostFromImage(post);
        break;
      }
      case 'linkedin_week': {
        const monday = typeof b.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.week) ? b.week : weekStart(new Date(), 1);
        const r = await rebuildLinkedInWeek(monday);
        console.log('[content] linkedin', JSON.stringify(r));
        const attempt = Number(b.attempt) > 0 ? Number(b.attempt) : 1;
        if (r.left && attempt < 4) await kick('linkedin_week', { week: monday, attempt: attempt + 1 }).catch(() => {});
        else if (r.left) await alertAdmins(`linkedin-week-${monday}`, 'Some LinkedIn briefs could not be written', `${r.left} day(s) in the week of ${monday} still carry the Instagram graphic on LinkedIn.`);
        break;
      }
      case 'va_export': {
        const monday = typeof b.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.week) ? b.week : weekStart(new Date(), 1);
        console.log('[content] va', JSON.stringify(await exportForVA(monday, true)));
        break;
      }
      case 'hiring_post':
        console.log('[content] hiring', JSON.stringify(await draftHiringPost(String(b.id ?? ''))));
        break;
      case 'publish_due':
        console.log('[content] publish', JSON.stringify(await publishDue()));
        break;
      default:
        console.log('[content] tick', JSON.stringify(await tick()));
    }
  } catch (e: any) {
    console.error('[content] worker failed:', e?.message ?? e);
    await alertAdmins(`job-${b.job ?? 'tick'}`, `A content job failed (${b.job ?? 'tick'})`, String(e?.message ?? e).slice(0, 300));
  }
  return new Response('done');
};
