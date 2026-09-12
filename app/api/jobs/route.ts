import { NextResponse } from 'next/server';
import { openPostings } from '@/lib/jobs';
import { corsHeaders, preflight } from '@/lib/cors';

/* Public. The careers page on the marketing site calls this to draw its list,
   so a role posted in the console appears on the website without anyone
   editing a file or redeploying anything.

   Only open postings are returned, and only the fields that are meant to be
   read by strangers — which is all of them, because a posting is an advert. */
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) { return preflight(req); }

export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'));
  try {
    const posts = await openPostings();
    return NextResponse.json({ posts }, {
      headers: { ...cors, 'cache-control': 'public, max-age=60, s-maxage=60' }
    });
  } catch {
    /* An empty list is the right failure: the careers page then shows its
       "nothing open right now" state instead of a broken section. */
    return NextResponse.json({ posts: [] }, { status: 200, headers: cors });
  }
}
