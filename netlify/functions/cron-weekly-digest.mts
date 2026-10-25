/* The executive's Friday digest, sent Monday morning. One email per live
   placement with the talent's end-of-week report (hours, what was done, the
   win) and the shared daily-log highlights from the week just ended; the
   route sends nothing when there is nothing to say. 15:00 UTC is 7:00 or
   8:00 in the morning Pacific, so it is in the inbox at the start of the
   executive's week rather than in the Friday evening pile. Added 25 October
   2026. */
/* Netlify's scheduler cannot set a header, and the app's cron routes want
   the shared secret in one. This function is that caller: it wakes on its
   schedule and makes the single authenticated request. The logic stays in
   the app. Needs CRON_SECRET on the site (the same value the app checks)
   and, ideally, NEXT_PUBLIC_APP_URL; URL is Netlify's own fallback. */
async function callCron(path: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`[cron] CRON_SECRET is not set: ${path} not called`);
    return new Response('CRON_SECRET is not set', { status: 500 });
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.URL ?? 'https://app.relevestaffing.com').replace(/\/$/, '');
  let status = 0, text = '', alerted = false;
  try {
    const r = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'x-cron-key': secret, 'content-type': 'application/json' }, body: '{}'
    });
    status = r.status;
    alerted = r.headers.get('x-alerted') === '1';
    text = await r.text();
  } catch (e: any) {
    text = `The request did not complete: ${e?.message ?? e}`;
  }
  console.log(`[cron] ${path} -> ${status} ${text.slice(0, 400)}`);

  /* Any failure reaches the team by email the same day, unless the route
     already sent one itself. If the app is down entirely this cannot land
     either, and the function log above is the record. */
  if ((status < 200 || status >= 300) && !alerted) {
    try {
      await fetch(`${base}/api/billing/cron-alert`, {
        method: 'POST', headers: { 'x-cron-key': secret, 'content-type': 'application/json' },
        body: JSON.stringify({ job: path, detail: `Status ${status || 'none'}. ${text.slice(0, 1200)}` })
      });
    } catch (e: any) { console.error(`[cron] could not send the failure alert: ${e?.message ?? e}`); }
  }
  return new Response(text, { status: status || 500 });
}

export default async () => callCron('/api/cron/weekly-digest');
export const config = { schedule: '0 15 * * 1' };
