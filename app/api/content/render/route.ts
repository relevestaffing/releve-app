import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getPost, sign } from '@/lib/content';
import { renderSlidePng, pngToJpeg, slideCount } from '@/lib/content-render';

export const dynamic = 'force-dynamic';

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* One graphic of a post. Public, because Instagram and Facebook fetch the
   picture from this address when they publish it; every link carries a
   signature, so nobody can walk through drafts by guessing ids. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get('id') ?? '', n = Number(u.searchParams.get('n') ?? '0'), t = u.searchParams.get('t') ?? '';
  if (!id || !Number.isInteger(n) || n < 0 || !same(t, sign(id, n))) return new NextResponse('Not found', { status: 404 });
  const post = await getPost(id);
  if (!post || n >= slideCount(post)) return new NextResponse('Not found', { status: 404 });
  const png = await renderSlidePng(post, n);
  const jpg = u.searchParams.get('fmt') !== 'png';
  const body = jpg ? pngToJpeg(png) : png;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'content-type': jpg ? 'image/jpeg' : 'image/png',
      /* Netlify's CDN keys its cache on the path alone unless told to vary
         on the query, which served one slide for every slide (31 Oct). */
      'cache-control': 'public, max-age=300',
      'netlify-vary': 'query',
      'netlify-cdn-cache-control': 'no-store',
      'content-disposition': `inline; filename="releve-${post.slot}-${n + 1}.${jpg ? 'jpg' : 'png'}"`
    }
  });
}
