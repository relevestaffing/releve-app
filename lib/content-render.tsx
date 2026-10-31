import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import type { ContentPost } from './content-model';

/* The Relève graphics, drawn on the server (redesigned 31 October 2026).
   Nona chose "The Ledger" as the house look: annual-report precision, the
   real working artifact on the page (the math, the rules, the before and
   after, the message to send), Marcellus headlines with Geist for figures
   and text. To keep the feed from repeating, every post gets one of three
   Ledger colourways or, now and then, a guest look (the Desk, a paper
   document style, or After Hours, the dark message style), and Opus picks a
   layout per post and per slide from the set below. Instagram's 4:5
   portrait, 1080 by 1350. Relative imports only. */

export const W = 1080, H = 1350;

/* ---------- design data (lives inside card / slides jsonb) ---------- */
export type Layout = 'statement' | 'number' | 'rules' | 'compare' | 'chart' | 'message' | 'cover' | 'step' | 'cta';
export type Design = {
  layout?: Layout; kicker?: string;
  number?: string; facts?: { value: string; label: string }[];
  rows?: string[];
  left?: { label: string; items: string[] }; right?: { label: string; items: string[] };
  bars?: { label: string; parts: { pct: number; label: string }[] }[]; note?: string;
  messages?: { from: 'you' | 'assistant'; text: string }[];
  chips?: string[];
};
type CardD = Design & { quote: string; sub?: string };
type SlideD = Design & { title: string; body: string };

/* ---------- looks ---------- */
type Look = {
  key: 'paper' | 'ink' | 'mist' | 'desk' | 'night';
  bg: string; ink: string; soft: string; line: string; strong: string; accent: string; fill: string; fill2: string; panel: string; onAccent: string;
};
const LOOKS: Record<Look['key'], Look> = {
  paper: { key: 'paper', bg: '#FFFFFF', ink: '#121A16', soft: '#69756E', line: '#D9DED9', strong: '#121A16', accent: '#35443A', fill: '#E7ECE6', fill2: '#B0C4B2', panel: '#F4F6F3', onAccent: '#FFFFFF' },
  mist:  { key: 'mist',  bg: '#E9EEE8', ink: '#121A16', soft: '#5B6862', line: '#C9D3CA', strong: '#121A16', accent: '#35443A', fill: '#F7F9F6', fill2: '#B0C4B2', panel: '#F7F9F6', onAccent: '#FFFFFF' },
  ink:   { key: 'ink',   bg: '#16201B', ink: '#EEF1EC', soft: '#9DAAA2', line: '#2C3A32', strong: '#EEF1EC', accent: '#B0C4B2', fill: '#22302A', fill2: '#4C594F', panel: '#1E2A24', onAccent: '#16201B' },
  desk:  { key: 'desk',  bg: '#F7F5F0', ink: '#1E2A24', soft: '#5E6B63', line: '#E2E4DE', strong: '#1E2A24', accent: '#35443A', fill: '#DDE5DC', fill2: '#B0C4B2', panel: '#FFFFFF', onAccent: '#FFFFFF' },
  night: { key: 'night', bg: '#101713', ink: '#EEF1EC', soft: '#9DAAA2', line: '#26332C', strong: '#EEF1EC', accent: '#B0C4B2', fill: '#1B2621', fill2: '#4C594F', panel: '#1B2621', onAccent: '#101713' }
};

/* The rotation: four Ledger posts to every two guests, shifted by account
   and by week so the same weekday does not always look the same. */
const ORDER: Look['key'][] = ['paper', 'ink', 'desk', 'mist', 'night', 'paper', 'ink', 'mist'];
function lookFor(slot: string): Look {
  const m = /^(\d{4})-(\d{2})-(\d{2})-([a-z_]+)-(mon|tue|wed|thu|fri|sat|sun)/.exec(slot);
  if (!m) { let h = 0; for (const ch of slot) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return LOOKS[ORDER[h % ORDER.length]]; }
  const day = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(m[5]);
  const week = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / (7 * 86400000));
  const acct = { li_group: 0, ig_client: 3, li_page_client: 3, ig_careers: 5, li_page_careers: 5 }[m[4]] ?? 1;
  return LOOKS[ORDER[(day + week * 3 + acct) % ORDER.length]];
}
const weekNo = (slot: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(slot); if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil(((+d - +y0) / 86400000 + 1) / 7));
};

