import { cronAllowed } from '../../lib/cron-auth';
import { createClient } from '@supabase/supabase-js';
import { runTurn, type StudioKind } from '../../lib/studio-core';

/* Runs one Audit Studio or 90-Day Plan Studio turn in the background.
   A reply from Claude, with a whole document in it, takes longer than a web
   request may run, so the console files the message and asks this function
   to answer it. Netlify runs a "-background" function for up to 15 minutes
   and replies 202 at once; the page polls the row until it is idle again.
   Called only by /api/admin/studio, with the shared CRON_SECRET. */
export default async (req: Request) => {
  if (!cronAllowed(req)) return new Response('not permitted', { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const kind = String(body?.kind ?? '') as StudioKind;
  const id = String(body?.id ?? '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if ((kind !== 'audit' && kind !== 'plan') || !id || !url || !key) return new Response('missing', { status: 400 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await runTurn(sb, kind, id);
  return new Response('done');
};
