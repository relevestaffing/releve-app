/* Shared by the scheduled routes added in the October pass: the shared
   secret check, and the service-role client. A failure names nothing about
   the server's configuration in the response; the detail goes to the log. */
import { timingSafeEqual } from 'crypto';
import { serviceClient } from './experience';

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