/* ---------- fonts ---------- */
let fonts: any[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');
  const get = (f: string) => fetch(`${base}/fonts/${f}`).then(r => r.arrayBuffer());
  const [m, g4, g5, g6, gm] = await Promise.all([
    get('Marcellus-Regular.ttf'), get('Geist-Regular.ttf'), get('Geist-Medium.ttf'), get('Geist-SemiBold.ttf'), get('GeistMono-Medium.ttf')
  ]);
  fonts = [
    { name: 'Marcellus', data: m, weight: 400, style: 'normal' },
    { name: 'Geist', data: g4, weight: 400, style: 'normal' },
    { name: 'Geist', data: g5, weight: 500, style: 'normal' },
    { name: 'Geist', data: g6, weight: 600, style: 'normal' },
    { name: 'Geist Mono', data: gm, weight: 500, style: 'normal' }
  ];
  return fonts;
}

type Drawable = Pick<ContentPost, 'slot' | 'channel' | 'format' | 'card' | 'slides'>;

export function slideCount(p: Drawable) {
  if (p.format === 'card') return p.card ? 1 : 0;
  if (p.format === 'carousel') return (p.slides ?? []).length;
  return 0;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const flex = (s: any = {}) => ({ display: 'flex', ...s });
const col = (s: any = {}) => ({ display: 'flex', flexDirection: 'column', ...s });
const size = (s: string, steps: [number, number][], min: number) => { for (const [n, px] of steps) if (s.length <= n) return px; return min; };
const headSize = (s: string, big = false) => big ? size(s, [[34, 104], [56, 92], [80, 80], [110, 70]], 60) : size(s, [[30, 80], [52, 70], [80, 62], [110, 56]], 50);
const bodySize = (s: string) => size(s, [[90, 34], [170, 31], [260, 29]], 27);

/* ---------- chrome ---------- */
function Header({ L, left, right }: { L: Look; left: string; right: string }) {
  if (L.key === 'desk') {
    return (
      <div style={flex({ justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Geist', fontWeight: 500, fontSize: 21, letterSpacing: 3, color: L.soft })}>
        <div style={flex({ alignItems: 'center', gap: 14 })}>
          <div style={flex({ width: 34, height: 34, background: L.accent, color: L.onAccent, borderRadius: 8, alignItems: 'center', justifyContent: 'center', fontFamily: 'Marcellus', fontSize: 22, letterSpacing: 0 })}>R</div>
          <span>RELÈVE</span>
        </div>
        <span>{right}</span>
      </div>
    );
  }
  const ledger = L.key !== 'night';
  return (
    <div style={col({})}>
      <div style={flex({ justifyContent: 'space-between', fontFamily: 'Geist', fontWeight: 500, fontSize: 21, letterSpacing: 4, color: L.ink })}>
        <span>RELÈVE</span><span style={{ color: L.soft }}>{`${left}${left && right ? ' · ' : ''}${right}`}</span>
      </div>
      {ledger ? <div style={{ height: 3, background: L.strong, marginTop: 22 }} /> : null}
    </div>
  );
}
function Footer({ L, left, right }: { L: Look; left: string; right: string }) {
  return (
    <div style={col({})}>
      {L.key === 'desk' || L.key === 'night' ? null : <div style={{ height: 1, background: L.line, marginBottom: 20 }} />}
      <div style={flex({ justifyContent: 'space-between', fontFamily: 'Geist', fontSize: 21, letterSpacing: 2, color: L.soft })}>
        <span>{left}</span><span>{right}</span>
      </div>
    </div>
  );
}
function Frame({ L, head, foot, children }: { L: Look; head: [string, string]; foot: [string, string]; children: any }) {
  const grid = L.key === 'night'
    ? <div style={flex({ position: 'absolute', top: 0, left: 0, width: W, height: H })}>{[180, 360, 540, 720, 900].map(x => <div key={x} style={{ position: 'absolute', left: x, top: 0, width: 1, height: H, background: '#16201B' }} />)}</div>
    : null;
  return (
    <div style={col({ width: W, height: H, background: L.bg, padding: '76px 84px 64px', position: 'relative', color: L.ink })}>
      {grid}
      <Header L={L} left={head[0]} right={head[1]} />
      <div style={col({ flexGrow: 1, justifyContent: 'center' })}>{children}</div>
      <Footer L={L} left={foot[0]} right={foot[1]} />
    </div>
  );
}

/* A boxed panel: a white document on the Desk, a dark card After Hours,
   nothing extra on the Ledger (fine rules do the work there). */
function Panel({ L, title, meta, children }: { L: Look; title?: string; meta?: string; children: any }) {
  if (L.key === 'paper' || L.key === 'ink' || L.key === 'mist') return <div style={col({ marginTop: 44 })}>{children}</div>;
  return (
    <div style={col({ marginTop: 44, background: L.panel, border: `1px solid ${L.line}`, borderRadius: L.key === 'desk' ? 24 : 28, padding: '30px 38px', boxShadow: L.key === 'desk' ? '0 24px 60px rgba(30,42,36,0.10)' : 'none' })}>
      {title ? (
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center', paddingBottom: 18, marginBottom: 6, borderBottom: `1px solid ${L.line}` })}>
          <span style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 28, color: L.ink }}>{title}</span>
          {meta ? <span style={{ fontFamily: 'Geist Mono', fontSize: 19, color: L.soft }}>{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Kicker({ L, text }: { L: Look; text?: string }) {
  if (!text) return null;
  if (L.key === 'desk') return <div style={flex({ alignSelf: 'flex-start', background: L.fill, color: L.accent, fontFamily: 'Geist', fontWeight: 600, fontSize: 21, letterSpacing: 2, padding: '10px 18px', borderRadius: 999, marginBottom: 34 })}>{text.toUpperCase()}</div>;
  return <span style={{ fontFamily: L.key === 'night' ? 'Geist Mono' : 'Geist', fontWeight: 500, fontSize: 23, letterSpacing: 3, color: L.accent, marginBottom: 26 }}>{text.toUpperCase()}</span>;
}
function Head({ L, text, big }: { L: Look; text: string; big?: boolean }) {
  return <div style={flex({ fontFamily: 'Marcellus', fontSize: headSize(text, big), lineHeight: 1.06, color: L.ink })}>{text}</div>;
}
function Body({ L, text, top = 30, strong }: { L: Look; text?: string; top?: number; strong?: boolean }) {
  if (!text) return null;
  return <div style={flex({ fontFamily: 'Geist', fontSize: bodySize(text), lineHeight: 1.45, color: strong ? L.ink : L.soft, marginTop: top, whiteSpace: 'pre-wrap' })}>{text}</div>;
}

/* ---------- the layouts ---------- */
function Rows({ L, rows }: { L: Look; rows: string[] }) {
  const boxed = L.key === 'desk' || L.key === 'night';
  return (
    <div style={col({ borderTop: boxed ? 'none' : `3px solid ${L.strong}` })}>
      {rows.slice(0, 5).map((r, i) => (
        <div key={i} style={flex({ alignItems: 'center', padding: '22px 0', borderBottom: i < rows.length - 1 || !boxed ? `1px solid ${L.line}` : 'none', fontFamily: 'Geist', fontSize: size(r, [[50, 31], [80, 28]], 26), color: L.ink })}>
          {boxed
            ? <div style={flex({ width: 32, height: 32, borderRadius: 8, background: L.accent, alignItems: 'center', justifyContent: 'center', marginRight: 22, flexShrink: 0 })}><div style={{ width: 13, height: 7, borderLeft: `3px solid ${L.onAccent}`, borderBottom: `3px solid ${L.onAccent}`, transform: 'rotate(-45deg)', marginTop: -4 }} /></div>
            : <span style={{ fontFamily: 'Geist Mono', color: L.accent, width: 78, flexShrink: 0 }}>{pad2(i + 1)}</span>}
          <span style={{ display: 'flex' }}>{r}</span>
        </div>
      ))}
    </div>
  );
}
function NumberBlock({ L, d, label }: { L: Look; d: Design; label?: string }) {
  const n = d.number || '';
  return (
    <div style={col({})}>
      {label ? <span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 28, color: L.soft }}>{label}</span> : null}
      <div style={flex({ fontFamily: 'Geist', fontWeight: 600, fontSize: size(n, [[5, 250], [7, 210], [9, 170]], 140), letterSpacing: -8, lineHeight: 1, color: L.ink, marginTop: 8 })}>{n}</div>
      {d.facts?.length ? (
        <div style={flex({ marginTop: 44, borderTop: `1px solid ${L.line}` })}>
          {d.facts.slice(0, 3).map((f, i) => (
            <div key={i} style={col({ flexGrow: 1, flexBasis: 0, padding: '24px 0 0', paddingLeft: i ? 24 : 0, borderLeft: i ? `1px solid ${L.line}` : 'none' })}>
              <span style={{ fontFamily: 'Geist Mono', fontSize: size(f.value, [[6, 42], [10, 34]], 28), color: L.accent }}>{f.value}</span>
              <span style={{ fontFamily: 'Geist', fontSize: 22, lineHeight: 1.3, color: L.soft, marginTop: 6 }}>{f.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
function Compare({ L, d }: { L: Look; d: Design }) {
  const side = (s: { label: string; items: string[] } | undefined, strong: boolean) => (
    <div style={col({ flexGrow: 1, flexBasis: 0, background: strong ? L.accent : L.fill, color: strong ? L.onAccent : L.ink, padding: '28px 30px', borderRadius: L.key === 'desk' || L.key === 'night' ? 20 : 0 })}>
      <span style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 22, letterSpacing: 3, marginBottom: 14 }}>{(s?.label ?? '').toUpperCase()}</span>
      {(s?.items ?? []).slice(0, 5).map((it, i) => <div key={i} style={flex({ fontFamily: 'Geist', fontSize: size(it, [[40, 28], [70, 25]], 23), lineHeight: 1.35, padding: '10px 0', borderTop: i ? `1px solid ${strong ? 'rgba(255,255,255,0.18)' : L.line}` : 'none' })}>{it}</div>)}
    </div>
  );
  return <div style={flex({ gap: 18, marginTop: 40 })}>{side(d.left, false)}{side(d.right, true)}</div>;
}
function Chart({ L, d }: { L: Look; d: Design }) {
  const tones = [L.fill, L.fill2, L.accent];
  return (
    <div style={col({ marginTop: 34 })}>
      {(d.bars ?? []).slice(0, 3).map((b, i) => {
        const total = b.parts.reduce((a, p) => a + Math.max(0, p.pct), 0) || 100;
        return (
          <div key={i} style={col({ marginTop: i ? 26 : 0 })}>
            <span style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 21, letterSpacing: 2, color: L.ink, marginBottom: 10 }}>{b.label.toUpperCase()}</span>
            <div style={flex({ height: 58 })}>
              {b.parts.slice(0, 3).map((p, k) => (
                <div key={k} style={flex({ width: `${(Math.max(0, p.pct) / total) * 100}%`, background: tones[k % 3], alignItems: 'center', paddingLeft: 14, fontFamily: 'Geist', fontSize: 19, color: k === 2 ? L.onAccent : L.ink, overflow: 'hidden' })}>{p.pct / total > 0.14 ? p.label : ''}</div>
              ))}
            </div>
          </div>
        );
      })}
      {d.note ? <span style={{ fontFamily: 'Geist', fontSize: 19, color: L.soft, marginTop: 14 }}>{d.note}</span> : null}
    </div>
  );
}
function Messages({ L, d }: { L: Look; d: Design }) {
  return (
    <div style={col({ marginTop: 30 })}>
      {(d.messages ?? []).slice(0, 3).map((m, i) => {
        const me = m.from === 'you';
        const dark = L.key === 'ink' || L.key === 'night';
        return (
          <div key={i} style={col({ alignItems: me ? 'flex-end' : 'flex-start', marginTop: 20 })}>
            <div style={flex({ maxWidth: 780, background: me ? (dark ? '#E9EEE8' : L.accent) : L.panel, color: me ? (dark ? '#14201A' : L.onAccent) : L.ink, border: me ? 'none' : `1px solid ${L.line}`, fontFamily: 'Geist', fontSize: size(m.text, [[90, 30], [170, 27]], 25), lineHeight: 1.4, padding: '22px 28px', borderRadius: 28, borderBottomRightRadius: me ? 8 : 28, borderBottomLeftRadius: me ? 28 : 8, whiteSpace: 'pre-wrap' })}>{m.text}</div>
            <span style={{ fontFamily: 'Geist Mono', fontSize: 17, color: L.soft, marginTop: 8 }}>{me ? 'You' : 'Your executive assistant'}</span>
          </div>
        );
      })}
    </div>
  );
}
function Chips({ L, chips }: { L: Look; chips?: string[] }) {
  if (!chips?.length) return null;
  return (
    <div style={flex({ gap: 12, marginTop: 44, flexWrap: 'wrap' })}>
      {chips.slice(0, 4).map((c, i) => <div key={i} style={flex({ border: `1px solid ${L.line}`, background: L.key === 'desk' ? L.panel : 'transparent', borderRadius: L.key === 'paper' || L.key === 'mist' || L.key === 'ink' ? 0 : 14, padding: '12px 20px', fontFamily: 'Geist', fontWeight: 500, fontSize: 23, color: L.ink })}>{c}</div>)}
    </div>
  );
}

/* One page: the layout decides what sits under the headline. */
function Page({ L, d, title, body, big }: { L: Look; d: Design; title: string; body?: string; big?: boolean }) {
  switch (d.layout) {
    case 'number':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><NumberBlock L={L} d={d} label={title} /><Body L={L} text={body} top={50} strong /></div>);
    case 'rules':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} /><Panel L={L} title={L.key === 'desk' ? (d.kicker || 'The rules') : undefined} meta={L.key === 'desk' ? 'shared with your EA' : undefined}><Rows L={L} rows={d.rows ?? []} /></Panel><Body L={L} text={body} /></div>);
    case 'compare':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} /><Compare L={L} d={d} /><Body L={L} text={body} /></div>);
    case 'chart':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} /><Body L={L} text={body} top={24} /><Chart L={L} d={d} /></div>);
    case 'message':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} /><Messages L={L} d={d} /><Body L={L} text={body} /></div>);
    case 'cover':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} big /><Body L={L} text={body} /><Chips L={L} chips={d.chips} /></div>);
    default: // statement, step, cta
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} big={big} /><Body L={L} text={body} top={36} /></div>);
  }
}

