import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import type { ContentPost, Slide } from './content-model';

/* The Relève graphics, drawn on the server (30 October 2026).
   One system for every post, from the @relevestaffing quote-card format
   already on the grid: a solid single-colour ground held through a whole
   carousel, a small tracked-caps kicker with one thin rule under it, the
   words set in Marcellus, "RELÈVE" bottom left and the page count bottom
   right. Instagram's 4:5 portrait, 1080 by 1350. Square corners, no
   gradients, no stock imagery. */

export const W = 1080, H = 1350;

type Theme = { bg: string; ink: string; soft: string; rule: string };
const THEMES: Theme[] = [
  { bg: '#35443A', ink: '#F3EFE6', soft: '#C7D4C6', rule: '#B0C4B2' },   // fern
  { bg: '#F3EFE6', ink: '#22302A', soft: '#4C594F', rule: '#35443A' },   // cream
  { bg: '#DDE5DC', ink: '#22302A', soft: '#4C594F', rule: '#35443A' },   // mist
  { bg: '#FAF8F2', ink: '#22302A', soft: '#4C594F', rule: '#35443A' }    // paper
];

function themeFor(slot: string): Theme {
  let h = 0;
  for (const ch of slot) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return THEMES[h % THEMES.length];
}

let fonts: { name: string; data: ArrayBuffer; weight: 400; style: 'normal' }[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');
  const [m, t] = await Promise.all([
    fetch(`${base}/fonts/Marcellus-Regular.ttf`).then(r => r.arrayBuffer()),
    fetch(`${base}/fonts/TenorSans-Regular.ttf`).then(r => r.arrayBuffer())
  ]);
  fonts = [
    { name: 'Marcellus', data: m, weight: 400, style: 'normal' },
    { name: 'Tenor Sans', data: t, weight: 400, style: 'normal' }
  ];
  return fonts;
}

type Drawable = Pick<ContentPost, 'slot' | 'channel' | 'format' | 'card' | 'slides'>;

/* How many images a post has: a card is one, a carousel one per slide. */
export function slideCount(p: Drawable) {
  if (p.format === 'card') return p.card ? 1 : 0;
  if (p.format === 'carousel') return (p.slides ?? []).length;
  return 0;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function Frame({ t, careers, page, children }: { t: Theme; careers: boolean; page?: string; children: any }) {
  return (
    <div style={{ width: W, height: H, background: t.bg, display: 'flex', flexDirection: 'column', padding: '96px 92px 76px', fontFamily: 'Tenor Sans', color: t.ink }}>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>{children}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 22, letterSpacing: 7, color: t.soft }}>
        <span>{careers ? 'RELÈVE CAREERS' : 'RELÈVE'}</span>
        <span>{page ?? 'RELEVESTAFFING.COM'}</span>
      </div>
    </div>
  );
}

function Kicker({ t, text, center }: { t: Theme; text: string; center?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', marginBottom: 54 }}>
      <span style={{ fontSize: 24, letterSpacing: 8, color: t.soft }}>{text.toUpperCase()}</span>
      <div style={{ width: 120, height: 2, background: t.rule, marginTop: 20 }} />
    </div>
  );
}

function quoteSize(s: string) {
  const n = s.length;
  return n < 60 ? 92 : n < 110 ? 78 : n < 170 ? 66 : 56;
}

function cardEl(p: Drawable, t: Theme) {
  const c = p.card!;
  const careers = p.channel === 'ig_careers' || p.channel === 'li_page_careers';
  return (
    <Frame t={t} careers={careers}>
      <Kicker t={t} text={c.kicker || 'Consider it handled'} center />
      <div style={{ display: 'flex', textAlign: 'center', justifyContent: 'center', fontFamily: 'Marcellus', fontSize: quoteSize(c.quote), lineHeight: 1.18 }}>{c.quote}</div>
      {c.sub ? <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center', marginTop: 44, fontSize: 32, lineHeight: 1.5, color: t.soft }}>{c.sub}</div> : null}
    </Frame>
  );
}

function slideEl(p: Drawable, t: Theme, n: number) {
  const slides = p.slides as Slide[];
  const s = slides[n], total = slides.length;
  const careers = p.channel === 'ig_careers' || p.channel === 'li_page_careers';
  const page = `${pad2(n + 1)} / ${pad2(total)}`;
  if (n === 0) {
    return (
      <Frame t={t} careers={careers} page={`SWIPE  →   ${page}`}>
        <Kicker t={t} text={p.channel === 'li_group' ? 'Free training' : careers ? 'Relève Careers' : 'The Relève way'} />
        <div style={{ display: 'flex', fontFamily: 'Marcellus', fontSize: s.title.length < 50 ? 96 : 80, lineHeight: 1.1 }}>{s.title}</div>
        {s.body ? <div style={{ display: 'flex', marginTop: 40, fontSize: 36, lineHeight: 1.5, color: t.soft }}>{s.body}</div> : null}
      </Frame>
    );
  }
  const last = n === total - 1;
  return (
    <Frame t={t} careers={careers} page={page}>
      <span style={{ fontFamily: 'Marcellus', fontSize: 30, color: t.soft, marginBottom: 30 }}>{last ? '' : pad2(n)}</span>
      <div style={{ display: 'flex', fontFamily: 'Marcellus', fontSize: s.title.length < 45 ? 68 : 58, lineHeight: 1.15 }}>{s.title}</div>
      <div style={{ width: 120, height: 2, background: t.rule, margin: '40px 0' }} />
      <div style={{ display: 'flex', fontSize: s.body.length > 260 ? 32 : 36, lineHeight: 1.55 }}>{s.body}</div>
    </Frame>
  );
}

/* One image of a post as PNG bytes. n counts from 0. */
export async function renderSlidePng(p: Drawable, n: number): Promise<Buffer> {
  const t = themeFor(p.slot);
  const el = p.format === 'card' ? cardEl(p, t) : slideEl(p, t, n);
  const res = new ImageResponse(el, { width: W, height: H, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

/* Instagram accepts JPEG only. */
export function pngToJpeg(png: Buffer, quality = 90): Buffer {
  const img = PNG.sync.read(png);
  return Buffer.from(jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality).data);
}
