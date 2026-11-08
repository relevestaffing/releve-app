import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import type { ContentPost } from './content-model';

/* The Relève graphics, drawn on the server (redesigned 31 October 2026).
   Nona chose "The Ledger" as the house look: annual-report precision, the
   real working artifact on the page (the math, the rules, the before and
   after, the message to send), Lora headlines with Geist for figures
   and text. To keep the feed from repeating, every post gets one of three
   Ledger colourways or, now and then, a guest look (the Desk, a paper
   document style, or After Hours, the dark message style), and Opus picks a
   layout per post and per slide from the set below. Instagram's 4:5
   portrait, 1080 by 1350. Relative imports only. */

export const W = 1080, H = 1350;

/* ---------- design data (lives inside card / slides jsonb) ---------- */
export type Layout = 'statement' | 'number' | 'rules' | 'compare' | 'chart' | 'message' | 'cover' | 'step' | 'cta'
  | 'notes' | 'search' | 'flags' | 'quiz' | 'comment';
export type Design = {
  layout?: Layout; kicker?: string;
  number?: string; facts?: { value: string; label: string }[];
  rows?: string[];
  left?: { label: string; items: string[] }; right?: { label: string; items: string[] };
  bars?: { label: string; parts: { pct: number; label: string }[] }[]; note?: string;
  messages?: { from: 'you' | 'assistant'; text: string }[];
  chips?: string[]; keyword?: string;
};
type CardD = Design & { quote: string; sub?: string };
type SlideD = Design & { title: string; body: string };

/* ---------- looks ---------- */
type Look = {
  key: 'paper' | 'ink' | 'mist' | 'desk' | 'night' | 'wallDark' | 'cream' | 'fern';
  bg: string; ink: string; soft: string; line: string; strong: string; accent: string; fill: string; fill2: string; panel: string; onAccent: string;
};
const LOOKS: Record<Look['key'], Look> = {
  paper: { key: 'paper', bg: '#FFFFFF', ink: '#121A16', soft: '#69756E', line: '#D9DED9', strong: '#121A16', accent: '#35443A', fill: '#E7ECE6', fill2: '#B0C4B2', panel: '#F4F6F3', onAccent: '#FFFFFF' },
  mist:  { key: 'mist',  bg: '#E9EEE8', ink: '#121A16', soft: '#5B6862', line: '#C9D3CA', strong: '#121A16', accent: '#35443A', fill: '#F7F9F6', fill2: '#B0C4B2', panel: '#F7F9F6', onAccent: '#FFFFFF' },
  ink:   { key: 'ink',   bg: '#16201B', ink: '#EEF1EC', soft: '#9DAAA2', line: '#2C3A32', strong: '#EEF1EC', accent: '#B0C4B2', fill: '#22302A', fill2: '#4C594F', panel: '#1E2A24', onAccent: '#16201B' },
  desk:  { key: 'desk',  bg: '#F7F5F0', ink: '#1E2A24', soft: '#5E6B63', line: '#E2E4DE', strong: '#1E2A24', accent: '#35443A', fill: '#DDE5DC', fill2: '#B0C4B2', panel: '#FFFFFF', onAccent: '#FFFFFF' },
  night: { key: 'night', bg: '#101713', ink: '#EEF1EC', soft: '#9DAAA2', line: '#26332C', strong: '#EEF1EC', accent: '#B0C4B2', fill: '#1B2621', fill2: '#4C594F', panel: '#1B2621', onAccent: '#101713' },
  /* The three looks of 8 November 2026 (see "The three looks" below). */
  wallDark: { key: 'wallDark', bg: '#131C17', ink: '#F3EFE6', soft: '#D6DED6', line: 'rgba(201,208,203,0.32)', strong: '#F3EFE6', accent: '#B0C4B2', fill: 'rgba(243,239,230,0.10)', fill2: '#4C594F', panel: 'rgba(19,28,23,0.55)', onAccent: '#16201B' },
  cream: { key: 'cream', bg: '#F3EFE6', ink: '#22302A', soft: '#3C463F', line: '#CFD5CC', strong: '#22302A', accent: '#35443A', fill: '#E4E8E1', fill2: '#B0C4B2', panel: '#FBF9F4', onAccent: '#F3EFE6' },
  fern: { key: 'fern', bg: '#1A251F', ink: '#F3EFE6', soft: '#D6DED6', line: '#3A4A40', strong: '#F3EFE6', accent: '#B0C4B2', fill: '#22302A', fill2: '#4C594F', panel: '#22302A', onAccent: '#1A251F' }
};

/* The rotation: four Ledger posts to every two guests, shifted by account
   and by week so the same weekday does not always look the same. */
const ORDER: Look['key'][] = ['paper', 'ink', 'mist', 'desk', 'paper', 'night', 'mist', 'ink'];
function lookFor(slot: string): Look {
  const m = /^(\d{4})-(\d{2})-(\d{2})-([a-z_]+)-(mon|tue|wed|thu|fri|sat|sun)/.exec(slot);
  if (!m) { let h = 0; for (const ch of slot) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return LOOKS[ORDER[h % ORDER.length]]; }
  const day = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(m[5]);
  const week = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / (7 * 86400000));
  const acct = { li_group: 0, ig_client: 3, li_page_client: 3, ig_careers: 5, li_page_careers: 5 }[m[4]] ?? 1;
  return LOOKS[ORDER[(day + week * 3 + acct) % ORDER.length]];
}
const weekNo = (slot: string) => {
  if (/-launch\d/.test(slot)) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(slot); if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil(((+d - +y0) / 86400000 + 1) / 7));
};

/* ---------- fonts ---------- */
/* The real Relève artwork (2 Nov 2026 rule): the logo and the
   "Consider it handled." script are never typed in a font. */
/* Every file the graphics need comes from the app's public folder: fetched
   from the live app, or read from disk when RENDER_ASSET_DIR is set (local
   renders before a deploy). */
