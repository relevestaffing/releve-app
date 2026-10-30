import { NextResponse } from 'next/server';
import { cleanToken, unsubscribeByToken, resubscribeByToken } from '@/lib/subscribers';

export const dynamic = 'force-dynamic';

/* POST /api/unsubscribe?t=TOKEN
   Two callers:
   1. Mail apps' one-tap Unsubscribe button (RFC 8058): they POST to the URL in
      the List-Unsubscribe header with the body "List-Unsubscribe=One-Click".
   2. The /unsubscribe page's button, which also sends {"action":"resubscribe"}
      when someone changes their mind.
   GET is deliberately not an unsubscribe: link scanners in corporate inboxes
   open every link in an email, and a GET that unsubscribed would remove
   people who never clicked. GET just sends them to the page. */

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') || '';
  return NextResponse.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(t)}`, req.url), 303);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let action = 'unsubscribe';
  let bodyToken: unknown = null;
  const type = req.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) {
      const j = await req.json();
      bodyToken = j?.t;
      if (j?.action === 'resubscribe') action = 'resubscribe';
    }
  } catch { /* one-click posts are form-encoded; the token is in the URL */ }

  const token = cleanToken(url.searchParams.get('t') ?? bodyToken);
  if (!token) return NextResponse.json({ error: 'That link is not complete.' }, { status: 400 });

  if (action === 'resubscribe') {
    const ok = await resubscribeByToken(token);
    return ok ? NextResponse.json({ ok: true, result: 'resubscribed' })
              : NextResponse.json({ error: 'We could not do that just now. Please email hello@relevestaffing.com.' }, { status: 503 });
  }

  const { result } = await unsubscribeByToken(token);
  if (result === 'unavailable') return NextResponse.json({ error: 'We could not do that just now. Please email hello@relevestaffing.com.' }, { status: 503 });
  if (result === 'unknown') return NextResponse.json({ error: 'That link is not active.' }, { status: 404 });
  return NextResponse.json({ ok: true, result });
}
