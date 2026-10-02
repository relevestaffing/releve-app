/* Interview reminders, 24 hours and 1 hour before. The route decides which
   interviews are due and never sends a reminder twice, so this simply wakes
   every fifteen minutes. Netlify's scheduler cannot set a header; this
   function is the caller that adds the shared secret. Needs CRON_SECRET (the
   same value the app checks) and, ideally, NEXT_PUBLIC_APP_URL. */
async function callCron(path: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`[cron] CRON_SECRET is not set; ${path} not called`);
    return new Response('CRON_SECRET is not set', { status: 500 });
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.URL ?? 'https://app.relevestaffing.com').replace(/\/$/, '');
  const r = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'x-cron-key': secret, 'content-type': 'application/json' }, body: '{}'
  });
  const text = await r.text();
  console.log(`[cron] ${path} → ${r.status} ${text.slice(0, 400)}`);
  return new Response(text, { status: r.status });
}

export default async () => callCron('/api/cron/interview-reminders');
export const config = { schedule: '*/15 * * * *' };
