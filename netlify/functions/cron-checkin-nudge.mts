/* The Friday check-in nudge. Runs twice on Friday so it lands in the
   morning for the Philippines (02:00 UTC = 10:00 Manila) and again for
   Latin America (14:00 UTC = 09:00 Bogotá); the route never emails the
   same person twice in a week, so two firings mean one letter each. */
/* Netlify's scheduler cannot set a header, and the app's cron routes want
   the shared secret in one. This function is that caller: it wakes on its
   schedule and makes the single authenticated request. The logic stays in
   the app. Needs CRON_SECRET on the site (the same value the app checks)
   and, ideally, NEXT_PUBLIC_APP_URL; URL is Netlify's own fallback. */
async function callCron(path: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`[cron] CRON_SECRET is not set — ${path} not called`);
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

export default async () => callCron('/api/cron/checkin-nudge');
export const config = { schedule: '0 2,14 * * 5' };
