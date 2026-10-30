/* The content engine's clock (30 October 2026). Hourly at :20: posts what is
   due, sends the 7:00 AM Pacific "today's posts" email, and on Thursday from
   9:00 AM Pacific drafts the next week. The work itself runs in
   content-worker-background, which has the time a week of drafting needs. */
export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error('[cron] CRON_SECRET is not set: content not run'); return new Response('no secret', { status: 500 }); }
  const base = (process.env.URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com').replace(/\/$/, '');
  const r = await fetch(`${base}/.netlify/functions/content-worker-background`, {
    method: 'POST', headers: { 'x-cron-key': secret, 'content-type': 'application/json' }, body: JSON.stringify({ job: 'tick' })
  }).catch((e) => { console.error('[cron] content worker unreachable', e); return null; });
  console.log(`[cron] content -> ${r?.status ?? 'none'}`);
  return new Response('ok');
};
export const config = { schedule: '20 * * * *' };
