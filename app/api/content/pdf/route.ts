import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { getPost, sign } from '@/lib/content';
import { renderSlidePng, pngToJpeg, slideCount, W, H } from '@/lib/content-render';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* A carousel as one PDF: what LinkedIn wants for a swipeable document post
   in a group. One page per slide, at the slide's own size. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get('id') ?? '', t = u.searchParams.get('t') ?? '';
  if (!id || !same(t, sign(id, 'pdf'))) return new NextResponse('Not found', { status: 404 });
  const post = await getPost(id);
  const n = post ? slideCount(post) : 0;
  if (!post || !n) return new NextResponse('Not found', { status: 404 });
  const doc = await PDFDocument.create();
  doc.setTitle(post.hook || 'Relève');
  doc.setAuthor('Relève');
  for (let i = 0; i < n; i++) {
    const img = await doc.embedJpg(pngToJpeg(await renderSlidePng(post, i), 88));
    const page = doc.addPage([W, H]);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  const bytes = await doc.save();
  const name = (post.hook || post.slot).replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'Releve carousel';
  return new NextResponse(new Uint8Array(bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}.pdf"`, 'cache-control': 'private, max-age=60' }
  });
}
