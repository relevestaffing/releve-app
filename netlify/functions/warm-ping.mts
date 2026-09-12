/* Netlify's zero-config Next.js Runtime runs the whole app behind one
   shared serverless function. With real traffic still thin, that function
   idles out between visits — and whoever opens the app next pays for the
   cold start themselves, waiting several seconds for a plain page. This
   pings a trivial route (app/api/health, no database call) every ten
   minutes so the function mostly stays warm instead of going cold between
   opens. NEXT_PUBLIC_APP_URL is preferred so this always pings the real
   custom domain rather than Netlify's own *.netlify.app URL, which runs a
   separate (and separately cold) function instance. */
export default async () => {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.URL ?? 'https://app.relevestaffing.com').replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/api/health`);
    console.log(`[warm] ${base}/api/health → ${r.status}`);
  } catch (e: any) {
    console.error(`[warm] ping failed: ${e.message}`);
  }
  return new Response('ok');
};
export const config = { schedule: '*/10 * * * *' };