async function assetBytes(path: string): Promise<ArrayBuffer> {
  const dir = process.env.RENDER_ASSET_DIR;
  if (dir) {
    const fs = await import('fs/promises');
    const b = await fs.readFile(`${dir.replace(/\/+$/, '')}/${path}`);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');
  const r = await fetch(`${base}/${path}`);
  if (!r.ok) throw new Error(`A graphics file is missing: ${path}`);
  return r.arrayBuffer();
}
const dataUri = async (path: string, type: string) => `data:${type};base64,${Buffer.from(await assetBytes(path)).toString('base64')}`;
type Art = { logoFern: string; logoWhite: string; handled: string; handledCream: string };
let art: Art | null = null;
async function loadArt(): Promise<Art> {
  if (art) return art;
  const uri = (f: string) => dataUri(f, 'image/png');
  const [a, b, c, d] = await Promise.all([uri('logo-fern.png'), uri('logo-white.png'), uri('consider-it-handled.png'), uri('consider-it-handled-cream.png')]);
  art = { logoFern: a, logoWhite: b, handled: c, handledCream: d };
  return art;
}
const isDark = (L: { key: string }) => L.key === 'ink' || L.key === 'night' || L.key === 'wallDark' || L.key === 'fern';
/* 1200 x 360 lockup with EXECUTIVE STAFFING; 2755 x 414 script. */
function Logo({ L, h = 80 }: { L: { key: string }; h?: number }) {
  return <img src={isDark(L) ? art!.logoWhite : art!.logoFern} width={Math.round(h * 1200 / 360)} height={h} style={{ display: 'flex' }} />;
}
function Handled({ L, h = 44 }: { L: { key: string }; h?: number }) {
  return <img src={isDark(L) ? art!.handledCream : art!.handled} width={Math.round(h * 2755 / 414)} height={h} style={{ display: 'flex' }} />;
}

let fonts: any[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const get = (f: string) => assetBytes(`fonts/${f}`);
  /* Lora and Poppins only, the brand's two families (8 Nov 2026). */
  const [m, mi, p3, p4, p5, p6] = await Promise.all([
    get('Lora-Regular.woff'), get('Lora-Italic.woff'), get('Poppins-Light.woff'), get('Poppins-Regular.woff'), get('Poppins-Medium.woff'), get('Poppins-SemiBold.woff')
  ]);
  fonts = [
    { name: 'Lora', data: m, weight: 400, style: 'normal' },
    { name: 'Lora', data: mi, weight: 400, style: 'italic' },
    { name: 'Poppins', data: p3, weight: 300, style: 'normal' },
    { name: 'Poppins', data: p4, weight: 400, style: 'normal' },
    { name: 'Poppins', data: p5, weight: 500, style: 'normal' },
    { name: 'Poppins', data: p6, weight: 600, style: 'normal' }
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
      <div style={flex({ justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Poppins', fontWeight: 500, fontSize: 21, letterSpacing: 3, color: L.soft })}>
        <Logo L={L} />
        <span>{right}</span>
      </div>
    );
  }
  const ledger = L.key !== 'night';
  return (
    <div style={col({})}>
      <div style={flex({ justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Poppins', fontWeight: 500, fontSize: 21, letterSpacing: 4, color: L.ink })}>
        <Logo L={L} /><span style={{ color: L.soft }}>{`${left}${left && right ? ' · ' : ''}${right}`}</span>
      </div>
      {ledger ? <div style={{ height: 3, background: L.strong, marginTop: 22 }} /> : null}
    </div>
  );
}
function Footer({ L, left, right }: { L: Look; left: string; right: string }) {
  const script = right === 'CONSIDER IT HANDLED.';
  return (
    <div style={col({})}>
      {L.key === 'desk' || L.key === 'night' ? null : <div style={{ height: 1, background: L.line, marginBottom: 20 }} />}
      <div style={flex({ justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Poppins', fontSize: 21, letterSpacing: 2, color: L.soft })}>
        <span>{left}</span>{script ? <Handled L={L} /> : <span>{right}</span>}
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
  if (L.key === 'paper' || L.key === 'ink' || L.key === 'mist' || L.key === 'wallDark' || L.key === 'cream' || L.key === 'fern') return <div style={col({ marginTop: 44 })}>{children}</div>;
  return (
    <div style={col({ marginTop: 44, background: L.panel, border: `1px solid ${L.line}`, borderRadius: L.key === 'desk' ? 24 : 28, padding: '30px 38px', boxShadow: L.key === 'desk' ? '0 24px 60px rgba(30,42,36,0.10)' : 'none' })}>
      {title ? (
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center', paddingBottom: 18, marginBottom: 6, borderBottom: `1px solid ${L.line}` })}>
          <span style={{ fontFamily: 'Poppins', fontWeight: 600, fontSize: 28, color: L.ink }}>{title}</span>
          {meta ? <span style={{ fontFamily: 'Lora', fontSize: 19, color: L.soft }}>{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Kicker({ L, text }: { L: Look; text?: string }) {
  if (!text) return null;
  if (L.key === 'desk') return <div style={flex({ alignSelf: 'flex-start', background: L.fill, color: L.accent, fontFamily: 'Poppins', fontWeight: 600, fontSize: 21, letterSpacing: 2, padding: '10px 18px', borderRadius: 999, marginBottom: 34 })}>{text.toUpperCase()}</div>;
  return <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 23, letterSpacing: 3, color: L.accent, marginBottom: 26 }}>{text.toUpperCase()}</span>;
}
function Head({ L, text, big }: { L: Look; text: string; big?: boolean }) {
  return <div style={flex({ fontFamily: 'Lora', fontSize: headSize(text, big), lineHeight: 1.06, color: L.ink, textWrap: 'balance' } as any)}>{text}</div>;
}
function Body({ L, text, top = 30, strong }: { L: Look; text?: string; top?: number; strong?: boolean }) {
  if (!text) return null;
  return <div style={flex({ fontFamily: 'Poppins', fontSize: bodySize(text), lineHeight: 1.45, color: strong ? L.ink : L.soft, marginTop: top, whiteSpace: 'pre-wrap' })}>{text}</div>;
}

/* ---------- the layouts ---------- */
function Rows({ L, rows }: { L: Look; rows: string[] }) {
  const boxed = L.key === 'desk' || L.key === 'night';
  return (
    <div style={col({ borderTop: boxed ? 'none' : `3px solid ${L.strong}` })}>
      {rows.slice(0, 5).map((r, i) => (
        <div key={i} style={flex({ alignItems: 'center', padding: '22px 0', borderBottom: i < rows.length - 1 || !boxed ? `1px solid ${L.line}` : 'none', fontFamily: 'Poppins', fontSize: size(r, [[50, 31], [80, 28]], 26), color: L.ink })}>
          {boxed
            ? <div style={flex({ width: 32, height: 32, borderRadius: 8, background: L.accent, alignItems: 'center', justifyContent: 'center', marginRight: 22, flexShrink: 0 })}><div style={{ width: 13, height: 7, borderLeft: `3px solid ${L.onAccent}`, borderBottom: `3px solid ${L.onAccent}`, transform: 'rotate(-45deg)', marginTop: -4 }} /></div>
            : <span style={{ fontFamily: 'Lora', color: L.accent, width: 78, flexShrink: 0 }}>{pad2(i + 1)}</span>}
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
      {label ? <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 28, color: L.soft }}>{label}</span> : null}
      <div style={flex({ fontFamily: 'Lora', fontSize: size(n, [[5, 240], [7, 200], [9, 160]], 130), letterSpacing: -4, lineHeight: 1, color: L.ink, marginTop: 8 })}>{n}</div>
      {d.facts?.length ? (
        <div style={flex({ marginTop: 44, borderTop: `1px solid ${L.line}` })}>
          {d.facts.slice(0, 3).map((f, i) => (
            <div key={i} style={col({ flexGrow: 1, flexBasis: 0, padding: '24px 0 0', paddingLeft: i ? 24 : 0, borderLeft: i ? `1px solid ${L.line}` : 'none' })}>
              <span style={{ fontFamily: 'Lora', fontSize: size(f.value, [[6, 42], [10, 34]], 28), color: L.accent }}>{f.value}</span>
              <span style={{ fontFamily: 'Poppins', fontSize: 22, lineHeight: 1.3, color: L.soft, marginTop: 6 }}>{f.label}</span>
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
      <span style={{ fontFamily: 'Poppins', fontWeight: 600, fontSize: 22, letterSpacing: 3, marginBottom: 14 }}>{(s?.label ?? '').toUpperCase()}</span>
      {(s?.items ?? []).slice(0, 5).map((it, i) => <div key={i} style={flex({ fontFamily: 'Poppins', fontSize: size(it, [[40, 28], [70, 25]], 23), lineHeight: 1.35, padding: '10px 0', borderTop: i ? `1px solid ${strong ? 'rgba(255,255,255,0.18)' : L.line}` : 'none' })}>{it}</div>)}
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
            <span style={{ fontFamily: 'Poppins', fontWeight: 600, fontSize: 21, letterSpacing: 2, color: L.ink, marginBottom: 10 }}>{b.label.toUpperCase()}</span>
            <div style={flex({ height: 58 })}>
              {b.parts.slice(0, 3).map((p, k) => (
                <div key={k} style={flex({ width: `${(Math.max(0, p.pct) / total) * 100}%`, background: tones[k % 3], alignItems: 'center', paddingLeft: 14, fontFamily: 'Poppins', fontSize: 19, color: k === 2 ? L.onAccent : L.ink, overflow: 'hidden' })}>{p.pct / total > 0.14 ? p.label : ''}</div>
              ))}
            </div>
          </div>
        );
      })}
      {d.note ? <span style={{ fontFamily: 'Poppins', fontSize: 19, color: L.soft, marginTop: 14 }}>{d.note}</span> : null}
    </div>
  );
}
function Messages({ L, d }: { L: Look; d: Design }) {
  return (
    <div style={col({ marginTop: 30 })}>
      {(d.messages ?? []).slice(0, 3).map((m, i) => {
        const me = m.from === 'you';
        const dark = isDark(L);
        return (
          <div key={i} style={col({ alignItems: me ? 'flex-end' : 'flex-start', marginTop: 20 })}>
            <div style={flex({ maxWidth: 780, background: me ? (dark ? '#E9EEE8' : L.accent) : L.panel, color: me ? (dark ? '#14201A' : L.onAccent) : L.ink, border: me ? 'none' : `1px solid ${L.line}`, fontFamily: 'Poppins', fontSize: size(m.text, [[90, 30], [170, 27]], 25), lineHeight: 1.4, padding: '22px 28px', borderRadius: 28, borderBottomRightRadius: me ? 8 : 28, borderBottomLeftRadius: me ? 28 : 8, whiteSpace: 'pre-wrap' })}>{m.text}</div>
            <span style={{ fontFamily: 'Lora', fontSize: 17, color: L.soft, marginTop: 8 }}>{me ? 'You' : 'Your executive assistant'}</span>
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
      {chips.slice(0, 4).map((c, i) => <div key={i} style={flex({ border: `1px solid ${L.line}`, background: L.key === 'desk' ? L.panel : 'transparent', borderRadius: L.key === 'desk' || L.key === 'night' ? 14 : 0, padding: '12px 20px', fontFamily: 'Poppins', fontWeight: 500, fontSize: 23, color: L.ink })}>{c}</div>)}
    </div>
  );
}

/* ---------- the feed-native and client-pulling layouts (31 Oct) ---------- */

/* An iPhone Notes page, in Relève colours. */
function NotesCard({ L, title, rows, date }: { L: Look; title: string; rows: string[]; date?: string }) {
  const dark = isDark(L);
  const paper = dark ? '#1E2A24' : '#FFFFFF', ink = dark ? '#EEF1EC' : '#1B1F1C', soft = dark ? '#9DAAA2' : '#8A928D', accent = dark ? '#B0C4B2' : '#35443A';
  return (
    <div style={col({ background: paper, borderRadius: 34, padding: '34px 44px 40px', boxShadow: dark ? 'none' : '0 30px 70px rgba(18,26,22,0.14)', border: dark ? `1px solid ${L.line}` : 'none' })}>
      <div style={flex({ justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Poppins', fontSize: 26, color: accent })}>
        <span>‹ Notes</span><span style={{ fontWeight: 600 }}>Done</span>
      </div>
      <span style={{ fontFamily: 'Poppins', fontSize: 20, color: soft, marginTop: 22, alignSelf: 'center' }}>{date || 'Today at 9:41 AM'}</span>
      <div style={flex({ fontFamily: 'Poppins', fontWeight: 600, fontSize: size(title, [[40, 44], [70, 38]], 34), lineHeight: 1.2, color: ink, marginTop: 22 })}>{title}</div>
      <div style={col({ marginTop: 18 })}>
        {rows.slice(0, 7).map((r, i) => (
          <div key={i} style={flex({ alignItems: 'flex-start', marginTop: 14, fontFamily: 'Poppins', fontSize: size(r, [[45, 31], [80, 28]], 26), lineHeight: 1.35, color: ink })}>
            <span style={{ color: accent, width: 40, flexShrink: 0 }}>{`${i + 1}.`}</span><span style={{ display: 'flex' }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* A search box with the owner's own question and the suggestions under it. */
function SearchCard({ L, query, rows }: { L: Look; query: string; rows: string[] }) {
  const dark = isDark(L);
  const box = dark ? '#22302A' : '#FFFFFF', ink = dark ? '#EEF1EC' : '#1B1F1C', soft = dark ? '#9DAAA2' : '#7A837E';
  const glass = (
    <div style={flex({ width: 34, height: 34, position: 'relative', flexShrink: 0 })}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 24, height: 24, borderRadius: 12, border: `3px solid ${soft}` }} />
      <div style={{ position: 'absolute', left: 21, top: 22, width: 12, height: 3, background: soft, transform: 'rotate(45deg)' }} />
    </div>
  );
  return (
    <div style={col({ background: box, borderRadius: 34, boxShadow: dark ? 'none' : '0 30px 70px rgba(18,26,22,0.14)', border: dark ? `1px solid ${L.line}` : `1px solid ${L.line}`, overflow: 'hidden' })}>
      <div style={flex({ alignItems: 'center', gap: 24, padding: '32px 36px', borderBottom: rows.length ? `1px solid ${dark ? L.line : '#E6E9E6'}` : 'none' })}>
        {glass}
        <span style={{ fontFamily: 'Poppins', fontSize: size(query, [[34, 38], [55, 33]], 29), color: ink, lineHeight: 1.3 }}>{query}</span>
        <div style={{ width: 3, height: 40, background: L.accent }} />
      </div>
      {rows.slice(0, 4).map((r, i) => (
        <div key={i} style={flex({ alignItems: 'center', gap: 24, padding: '22px 36px', fontFamily: 'Poppins', fontSize: 27, color: soft })}>
          {glass}<span style={{ display: 'flex' }}>{r}</span>
        </div>
      ))}
    </div>
  );
}

/* Red flags and green flags, the semantic colours kept quiet. */
function Flags({ L, d }: { L: Look; d: Design }) {
  const dark = isDark(L);
  const red = dark ? '#D9907E' : '#A4513F', green = dark ? '#9FC2A4' : '#3E6B4A';
  const flag = (c: string) => (
    <div style={flex({ width: 28, height: 34, position: 'relative', flexShrink: 0, marginRight: 20, marginTop: 2 })}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 3, height: 34, background: c }} />
      <div style={{ position: 'absolute', left: 3, top: 0, width: 22, height: 16, background: c }} />
    </div>
  );
  const side = (s: { label: string; items: string[] } | undefined, c: string) => (
    <div style={col({ marginTop: 30 })}>
      <span style={{ fontFamily: 'Poppins', fontWeight: 600, fontSize: 22, letterSpacing: 3, color: c, marginBottom: 6 }}>{(s?.label ?? '').toUpperCase()}</span>
      {(s?.items ?? []).slice(0, 4).map((it, i) => (
        <div key={i} style={flex({ alignItems: 'flex-start', padding: '16px 0', borderBottom: `1px solid ${L.line}`, fontFamily: 'Poppins', fontSize: size(it, [[50, 29], [80, 26]], 24), lineHeight: 1.35, color: L.ink })}>{flag(c)}<span style={{ display: 'flex' }}>{it}</span></div>
      ))}
    </div>
  );
  return <div style={col({ marginTop: 6 })}>{side(d.left ?? { label: 'Red flags', items: [] }, red)}{side(d.right ?? { label: 'Green flags', items: [] }, green)}</div>;
}

/* A self-score: empty boxes to tick, then what the score means. */
function Quiz({ L, rows, note }: { L: Look; rows: string[]; note?: string }) {
  return (
    <div style={col({ marginTop: 36 })}>
      {rows.slice(0, 7).map((r, i) => (
        <div key={i} style={flex({ alignItems: 'center', padding: '16px 0', borderBottom: `1px solid ${L.line}`, fontFamily: 'Poppins', fontSize: size(r, [[50, 29], [80, 26]], 24), color: L.ink })}>
          <div style={{ width: 34, height: 34, border: `2px solid ${L.accent}`, borderRadius: 7, marginRight: 22, flexShrink: 0 }} />
          <span style={{ display: 'flex', flexGrow: 1 }}>{r}</span>
          <span style={{ fontFamily: 'Lora', fontSize: 20, color: L.soft, marginLeft: 16 }}>+1</span>
        </div>
      ))}
      {note ? <div style={flex({ marginTop: 24, background: L.fill, color: L.ink, padding: '20px 24px', fontFamily: 'Poppins', fontWeight: 500, fontSize: 25, lineHeight: 1.4 })}>{note}</div> : null}
    </div>
  );
}

/* "Comment HANDLED": the comment box, the keyword, what they get. */
function CommentCta({ L, keyword, body }: { L: Look; keyword: string; body?: string }) {
  const dark = isDark(L);
  return (
    <div style={col({ marginTop: 40 })}>
      <div style={flex({ alignItems: 'center', gap: 22, background: dark ? '#22302A' : '#FFFFFF', border: `1px solid ${L.line}`, borderRadius: 999, padding: '20px 26px 20px 20px', boxShadow: dark ? 'none' : '0 20px 50px rgba(18,26,22,0.12)' })}>
        <div style={flex({ width: 60, height: 60, borderRadius: 30, background: L.accent, color: L.onAccent, alignItems: 'center', justifyContent: 'center', fontFamily: 'Lora', fontSize: 30 })}>Y</div>
        <span style={{ fontFamily: 'Poppins', fontWeight: 600, fontSize: 52, letterSpacing: 2, color: L.ink }}>{keyword.toUpperCase()}</span>
        <div style={{ width: 3, height: 50, background: L.accent }} />
        <div style={flex({ flexGrow: 1 })} />
        <span style={{ fontFamily: 'Poppins', fontWeight: 600, fontSize: 26, color: L.accent }}>Post</span>
      </div>
      {body ? <div style={flex({ marginTop: 34, fontFamily: 'Poppins', fontSize: bodySize(body), lineHeight: 1.45, color: L.soft })}>{body}</div> : null}
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
    case 'notes':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><NotesCard L={L} title={title} rows={d.rows ?? []} date={d.note} /><Body L={L} text={body} /></div>);
    case 'search':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><SearchCard L={L} query={title} rows={d.rows ?? []} /><Body L={L} text={body} top={40} strong /></div>);
    case 'flags':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} /><Flags L={L} d={d} /><Body L={L} text={body} /></div>);
    case 'quiz':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} /><Quiz L={L} rows={d.rows ?? []} note={d.note} /></div>);
    case 'comment':
      return (<div style={col({})}><Kicker L={L} text={d.kicker} /><Head L={L} text={title} big /><CommentCta L={L} keyword={d.keyword || 'HANDLED'} body={body} /></div>);
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
    <Frame L={L} head={[(weekNo(p.slot) ? `WEEK ${weekNo(p.slot)}` : ''), kick]} foot={[isCareers(p) ? 'RELÈVE CAREERS' : 'RELEVESTAFFING.COM', d.layout === 'comment' ? 'COMMENT BELOW' : isCareers(p) ? 'APPLY · RELEVESTAFFING.COM' : 'CONSIDER IT HANDLED.']}>
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
    <Frame L={L} head={[(weekNo(p.slot) ? `WEEK ${weekNo(p.slot)}` : ''), label]} foot={['RELEVESTAFFING.COM', first ? `${page}   SWIPE →` : page]}>
      <Page L={L} d={{ ...s, layout, kicker }} title={s.title} body={s.body} big={first || last} />
    </Frame>
  );
}


/* ---------- the hiring graphic (6 Nov 2026) ----------
   ONE framework for every job post, approved by Nona: deep green plaster,
   the real logo, "We are hiring." as the headline, the role under it, then
   ruled rows (the work, hours, pay, who we want, how to apply). The bottom
   sixth stays empty because Instagram covers it. The copy is held to seven
   lines in total so it can never run into that sixth. */
export type HiringCard = { layout: 'hiring'; kicker?: string; quote?: string; sub?: string; hire?: { work?: string; hours?: string; pay?: string; you?: string; apply?: string } };
let hiringBg: string | null = null;
async function loadHiringBg() {
  if (hiringBg) return hiringBg;
  hiringBg = await dataUri('social/hiring-bg.jpg', 'image/jpeg');
  return hiringBg;
}
const clip = (s: string, n: number) => {
  s = s.replace(/\s+/g, ' ').trim(); if (s.length <= n) return s;
  /* Cut at the last clause that fits, never mid-phrase ("post them for the."). */
  const head = s.slice(0, n); let cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf(', '), head.lastIndexOf(': '));
  if (cut < n * 0.5) cut = head.lastIndexOf(' ');
  let t = head.slice(0, cut > 0 ? cut : n).replace(/[,;:\s]+$/, '');
  t = t.replace(/(\s+(the|a|an|and|or|of|for|to|with|in|on|at|your|our|their|that|who))+$/i, '');
  return t.replace(/[.]+$/, '') + '.';
};
export function hiringRows(c: HiringCard): [string, string][] {
  const h = c.hire ?? {};
  const rows: [string, string][] = [];
  if (h.work) rows.push(['THE WORK', clip(h.work, 96)]);
  if (h.hours) rows.push(['HOURS', clip(h.hours, 42)]);
  if (h.pay) rows.push(['PAY', clip(h.pay, 38)]);
  if (h.you) rows.push(['YOU', clip(h.you, 96)]);
  rows.push(['APPLY', clip(h.apply || 'Apply at relevestaffing.com/careers', 44)]);
  return rows;
}
function hiringEl(c: HiringCard, bg: string) {
  const CREAM = '#F3EFE6', PALE = '#B0C4B2', SILVER = '#C9D0CB', SOFT = '#D6DED6', HAIR = '#788C7E';
  const role = clip(c.sub || '', 44);
  const rs = role.length <= 26 ? 64 : role.length <= 34 ? 56 : 48;
  return (
    <div style={flex({ width: W, height: H, position: 'relative', background: '#0E1813' })}>
      <img src={bg} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }} />
      <img src={art!.logoWhite} width={330} height={99} style={{ position: 'absolute', top: 70, left: 78 }} />
      <div style={col({ position: 'absolute', top: 232, left: 90, width: 900 })}>
        <div style={flex({ fontFamily: 'Lora', fontSize: 124, lineHeight: 1.05, color: CREAM })}>{c.quote || 'We are hiring.'}</div>
        <div style={flex({ fontFamily: 'Lora', fontSize: rs, lineHeight: 1.2, color: SILVER, marginTop: 4 })}>{role}</div>
        <div style={col({ marginTop: 44 })}>
          {hiringRows(c).map(([lab, val], i, all) => (
            <div key={lab} style={flex({ borderTop: `1px solid ${HAIR}`, borderBottom: i === all.length - 1 ? `1px solid ${HAIR}` : 'none', padding: '26px 0 20px' })}>
              <div style={flex({ width: 230, paddingTop: 9, fontFamily: 'Poppins', fontWeight: 500, fontSize: 19, letterSpacing: 5, color: PALE })}>{lab}</div>
              <div style={flex({ flex: 1, fontFamily: 'Poppins', fontSize: 31, lineHeight: 1.32, color: lab === 'PAY' || lab === 'APPLY' ? CREAM : SOFT })}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- The Relève Brief: LinkedIn's own look (7 Nov 2026) ----------
   Nona's creative direction gives LinkedIn its own direction: never the
   Instagram graphic. Each day's post is rebuilt as a short editorial report,
   a document of 7 or 8 pages (or one page on card days): a fern masthead,
   typeset paper pages with a margin column, ruled tables, a 2 by 2, the
   method, and a fern back page. 4:5 portrait, body at 30 px or more, page
   numbers and margins the same on every page. Marked by look: 'brief'. */
export const BRIEF_LAYOUTS = ['masthead', 'thesis', 'figure', 'table', 'framework', 'method', 'contrast', 'takeaway', 'close'];
const BR = { paper: '#FAF8F2', ink: '#22302A', body: '#3C463F', muted: '#6E7A71', rule: '#D8DDD6', strong: '#22302A', fern: '#18231D', cream: '#F3EFE6', silver: '#C9D0CB', pale: '#B0C4B2', hair: '#3A4A40' };
type BriefPage = Omit<Design, 'layout'> & { layout?: string; title: string; body?: string; cols?: string[]; table?: string[][]; x?: string; y?: string; quads?: { label: string; text: string }[] };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function briefDate(slot: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:-[a-z_]+-(mon|tue|wed|thu|fri|sat|sun))?/.exec(slot);
  if (!m) return '';
  const add = m[4] ? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(m[4]) : 0;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + add));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function isBrief(p: { format?: string; card?: any; slides?: any[] }) {
  return (p.format === 'card' ? p.card?.look : p.slides?.[0]?.look) === 'brief';
}
const bHead = (s: string, big = false) => big ? size(s, [[30, 96], [48, 86], [70, 76]], 66) : size(s, [[28, 66], [46, 58], [70, 52]], 46);
const bBody = (s: string) => size(s, [[110, 34], [200, 32]], 30);
const SECTION: Record<string, string> = { thesis: 'THE ARGUMENT', figure: 'THE ARITHMETIC', table: 'THE WORKING', framework: 'THE FRAMEWORK', method: 'THE METHOD', contrast: 'THE SHIFT', takeaway: 'THE TAKEAWAY' };

function BriefPaper({ label, foot, children, wide }: { label: string; foot: [string, string]; children: any; wide?: boolean }) {
  return (
    <div style={col({ width: W, height: H, background: BR.paper, padding: '72px 84px 76px', color: BR.ink })}>
      <div style={col({})}>
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center' })}>
          <img src={art!.logoFern} width={Math.round(46 * 1200 / 360)} height={46} style={{ display: 'flex' }} />
          <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 18, letterSpacing: 5, color: BR.muted }}>THE RELÈVE BRIEF</span>
        </div>
        <div style={{ height: 1, background: BR.strong, marginTop: 24 }} />
      </div>
      {wide ? (
        <div style={col({ flexGrow: 1, justifyContent: 'center' })}>
          <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 18, letterSpacing: 5, color: BR.muted, marginBottom: 30 }}>{label}</span>
          {children}
        </div>
      ) : (
        <div style={flex({ flexGrow: 1, alignItems: 'center' })}>
          <div style={col({ width: 196, alignSelf: 'stretch', justifyContent: 'center', borderRight: `1px solid ${BR.rule}`, marginRight: 52 })}>
            <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 18, letterSpacing: 5, lineHeight: 1.6, color: BR.muted, width: 160 }}>{label}</span>
          </div>
          <div style={col({ flex: 1 })}>{children}</div>
        </div>
      )}
      <div style={col({})}>
        <div style={{ height: 1, background: BR.rule, marginBottom: 20 }} />
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center' })}>
          <span style={{ fontFamily: 'Poppins', fontSize: 19, letterSpacing: 1, color: BR.muted }}>{foot[0]}</span>
          <span style={{ fontFamily: 'Lora', fontSize: 24, color: BR.ink }}>{foot[1]}</span>
        </div>
      </div>
    </div>
  );
}
function BriefTitle({ text, size: px }: { text: string; size?: number }) {
  return <div style={flex({ fontFamily: 'Lora', fontSize: px ?? bHead(text), lineHeight: 1.12, color: BR.ink, textWrap: 'balance' } as any)}>{text}</div>;
}
function BriefBody({ text, top = 30 }: { text?: string; top?: number }) {
  if (!text) return null;
  return <div style={flex({ fontFamily: 'Poppins', fontSize: bBody(text), lineHeight: 1.5, color: BR.body, marginTop: top })}>{text}</div>;
}
function briefInner(d: BriefPage): { wide: boolean; el: any } {
  const t = d.title, b = d.body;
  switch (d.layout) {
    case 'figure':
      return { wide: false, el: (
        <div style={col({})}>
          <div style={flex({ fontFamily: 'Lora', fontSize: size(d.number || '', [[5, 190], [8, 150]], 118), lineHeight: 1, color: BR.ink })}>{d.number || ''}</div>
          <div style={flex({ fontFamily: 'Lora', fontSize: 38, lineHeight: 1.2, color: BR.ink, marginTop: 22, textWrap: 'balance' } as any)}>{t}</div>
          <div style={col({ marginTop: 40, borderTop: `2px solid ${BR.strong}` })}>
            {(d.facts ?? []).map((f, i) => (
              <div key={i} style={flex({ alignItems: 'baseline', borderBottom: `1px solid ${BR.rule}`, padding: '20px 0 18px' })}>
                <span style={{ fontFamily: 'Lora', fontSize: 38, color: BR.ink, width: 190 }}>{f.value}</span>
                <span style={{ fontFamily: 'Poppins', fontSize: 30, color: BR.body, flex: 1 }}>{f.label}</span>
              </div>
            ))}
          </div>
          <BriefBody text={b} top={28} />
        </div>) };
    case 'table': {
      const cols = (d.cols ?? []).slice(0, 3); const rows = (d.table ?? []).slice(0, 6);
      const w = (i: number) => cols.length === 3 ? (i === 0 ? 400 : 250) : (i === 0 ? 520 : 392);
      return { wide: true, el: (
        <div style={col({})}>
          <BriefTitle text={t} />
          <div style={col({ marginTop: 44 })}>
            <div style={flex({ borderBottom: `2px solid ${BR.strong}`, paddingBottom: 14 })}>
              {cols.map((c, i) => <span key={i} style={{ width: w(i), fontFamily: 'Poppins', fontWeight: 500, fontSize: 18, letterSpacing: 4, color: BR.muted }}>{c.toUpperCase()}</span>)}
            </div>
            {rows.map((r, j) => (
              <div key={j} style={flex({ borderBottom: `1px solid ${BR.rule}`, padding: '20px 0 18px' })}>
                {cols.map((_, i) => <span key={i} style={{ width: w(i), paddingRight: 18, fontFamily: i === 0 ? 'Poppins' : 'Lora', fontSize: i === 0 ? 30 : 32, color: i === 0 ? BR.body : BR.ink }}>{r[i] ?? ''}</span>)}
              </div>
            ))}
          </div>
          <BriefBody text={b} top={30} />
        </div>) };
    }
    case 'framework': {
      const q = (d.quads ?? []).slice(0, 4);
      const cell = (i: number) => (
        <div style={col({ width: 455, height: 260, padding: i % 2 ? '30px 0 0 40px' : '30px 40px 0 0' })}>
          <span style={{ fontFamily: 'Lora', fontSize: 34, color: BR.ink, lineHeight: 1.15 }}>{q[i]?.label ?? ''}</span>
          <span style={{ fontFamily: 'Poppins', fontSize: 27, color: BR.body, lineHeight: 1.4, marginTop: 12 }}>{q[i]?.text ?? ''}</span>
        </div>
      );
      return { wide: true, el: (
        <div style={col({})}>
          <BriefTitle text={t} />
          <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 17, letterSpacing: 4, color: BR.muted, marginTop: 40 }}>{`↑ ${(d.y || '').toUpperCase()}`}</span>
          <div style={col({ marginTop: 14, position: 'relative', width: 910 })}>
            <div style={flex({ borderBottom: `1px solid ${BR.strong}` })}>{cell(0)}<div style={{ width: 1, background: BR.strong }} />{cell(1)}</div>
            <div style={flex({})}>{cell(2)}<div style={{ width: 1, background: BR.strong }} />{cell(3)}</div>
          </div>
          <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 17, letterSpacing: 4, color: BR.muted, marginTop: 14, alignSelf: 'flex-end' }}>{`${(d.x || '').toUpperCase()} →`}</span>
        </div>) };
    }
    case 'method':
      return { wide: false, el: (
        <div style={col({})}>
          <BriefTitle text={t} />
          <div style={col({ marginTop: 36, borderTop: `2px solid ${BR.strong}` })}>
            {(d.rows ?? []).slice(0, 5).map((r, i) => (
              <div key={i} style={flex({ alignItems: 'baseline', borderBottom: `1px solid ${BR.rule}`, padding: '20px 0 18px' })}>
                <span style={{ fontFamily: 'Lora', fontSize: 34, color: BR.muted, width: 58 }}>{String(i + 1)}</span>
                <span style={{ fontFamily: 'Poppins', fontSize: 30, lineHeight: 1.4, color: BR.ink, flex: 1 }}>{r}</span>
              </div>
            ))}
          </div>
          <BriefBody text={b} top={26} />
        </div>) };
    case 'contrast': {
      const side = (s: { label: string; items: string[] } | undefined, strong: boolean) => (
        <div style={col({ width: 430 })}>
          <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 18, letterSpacing: 4, color: strong ? BR.ink : BR.muted, paddingBottom: 14, borderBottom: `2px solid ${strong ? BR.strong : BR.rule}` }}>{(s?.label ?? '').toUpperCase()}</span>
          {(s?.items ?? []).slice(0, 4).map((it, i) => <span key={i} style={{ fontFamily: 'Poppins', fontSize: 29, lineHeight: 1.4, color: strong ? BR.ink : BR.muted, padding: '18px 0 16px', borderBottom: `1px solid ${BR.rule}` }}>{it}</span>)}
        </div>
      );
      return { wide: true, el: (
        <div style={col({})}>
          <BriefTitle text={t} />
          <div style={flex({ marginTop: 44, justifyContent: 'space-between' })}>{side(d.left, false)}{side(d.right, true)}</div>
          <BriefBody text={b} top={30} />
        </div>) };
    }
    case 'takeaway':
      return { wide: false, el: (
        <div style={col({ borderLeft: `3px solid ${BR.strong}`, paddingLeft: 40 })}>
          <div style={flex({ fontFamily: 'Lora', fontSize: size(t, [[40, 72], [70, 62]], 54), lineHeight: 1.14, color: BR.ink, textWrap: 'balance' } as any)}>{t}</div>
          <BriefBody text={b} top={32} />
        </div>) };
    default: // thesis
      return { wide: false, el: (<div style={col({})}><BriefTitle text={t} size={bHead(t, true)} /><BriefBody text={b} top={40} /></div>) };
  }
}
function briefFern({ top, children, foot, low }: { top: any; children: any; foot: any; low?: boolean }) {
  return (
    <div style={col({ width: W, height: H, background: BR.fern, padding: '80px 88px 80px', color: BR.cream })}>
      {top}
      <div style={col({ flexGrow: 1, justifyContent: low ? 'flex-end' : 'center', paddingBottom: low ? 72 : 0 })}>{children}</div>
      {foot}
    </div>
  );
}
/* The Brief's cover takes the day's look (8 Nov 2026): the wall, the
   magazine page with a plate, or the report lying on a surface. The pages
   inside stay the same report in every look. */
function briefMasthead(d: BriefPage, date: string, pages: number, words: number, dir: Dir = 'wall', ph?: Photos) {
  const mins = Math.max(2, Math.round(words / 200));
  const meta = `${pages} PAGES · ${mins} MINUTE READ`;
  if (dir === 'edition' && ph) {
    return (
      <div style={flex({ width: W, height: H, position: 'relative', background: '#F3EFE6', color: BR.ink })}>
        <div style={flex({ position: 'absolute', top: 76, left: 84, right: 84, justifyContent: 'space-between', alignItems: 'center', paddingBottom: 24, borderBottom: `2px solid ${BR.ink}` })}>
          <img src={art!.logoFern} width={160} height={48} /><span style={smallCaps(BR.ink, { fontSize: 17, letterSpacing: 6 })}>THE RELÈVE BRIEF</span>
        </div>
        <div style={col({ position: 'absolute', top: 228, left: 84, right: 84 })}>
          <span style={smallCaps('#6E7A71', { fontSize: 17, marginBottom: 30 })}>A SHORT REPORT FOR FOUNDERS</span>
          <div style={flex({ fontFamily: 'Lora', fontSize: size(d.title, [[40, 100], [64, 88]], 78), lineHeight: 1.02, letterSpacing: -1.5, color: BR.ink, textWrap: 'balance' } as any)}>{d.title}</div>
        </div>
        <div style={col({ position: 'absolute', top: 720, left: 0, width: W })}>
          <img src={ph.plate} width={W} height={350} style={{ objectFit: 'cover' }} />
          <span style={{ margin: '16px 84px 0', fontFamily: 'Lora', fontStyle: 'italic', fontSize: 22, color: '#6E7A71' }}>{d.body || ph.plateCap}</span>
        </div>
        <div style={flex({ position: 'absolute', left: 84, right: 84, bottom: 92, justifyContent: 'space-between', paddingTop: 20, borderTop: '1px solid #CFD5CC', ...smallCaps('#6E7A71', { letterSpacing: 3 }) })}>
          <span>{meta}</span><span>{date.toUpperCase()}</span>
        </div>
      </div>
    );
  }
  if (dir === 'object' && ph) {
    return (
      <div style={flex({ width: W, height: H, position: 'relative', background: '#2A302B' })}>
        <img src={ph.surface} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
        <div style={{ position: 'absolute', top: 160, left: 150, width: 820, height: 1060, transform: 'rotate(3.4deg)', background: 'linear-gradient(160deg, #F7F3EB, #E9E2D4)', boxShadow: '0 2px 3px rgba(20,24,18,0.25), 0 26px 60px rgba(20,24,18,0.30)' }} />
        <div style={col({ position: 'absolute', top: 130, left: 110, width: 840, height: 1080, transform: 'rotate(-1.6deg)', background: BR.fern, boxShadow: '0 1px 2px rgba(20,24,18,0.35), 0 14px 30px rgba(20,24,18,0.32), 0 46px 96px rgba(20,24,18,0.36)', padding: '70px 72px 64px', color: BR.cream })}>
          <div style={flex({ justifyContent: 'space-between', alignItems: 'center', paddingBottom: 24, borderBottom: `1px solid ${BR.hair}` })}>
            <img src={art!.logoWhite} width={170} height={51} /><span style={smallCaps(BR.silver, { fontSize: 16, letterSpacing: 6 })}>THE RELÈVE BRIEF</span>
          </div>
          <div style={col({ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 56 })}>
            <span style={smallCaps(BR.pale, { fontSize: 17, marginBottom: 30 })}>A SHORT REPORT FOR FOUNDERS</span>
            <div style={flex({ fontFamily: 'Lora', fontSize: size(d.title, [[40, 84], [64, 74]], 66), lineHeight: 1.06, color: BR.cream, textWrap: 'balance' } as any)}>{d.title}</div>
            {d.body ? <div style={flex({ fontFamily: 'Poppins', fontWeight: 300, fontSize: 28, lineHeight: 1.5, color: BR.silver, marginTop: 30 })}>{d.body}</div> : null}
          </div>
          <div style={flex({ justifyContent: 'space-between', paddingTop: 20, borderTop: `1px solid ${BR.hair}`, ...smallCaps(BR.silver, { fontSize: 17, letterSpacing: 3 }) })}>
            <span>{meta}</span><span>{date.toUpperCase()}</span>
          </div>
        </div>
      </div>
    );
  }
  if (dir === 'wall' && ph) {
    return (
      <div style={flex({ width: W, height: H, position: 'relative', background: BR.fern })}>
        <img src={ph.wall} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
        <div style={col({ position: 'absolute', top: 0, left: 0, width: W, height: H, padding: '80px 88px 80px', color: BR.cream })}>
          <div style={flex({ justifyContent: 'space-between', alignItems: 'center', paddingBottom: 26, borderBottom: '1px solid rgba(201,208,203,0.32)' })}>
            <img src={art!.logoWhite} width={190} height={57} /><span style={smallCaps(BR.silver, { fontSize: 17, letterSpacing: 6 })}>THE RELÈVE BRIEF</span>
          </div>
          <div style={col({ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 80 })}>
            <span style={smallCaps(BR.pale, { fontSize: 19, letterSpacing: 6, marginBottom: 36 })}>A SHORT REPORT FOR FOUNDERS</span>
            <div style={flex({ fontFamily: 'Lora', fontSize: bHead(d.title, true) + 6, lineHeight: 1.06, color: BR.cream, width: 860, textWrap: 'balance' } as any)}>{d.title}</div>
            {d.body ? <div style={flex({ fontFamily: 'Poppins', fontWeight: 300, fontSize: 30, lineHeight: 1.5, color: '#D6DED6', marginTop: 34, width: 760 })}>{d.body}</div> : null}
          </div>
          <div style={flex({ justifyContent: 'space-between', paddingTop: 22, borderTop: '1px solid rgba(201,208,203,0.32)', ...smallCaps(BR.silver, { fontSize: 19, letterSpacing: 3 }) })}>
            <span>{meta}</span><span>{date.toUpperCase()}</span>
          </div>
        </div>
      </div>
    );
  }
  return briefFern({
    low: true,
    top: (<div style={col({})}><img src={art!.logoWhite} width={Math.round(60 * 1200 / 360)} height={60} style={{ display: 'flex' }} /><div style={{ height: 1, background: BR.hair, marginTop: 30 }} /></div>),
    children: (
      <div style={col({ width: 860 })}>
        <span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 19, letterSpacing: 6, color: BR.pale, marginBottom: 40 }}>THE RELÈVE BRIEF</span>
        <div style={flex({ fontFamily: 'Lora', fontSize: bHead(d.title, true) + 10, lineHeight: 1.06, color: BR.cream, textWrap: 'balance' } as any)}>{d.title}</div>
        {d.body ? <div style={flex({ fontFamily: 'Poppins', fontSize: 32, lineHeight: 1.45, color: BR.silver, marginTop: 40, width: 780 })}>{d.body}</div> : null}
      </div>),
    foot: (
      <div style={col({})}>
        <div style={{ height: 1, background: BR.hair, marginBottom: 22 }} />
        <div style={flex({ justifyContent: 'space-between', fontFamily: 'Poppins', fontSize: 20, letterSpacing: 2, color: BR.pale })}>
          <span>{`${pages} PAGES · ${mins} MINUTE READ`}</span><span>{date.toUpperCase()}</span>
        </div>
      </div>)
  });
}
function briefClose(d: BriefPage, page: string) {
  return briefFern({
    top: (<div style={col({})}><span style={{ fontFamily: 'Poppins', fontWeight: 500, fontSize: 19, letterSpacing: 6, color: BR.pale }}>WHAT TO DO NEXT</span><div style={{ height: 1, background: BR.hair, marginTop: 26 }} /></div>),
    children: (
      <div style={col({ width: 860 })}>
        <div style={flex({ fontFamily: 'Lora', fontSize: bHead(d.title, true), lineHeight: 1.1, color: BR.cream, textWrap: 'balance' } as any)}>{d.title}</div>
        {d.body ? <div style={flex({ fontFamily: 'Poppins', fontSize: 33, lineHeight: 1.45, color: BR.silver, marginTop: 40 })}>{d.body}</div> : null}
        <div style={{ marginTop: 64, display: 'flex' }}><img src={art!.handledCream} width={Math.round(56 * 2755 / 414)} height={56} style={{ display: 'flex' }} /></div>
      </div>),
    foot: (
      <div style={col({})}>
        <div style={{ height: 1, background: BR.hair, marginBottom: 22 }} />
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center' })}>
          <img src={art!.logoWhite} width={Math.round(46 * 1200 / 360)} height={46} style={{ display: 'flex' }} />
          <span style={{ fontFamily: 'Lora', fontSize: 24, color: BR.cream }}>{page}</span>
        </div>
      </div>)
  });
}
async function briefEl(p: Drawable, n: number) {
  const date = briefDate(p.slot);
  if (p.format === 'card') {
    const c = p.card as any;
    const d: BriefPage = { ...c, title: c.quote, body: c.sub, layout: BRIEF_LAYOUTS.includes(c.layout) && !['masthead', 'close'].includes(c.layout) ? c.layout : 'thesis' };
    const { wide, el } = briefInner(d);
    return <BriefPaper label={(c.kicker || SECTION[d.layout as string] || 'THE ARGUMENT').toUpperCase()} foot={[date, 'relevestaffing.com']} wide={wide}>{el}</BriefPaper>;
  }
  const pages = (p.slides ?? []) as BriefPage[];
  const total = pages.length, s = pages[n];
  const page = `${n + 1} / ${total}`;
  const layout = n === 0 ? 'masthead' : n === total - 1 ? 'close' : (BRIEF_LAYOUTS.includes(s.layout as string) && !['masthead', 'close'].includes(s.layout as string) ? s.layout : 'thesis');
  if (layout === 'masthead') {
    const words = pages.map(x => [x.title, x.body, ...(x.rows ?? []), ...((x.table ?? []).flat())].join(' ')).join(' ').split(/\s+/).length;
    return briefMasthead(s, date, total, words, dirFor(p as any), await photosFor(p));
  }
  if (layout === 'close') return briefClose(s, page);
  const d = { ...s, layout } as BriefPage;
  const { wide, el } = briefInner(d);
  return <BriefPaper label={(s.kicker || SECTION[layout as string] || '').toUpperCase()} foot={[date, page]} wide={wide}>{el}</BriefPaper>;
}

/* ---------- The three looks (8 November 2026) ----------
   Nona chose all three directions from the framework canvas, rotating:
   A, The Wall: the website's plaster wall with window light on covers and
     single posts, limewash paper inside.
   B, The Edition: a magazine. Cream pages with photographic plates and
     captions, fern spreads inside, folios and page numbers.
   C, The Object: the working page as a real sheet of paper photographed on
     linen, stone or plaster, with real shadow.
   Each day takes one look, A B C A B C, shifted every week, so no two days
   in a row match and the top three grid tiles always differ. The layouts
   (statement, rules, number, notes ...) are the same in every look. */
export type Dir = 'wall' | 'edition' | 'object';
const DIRS: Dir[] = ['wall', 'edition', 'object'];
const FEED_NATIVE = ['notes', 'search', 'comment'];
const hashOf = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
export function dirFor(p: { slot: string; format?: string; card?: any }): Dir {
  const m = /^(\d{4})-(\d{2})-(\d{2})-[a-z_]+-(mon|tue|wed|thu|fri|sat|sun)/.exec(p.slot);
  let d: Dir;
  if (!m) d = DIRS[hashOf(p.slot) % 3];
  else {
    const day = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(m[4]);
    const week = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / (7 * 86400000));
    d = DIRS[(day + week) % 3];
  }
  /* A phone note or search box on a sheet of paper is a card in a card. */
  if (d === 'object' && p.format === 'card' && FEED_NATIVE.includes(p.card?.layout)) d = 'edition';
  return d;
}
type Photo = { f: string; cap: string };
const WALLS: Photo[] = [{ f: 'hero-wall.jpg', cap: '' }, { f: 'wall-sprig.jpg', cap: '' }, { f: 'wall-evening.jpg', cap: '' }];
const PLATES: Photo[] = [
  { f: 'arch.jpg', cap: 'Light through an arched window.' }, { f: 'niche.jpg', cap: 'An arched niche in afternoon light.' },
  { f: 'water.jpg', cap: 'Low light on dark water.' }, { f: 'stone.jpg', cap: 'River stones after rain.' },
  { f: 'dune.jpg', cap: 'Wind across a pale dune.' }, { f: 'incense.jpg', cap: 'Smoke against stucco.' }, { f: 'shadow.jpg', cap: 'Palm shadow on plaster.' }
];
const SURFACES: Photo[] = [{ f: 'linen.jpg', cap: '' }, { f: 'stone.jpg', cap: '' }, { f: 'plaster-deep.jpg', cap: '' }, { f: 'shadow.jpg', cap: '' }];
const pick = <T,>(list: T[], key: string, salt = '') => list[hashOf(key + salt) % list.length];
/* The post's own key, so every slide of one carousel shares its photographs. */
const postKey = (slot: string) => slot.replace(/-(li_page_client|li_page_careers|li_group|li|ic|pg|pc)$/, '');
let frames: Record<string, string> = {};
async function photo(f: string) {
  if (!frames[f]) frames[f] = await dataUri(`social/frames/${f}`, 'image/jpeg');
  return frames[f];
}
async function photosFor(p: Drawable) {
  const k = postKey(p.slot);
  const wall = pick(WALLS, k), wall2 = pick(WALLS, k, 'last'), plate = pick(PLATES, k), plate2 = pick(PLATES, k, 'b'), surface = pick(SURFACES, k);
  const [w1, w2, pl1, pl2, su, lime] = await Promise.all([photo(wall.f), photo(wall2.f), photo(plate.f), photo(plate2.f), photo(surface.f), photo('limewash.jpg')]);
  return { wall: w1, wallLast: w2, plate: pl1, plateCap: plate.cap, plate2: pl2, plate2Cap: plate2.cap, surface: su, limewash: lime };
}
type Photos = Awaited<ReturnType<typeof photosFor>>;
const Img = ({ src, s }: { src: string; s: any }) => <img src={src} width={s.width} height={s.height} style={{ position: 'absolute', objectFit: 'cover', ...s }} />;
const smallCaps = (color: string, extra: any = {}) => ({ fontFamily: 'Poppins', fontWeight: 500, fontSize: 18, letterSpacing: 5, color, ...extra });

type Slot = { kind: 'cover' | 'inside' | 'last' | 'card'; n: number; total: number; d: Design; title: string; body?: string; label: string; page: string };
function slotOf(p: Drawable, n: number): Slot {
  if (p.format === 'card') {
    const c = p.card as CardD;
    const layout = (c.layout && c.layout !== 'cover' && c.layout !== 'step' ? c.layout : 'statement') as Layout;
    return { kind: 'card', n: 0, total: 1, d: { ...c, layout, kicker: undefined }, title: c.quote, body: c.sub, label: (c.kicker || '').toUpperCase(), page: '' };
  }
  const slides = p.slides as SlideD[];
  const s = slides[n], total = slides.length, first = n === 0, last = n === total - 1;
  const layout: Layout = s.layout && !(first && s.layout === 'cta') ? s.layout : first ? 'cover' : last ? 'cta' : 'step';
  const kicker = first ? (s.kicker || (p.channel === 'li_group' ? 'FREE TRAINING' : 'FIELD GUIDE')) : layout === 'step' ? (s.kicker || `STEP ${n} OF ${total - 2}`) : s.kicker;
  return { kind: first ? 'cover' : last ? 'last' : 'inside', n, total, d: { ...s, layout, kicker }, title: s.title, body: s.body, label: (kicker || '').toUpperCase(), page: `${n + 1} / ${total}` };
}
const statementish = (l?: string) => !l || l === 'statement' || l === 'cover' || l === 'cta' || l === 'step';

/* A, The Wall */
function wallPhoto(src: string, L: Look, sl: Slot, foot: any, tagline = false) {
  return (
    <div style={flex({ width: W, height: H, position: 'relative', background: L.bg })}>
      <Img src={src} s={{ top: 0, left: 0, width: W, height: H }} />
      <img src={art!.logoWhite} width={190} height={57} style={{ position: 'absolute', top: 84, left: 84 }} />
      <div style={col({ position: 'absolute', left: 84, right: 84, bottom: foot ? 214 : 150 })}>
        <Page L={L} d={{ ...sl.d, kicker: sl.label || undefined }} title={sl.title} body={sl.body} big />
        {tagline ? <div style={flex({ marginTop: 44 })}><Handled L={L} h={46} /></div> : null}
      </div>
      {foot}
    </div>
  );
}
function wallFoot(L: Look, right: string) {
  return (
    <div style={flex({ position: 'absolute', left: 84, right: 84, bottom: 92, justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${L.line}`, paddingTop: 22, ...smallCaps('#C9D0CB', { letterSpacing: 4 }) })}>
      <span>RELEVESTAFFING.COM</span><span style={{ fontFamily: 'Lora', fontSize: 24, letterSpacing: 0, color: L.ink }}>{right}</span>
    </div>
  );
}
function paperPage(src: string | null, L: Look, sl: Slot, right: string, bg = L.bg) {
  return (
    <div style={col({ width: W, height: H, position: 'relative', background: bg, color: L.ink })}>
      {src ? <Img src={src} s={{ top: 0, left: 0, width: W, height: H }} /> : null}
      <div style={col({ position: 'absolute', top: 0, left: 0, width: W, height: H, padding: '80px 84px 76px' })}>
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center', paddingBottom: 24, borderBottom: `1px solid ${L.strong}` })}>
          <Logo L={L} h={46} /><span style={smallCaps(isDark(L) ? L.accent : '#6E7A71')}>{sl.label}</span>
        </div>
        {sl.d.layout === 'step' && sl.n > 0 ? (
          <div style={col({ flexGrow: 1, justifyContent: 'center' })}>
            <div style={flex({ alignItems: 'flex-start' })}>
              <div style={flex({ width: 170, flexShrink: 0, marginTop: -4, fontFamily: 'Lora', fontSize: 150, lineHeight: 1, color: '#B0C4B2' })}>{String(sl.n)}</div>
              <div style={col({ flex: 1 })}><Page L={L} d={{ ...sl.d, kicker: undefined }} title={sl.title} body={sl.body} big /></div>
            </div>
          </div>
        ) : (
          <div style={col({ flexGrow: 1, justifyContent: 'center' })}>
            <Page L={L} d={{ ...sl.d, kicker: undefined }} title={sl.title} body={sl.body} big={sl.kind === 'card'} />
          </div>
        )}
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, borderTop: `1px solid ${L.line}` })}>
          <span style={smallCaps(isDark(L) ? L.accent : '#6E7A71', { letterSpacing: 4 })}>RELEVESTAFFING.COM</span>
          {right === 'HANDLED' ? <Handled L={L} h={40} /> : <span style={{ fontFamily: 'Lora', fontSize: 24, color: L.ink }}>{right}</span>}
        </div>
      </div>
    </div>
  );
}
function wallEl(p: Drawable, sl: Slot, ph: Photos) {
  const D = LOOKS.wallDark, P = LOOKS.cream;
  if (sl.kind === 'cover') return wallPhoto(ph.wall, D, sl, wallFoot(D, `${sl.page}`));
  if (sl.kind === 'last') return wallPhoto(ph.wallLast, D, sl, wallFoot(D, sl.page), true);
  if (sl.kind === 'card') return statementish(sl.d.layout) ? wallPhoto(ph.wall, D, sl, null, true) : paperPage(ph.limewash, P, sl, 'HANDLED');
  return paperPage(ph.limewash, P, sl, sl.page);
}

/* B, The Edition */
function folio(L: Look, left: any, right: string) {
  return (
    <div style={flex({ position: 'absolute', top: 76, left: 84, right: 84, justifyContent: 'space-between', alignItems: 'center' })}>
      {left}<span style={smallCaps(isDark(L) ? L.accent : '#6E7A71')}>{right}</span>
    </div>
  );
}
function edFoot(L: Look, right: string) {
  return (
    <div style={flex({ position: 'absolute', left: 84, right: 84, bottom: 92, justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${L.strong}`, paddingTop: 20 })}>
      <span style={smallCaps(isDark(L) ? L.accent : '#6E7A71', { letterSpacing: 4 })}>RELEVESTAFFING.COM</span>
      <span style={{ fontFamily: 'Lora', fontSize: 24, color: L.ink }}>{right}</span>
    </div>
  );
}
const caption = (text: string, L: Look) => <span style={{ fontFamily: 'Lora', fontStyle: 'italic', fontSize: 20, color: isDark(L) ? L.accent : '#6E7A71', marginTop: 14 }}>{text}</span>;
function editionEl(p: Drawable, sl: Slot, ph: Photos) {
  const C = LOOKS.cream, F = LOOKS.fern;
  const month = editionMonth(p.slot);
  if (sl.kind === 'cover') {
    const hs = size(sl.title, [[24, 124], [40, 106], [56, 90], [72, 80]], 70);
    return (
      <div style={flex({ width: W, height: H, position: 'relative', background: C.bg, color: C.ink })}>
        {folio(C, <Logo L={C} h={45} />, `${month}${sl.label ? ` · ${sl.label}` : ''}`)}
        <div style={col({ position: 'absolute', top: 196, left: 84, width: 330 })}>
          <span style={smallCaps('#6E7A71', { fontSize: 17 })}>{p.channel === 'li_group' ? 'FREE TRAINING' : 'THE GUIDE'}</span>
          {sl.body ? <div style={flex({ marginTop: 22, fontFamily: 'Poppins', fontWeight: 300, fontSize: 27, lineHeight: 1.55, color: C.soft })}>{sl.body}</div> : null}
        </div>
        <div style={col({ position: 'absolute', top: 196, right: 84, width: 520 })}>
          <img src={ph.plate} width={520} height={600} style={{ objectFit: 'cover' }} />
          {caption(`Plate I. ${ph.plateCap}`, C)}
        </div>
        <div style={flex({ position: 'absolute', left: 80, right: 64, top: 880, fontFamily: 'Lora', fontSize: hs, lineHeight: 1.0, letterSpacing: -2, color: C.ink, textWrap: 'balance' } as any)}>{sl.title}</div>
        {edFoot(C, sl.page)}
      </div>
    );
  }
  if (sl.kind === 'last' || (sl.kind === 'card' && statementish(sl.d.layout))) {
    const plate = sl.kind === 'last' ? ph.plate2 : ph.plate;
    return (
      <div style={flex({ width: W, height: H, position: 'relative', background: C.bg, color: C.ink })}>
        <Img src={plate} s={{ left: 0, bottom: 0, width: W, height: 720 }} />
        <div style={col({ position: 'absolute', top: 0, left: 0, width: W, height: 630, background: C.bg, padding: '76px 84px 0' })}>
          <div style={flex({ justifyContent: 'space-between', alignItems: 'center' })}>
            <Logo L={C} h={45} /><span style={smallCaps('#6E7A71', { fontSize: 17 })}>{sl.kind === 'last' ? sl.page : (sl.label || month)}</span>
          </div>
          <div style={flex({ marginTop: 60, fontFamily: 'Lora', fontSize: size(sl.title, [[40, 84], [70, 72]], 62), lineHeight: 1.05, letterSpacing: -1, color: C.ink, textWrap: 'balance' } as any)}>{sl.title}</div>
          {sl.body ? <div style={flex({ marginTop: 26, fontFamily: 'Lora', fontStyle: 'italic', fontSize: 26, lineHeight: 1.45, color: C.soft })}>{sl.body}</div> : null}
        </div>
      </div>
    );
  }
  /* Inside pages alternate a fern spread and a cream page. A step or a
     plain statement sets as two columns; the other layouts run full width. */
  const L = sl.kind === 'inside' && sl.n % 2 === 1 ? F : C;
  if (statementish(sl.d.layout) && sl.body) {
    return (
      <div style={flex({ width: W, height: H, position: 'relative', background: L.bg, color: L.ink })}>
        {folio(L, <span style={smallCaps(isDark(L) ? L.accent : '#6E7A71')}>{p.channel === 'li_group' ? 'FREE TRAINING' : 'THE GUIDE'}</span>, sl.label)}
        <div style={flex({ position: 'absolute', top: 170, bottom: 170, left: 84, right: 84, alignItems: 'center' })}>
          <div style={flex({ width: 400, fontFamily: 'Lora', fontSize: size(sl.title, [[24, 80], [44, 66]], 56), lineHeight: 1.05, color: L.ink, textWrap: 'balance' } as any)}>{sl.title}</div>
          <div style={flex({ width: 456, marginLeft: 56, borderLeft: `1px solid ${L.line}`, paddingLeft: 44, fontFamily: 'Poppins', fontWeight: 300, fontSize: size(sl.body, [[140, 32], [260, 29]], 27), lineHeight: 1.6, color: L.soft })}>{sl.body}</div>
        </div>
        {edFoot(L, sl.page || month)}
      </div>
    );
  }
  return (
    <div style={col({ width: W, height: H, position: 'relative', background: L.bg, color: L.ink })}>
      {folio(L, sl.kind === 'card' ? <Logo L={L} h={45} /> : <span style={smallCaps(isDark(L) ? L.accent : '#6E7A71')}>{p.channel === 'li_group' ? 'FREE TRAINING' : 'THE GUIDE'}</span>, sl.label || month)}
      <div style={col({ position: 'absolute', top: 170, left: 84, right: 84, bottom: 170, justifyContent: 'center' })}>
        <Page L={L} d={{ ...sl.d, kicker: undefined }} title={sl.title} body={sl.body} big={sl.kind === 'card'} />
      </div>
      {edFoot(L, sl.page || month)}
    </div>
  );
}
function editionMonth(slot: string) {
  const m = /^(\d{4})-(\d{2})/.exec(slot); if (!m) return '';
  return `${MONTHS[+m[2] - 1].toUpperCase()} ${m[1]}`;
}

/* C, The Object */
function objectEl(p: Drawable, sl: Slot, ph: Photos) {
  const P = LOOKS.cream;
  const tilt = sl.kind === 'cover' ? -2.2 : sl.kind === 'card' ? -1.6 : sl.n % 2 ? 1.5 : -1.3;
  const paper = 'linear-gradient(162deg, #FCFAF5 0%, #F4EFE6 55%, #ECE5D8 100%)';
  const shadow = '0 1px 2px rgba(20,24,18,0.28), 0 12px 26px rgba(20,24,18,0.26), 0 40px 80px rgba(20,24,18,0.30), 0 80px 130px rgba(20,24,18,0.16)';
  return (
    <div style={flex({ width: W, height: H, position: 'relative', background: '#2A302B' })}>
      <Img src={ph.surface} s={{ top: 0, left: 0, width: W, height: H }} />
      {sl.kind === 'inside' || sl.kind === 'last' ? <div style={{ position: 'absolute', top: 158, left: 132, width: 830, height: 1040, transform: `rotate(${-tilt * 1.8}deg)`, background: 'linear-gradient(160deg, #F2EDE3, #E5DED0)', boxShadow: '0 2px 3px rgba(20,24,18,0.25), 0 24px 50px rgba(20,24,18,0.30)' }} /> : null}
      <div style={col({ position: 'absolute', top: 144, left: 116, width: 848, height: 1062, transform: `rotate(${tilt}deg)`, backgroundImage: paper, boxShadow: shadow, padding: '62px 66px 54px', color: P.ink })}>
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center', paddingBottom: 22, borderBottom: `1px solid ${P.strong}` })}>
          <Logo L={P} h={42} /><span style={smallCaps('#6E7A71', { fontSize: 16 })}>{sl.label}</span>
        </div>
        <div style={col({ flexGrow: 1, justifyContent: 'center' })}>
          <Page L={P} d={{ ...sl.d, kicker: undefined }} title={sl.title} body={sl.body} big={sl.kind !== 'inside'} />
        </div>
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center', paddingTop: 18, borderTop: `1px solid ${P.line}` })}>
          {sl.kind === 'card' || sl.kind === 'last' ? <Handled L={P} h={40} /> : <span style={smallCaps('#6E7A71', { fontSize: 16, letterSpacing: 4 })}>RELEVESTAFFING.COM</span>}
          <span style={sl.page ? { fontFamily: 'Lora', fontSize: 23, color: P.ink } : smallCaps('#6E7A71', { fontSize: 16, letterSpacing: 4 })}>{sl.page || 'RELEVESTAFFING.COM'}</span>
        </div>
      </div>
    </div>
  );
}

async function threeLooksEl(p: Drawable, n: number) {
  const sl = slotOf(p, n);
  const ph = await photosFor(p);
  const d = dirFor(p as any);
  return d === 'wall' ? wallEl(p, sl, ph) : d === 'edition' ? editionEl(p, sl, ph) : objectEl(p, sl, ph);
}

/* One image of a post as PNG bytes. n counts from 0. */
export async function renderSlidePng(p: Drawable, n: number): Promise<Buffer> {
  /* A post may name its look (card.look or the first slide's look). */
  const named = (p.format === 'card' ? (p.card as any)?.look : (p.slides as any)?.[0]?.look) as Look['key'] | undefined;
  const L = named && LOOKS[named] ? LOOKS[named] : lookFor(p.slot);
  await loadArt();
  const hiring = p.format === 'card' && (p.card as any)?.layout === 'hiring';
  /* Named Ledger looks (older posts) keep their look; everything else takes
     the day's look of the three (8 Nov 2026). */
  const el = hiring ? hiringEl(p.card as any, await loadHiringBg())
    : isBrief(p as any) ? await briefEl(p, n)
    : named && LOOKS[named] ? (p.format === 'card' ? cardEl(p, L) : slideEl(p, L, n))
    : await threeLooksEl(p, n);
  const res = new ImageResponse(el, { width: W, height: H, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

/* Instagram accepts JPEG only. */
export function pngToJpeg(png: Buffer, quality = 90): Buffer {
  const img = PNG.sync.read(png);
  return Buffer.from(jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality).data);
}
