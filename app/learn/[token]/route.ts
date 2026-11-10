import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { COURSE_HTML, courseVideos, gonePage, isPrefetch, trainingByToken } from '@/lib/learn';

export const dynamic = 'force-dynamic';

/* A team training, opened from the private link the console emailed.
   No session and no account: the token names one person's copy of one
   course. The page is the whole course; the server puts that person's name
   and saved progress in front of the course script. */
const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow'
};

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (isPrefetch(req)) return new NextResponse(null, { status: 204, headers: HEADERS });
  const row = await trainingByToken(token);
  const html = row ? COURSE_HTML[row.course] : null;
  if (!row || !html) return new NextResponse(gonePage(), { status: 404, headers: HEADERS });

  /* Opened and last seen, for the console. Never worth failing the page. */
  const now = new Date().toISOString();
  try {
    await adminClient().from('team_trainings')
      .update(row.opened_at ? { last_seen_at: now } : { opened_at: now, last_seen_at: now })
      .eq('id', row.id);
  } catch { /* the page still opens */ }

  const cfg = {
    t: token,
    name: row.name,
    progress: row.progress ?? {},
    completedAt: row.completed_at,
    videos: await courseVideos(row.course)
  };
  const script = `<script>window.__INSIDE=${JSON.stringify(cfg).replace(/</g, '\\u003c')};</script>`;
  return new NextResponse(html.replace('<!--INSIDE_CONFIG-->', script), { status: 200, headers: HEADERS });
}
