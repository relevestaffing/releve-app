/* Shared by the scheduled routes added in the October pass: the shared
   secret check, and the service-role client. A failure names nothing about
   the server's configuration in the response; the detail goes to the log. */
import { timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* Its own copy of the service-role client. Importing it from ./experience
   pulled the signed-in session code (next/headers) into every scheduled
   function, which cannot load outside Next and crashed all of them on
   2 November 2026. Keep this file free of imports from the Next app. */
function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function cronAllowed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('x-cron-key');
  if (!secret || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cronClient() {
  const sb = serviceClient();
  if (!sb) console.error('[cron] the Supabase service key is not configured on this site');
  return sb;
}