function isCareers(p: Drawable) { return p.channel === 'ig_careers' || p.channel === 'li_page_careers'; }

function cardEl(p: Drawable, L: Look) {
  const c = p.card as CardD;
  const d: Design = { ...c, layout: c.layout && c.layout !== 'cover' && c.layout !== 'step' ? c.layout : 'statement' };
  const kick = c.kicker ? c.kicker.toUpperCase() : '';
  return (
    <Frame L={L} head={[`WEEK ${weekNo(p.slot)}`, kick]} foot={[isCareers(p) ? 'RELÈVE CAREERS' : 'RELEVESTAFFING.COM', isCareers(p) ? 'APPLY · RELEVESTAFFING.COM' : 'BOOK A DELEGATION AUDIT']}>
      <Page L={L} d={{ ...d, kicker: undefined }} title={c.quote} body={c.sub} big />
    </Frame>
  );
}

function slideEl(p: Drawable, L: Look, n: number) {
  const slides = p.slides as SlideD[];
  const s = slides[n], total = slides.length;
  const page = `${pad2(n + 1)} / ${pad2(total)}`;
  const first = n === 0, last = n === total - 1;
  const layout: Layout = s.layout && !(first && s.layout === 'cta') ? s.layout : first ? 'cover' : last ? 'cta' : 'step';
  const label = p.channel === 'li_group' ? 'FREE TRAINING' : isCareers(p) ? 'RELÈVE CAREERS' : 'FIELD GUIDE';
  const kicker = first ? (s.kicker || label) : layout === 'step' ? (s.kicker || `STEP ${n} OF ${total - 2}`) : s.kicker;
  return (
    <Frame L={L} head={[`WEEK ${weekNo(p.slot)}`, label]} foot={['RELEVESTAFFING.COM', first ? `${page}   SWIPE →` : page]}>
      <Page L={L} d={{ ...s, layout, kicker }} title={s.title} body={s.body} big={first || last} />
    </Frame>
  );
}

/* One image of a post as PNG bytes. n counts from 0. */
export async function renderSlidePng(p: Drawable, n: number): Promise<Buffer> {
  const L = lookFor(p.slot);
  const el = p.format === 'card' ? cardEl(p, L) : slideEl(p, L, n);
  const res = new ImageResponse(el, { width: W, height: H, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

/* Instagram accepts JPEG only. */
export function pngToJpeg(png: Buffer, quality = 90): Buffer {
  const img = PNG.sync.read(png);
  return Buffer.from(jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality).data);
}
