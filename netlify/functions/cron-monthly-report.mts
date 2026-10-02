/* The executive's monthly report, on the 1st at 9am Pacific (16:00 UTC; 8am
   during standard time). The route builds last month's report per live
   placement and claims each send, so a re-run never sends twice. Needs
   CRON_SECRET and, ideally, NEXT_PUBLIC_APP_URL. */
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

export default async () => callCron('/api/cron/monthly-report');
export const config = { schedule: '0 16 1 * *' };
