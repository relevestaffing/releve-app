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
type Art = { logoFern: string; logoWhite: string; handled: string; handledCream: string };
let art: Art | null = null;
async function loadArt(): Promise<Art> {
  if (art) return art;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');
  const uri = async (f: string) => `data:image/png;base64,${Buffer.from(await (await fetch(`${base}/${f}`)).arrayBuffer()).toString('base64')}`;
  const [a, b, c, d] = await Promise.all([uri('logo-fern.png'), uri('logo-white.png'), uri('consider-it-handled.png'), uri('consider-it-handled-cream.png')]);
  art = { logoFern: a, logoWhite: b, handled: c, handledCream: d };
  return art;
}
const isDark = (L: { key: string }) => L.key === 'ink' || L.key === 'night';
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
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');
  const get = (f: string) => fetch(`${base}/fonts/${f}`).then(r => r.arrayBuffer());
  const [m, g4, g5, g6, gm] = await Promise.all([
    get('Lora-Regular.woff'), get('Geist-Regular.ttf'), get('Geist-Medium.ttf'), get('Geist-SemiBold.ttf'), get('GeistMono-Medium.ttf')
  ]);
  fonts = [
    { name: 'Lora', data: m, weight: 400, style: 'normal' },
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
        <Logo L={L} />
        <span>{right}</span>
      </div>
    );
  }
  const ledger = L.key !== 'night';
  return (
    <div style={col({})}>
      <div style={flex({ justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Geist', fontWeight: 500, fontSize: 21, letterSpacing: 4, color: L.ink })}>
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
      <div style={flex({ justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Geist', fontSize: 21, letterSpacing: 2, color: L.soft })}>
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
  return <div style={flex({ fontFamily: 'Lora', fontSize: headSize(text, big), lineHeight: 1.06, color: L.ink })}>{text}</div>;
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

/* ---------- the feed-native and client-pulling layouts (31 Oct) ---------- */

/* An iPhone Notes page, in Relève colours. */
function NotesCard({ L, title, rows, date }: { L: Look; title: string; rows: string[]; date?: string }) {
  const dark = L.key === 'ink' || L.key === 'night';
  const paper = dark ? '#1E2A24' : '#FFFFFF', ink = dark ? '#EEF1EC' : '#1B1F1C', soft = dark ? '#9DAAA2' : '#8A928D', accent = dark ? '#B0C4B2' : '#35443A';
  return (
    <div style={col({ background: paper, borderRadius: 34, padding: '34px 44px 40px', boxShadow: dark ? 'none' : '0 30px 70px rgba(18,26,22,0.14)', border: dark ? `1px solid ${L.line}` : 'none' })}>
      <div style={flex({ justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Geist', fontSize: 26, color: accent })}>
        <span>‹ Notes</span><span style={{ fontWeight: 600 }}>Done</span>
      </div>
      <span style={{ fontFamily: 'Geist', fontSize: 20, color: soft, marginTop: 22, alignSelf: 'center' }}>{date || 'Today at 9:41 AM'}</span>
      <div style={flex({ fontFamily: 'Geist', fontWeight: 600, fontSize: size(title, [[40, 44], [70, 38]], 34), lineHeight: 1.2, color: ink, marginTop: 22 })}>{title}</div>
      <div style={col({ marginTop: 18 })}>
        {rows.slice(0, 7).map((r, i) => (
          <div key={i} style={flex({ alignItems: 'flex-start', marginTop: 14, fontFamily: 'Geist', fontSize: size(r, [[45, 31], [80, 28]], 26), lineHeight: 1.35, color: ink })}>
            <span style={{ color: accent, width: 40, flexShrink: 0 }}>{`${i + 1}.`}</span><span style={{ display: 'flex' }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* A search box with the owner's own question and the suggestions under it. */
function SearchCard({ L, query, rows }: { L: Look; query: string; rows: string[] }) {
  const dark = L.key === 'ink' || L.key === 'night';
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
        <span style={{ fontFamily: 'Geist', fontSize: size(query, [[34, 38], [55, 33]], 29), color: ink, lineHeight: 1.3 }}>{query}</span>
        <div style={{ width: 3, height: 40, background: L.accent }} />
      </div>
      {rows.slice(0, 4).map((r, i) => (
        <div key={i} style={flex({ alignItems: 'center', gap: 24, padding: '22px 36px', fontFamily: 'Geist', fontSize: 27, color: soft })}>
          {glass}<span style={{ display: 'flex' }}>{r}</span>
        </div>
      ))}
    </div>
  );
}

/* Red flags and green flags, the semantic colours kept quiet. */
function Flags({ L, d }: { L: Look; d: Design }) {
  const dark = L.key === 'ink' || L.key === 'night';
  const red = dark ? '#D9907E' : '#A4513F', green = dark ? '#9FC2A4' : '#3E6B4A';
  const flag = (c: string) => (
    <div style={flex({ width: 28, height: 34, position: 'relative', flexShrink: 0, marginRight: 20, marginTop: 2 })}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 3, height: 34, background: c }} />
      <div style={{ position: 'absolute', left: 3, top: 0, width: 22, height: 16, background: c }} />
    </div>
  );
  const side = (s: { label: string; items: string[] } | undefined, c: string) => (
    <div style={col({ marginTop: 30 })}>
      <span style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 22, letterSpacing: 3, color: c, marginBottom: 6 }}>{(s?.label ?? '').toUpperCase()}</span>
      {(s?.items ?? []).slice(0, 4).map((it, i) => (
        <div key={i} style={flex({ alignItems: 'flex-start', padding: '16px 0', borderBottom: `1px solid ${L.line}`, fontFamily: 'Geist', fontSize: size(it, [[50, 29], [80, 26]], 24), lineHeight: 1.35, color: L.ink })}>{flag(c)}<span style={{ display: 'flex' }}>{it}</span></div>
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
        <div key={i} style={flex({ alignItems: 'center', padding: '16px 0', borderBottom: `1px solid ${L.line}`, fontFamily: 'Geist', fontSize: size(r, [[50, 29], [80, 26]], 24), color: L.ink })}>
          <div style={{ width: 34, height: 34, border: `2px solid ${L.accent}`, borderRadius: 7, marginRight: 22, flexShrink: 0 }} />
          <span style={{ display: 'flex', flexGrow: 1 }}>{r}</span>
          <span style={{ fontFamily: 'Geist Mono', fontSize: 20, color: L.soft, marginLeft: 16 }}>+1</span>
        </div>
      ))}
      {note ? <div style={flex({ marginTop: 24, background: L.fill, color: L.ink, padding: '20px 24px', fontFamily: 'Geist', fontWeight: 500, fontSize: 25, lineHeight: 1.4 })}>{note}</div> : null}
    </div>
  );
}

/* "Comment HANDLED": the comment box, the keyword, what they get. */
function CommentCta({ L, keyword, body }: { L: Look; keyword: string; body?: string }) {
  const dark = L.key === 'ink' || L.key === 'night';
  return (
    <div style={col({ marginTop: 40 })}>
      <div style={flex({ alignItems: 'center', gap: 22, background: dark ? '#22302A' : '#FFFFFF', border: `1px solid ${L.line}`, borderRadius: 999, padding: '20px 26px 20px 20px', boxShadow: dark ? 'none' : '0 20px 50px rgba(18,26,22,0.12)' })}>
        <div style={flex({ width: 60, height: 60, borderRadius: 30, background: L.accent, color: L.onAccent, alignItems: 'center', justifyContent: 'center', fontFamily: 'Lora', fontSize: 30 })}>Y</div>
        <span style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 52, letterSpacing: 2, color: L.ink }}>{keyword.toUpperCase()}</span>
        <div style={{ width: 3, height: 50, background: L.accent }} />
        <div style={flex({ flexGrow: 1 })} />
        <span style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 26, color: L.accent }}>Post</span>
      </div>
      {body ? <div style={flex({ marginTop: 34, fontFamily: 'Geist', fontSize: bodySize(body), lineHeight: 1.45, color: L.soft })}>{body}</div> : null}
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
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');
  const r = await fetch(`${base}/social/hiring-bg.jpg`);
  if (!r.ok) throw new Error('The hiring graphic background is missing.');
  hiringBg = `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
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
              <div style={flex({ width: 230, paddingTop: 9, fontFamily: 'Geist', fontWeight: 500, fontSize: 19, letterSpacing: 5, color: PALE })}>{lab}</div>
              <div style={flex({ flex: 1, fontFamily: 'Geist', fontSize: 31, lineHeight: 1.32, color: lab === 'PAY' || lab === 'APPLY' ? CREAM : SOFT })}>{val}</div>
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
          <span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 18, letterSpacing: 5, color: BR.muted }}>THE RELÈVE BRIEF</span>
        </div>
        <div style={{ height: 1, background: BR.strong, marginTop: 24 }} />
      </div>
      {wide ? (
        <div style={col({ flexGrow: 1, justifyContent: 'center' })}>
          <span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 18, letterSpacing: 5, color: BR.muted, marginBottom: 30 }}>{label}</span>
          {children}
        </div>
      ) : (
        <div style={flex({ flexGrow: 1, alignItems: 'center' })}>
          <div style={col({ width: 196, alignSelf: 'stretch', justifyContent: 'center', borderRight: `1px solid ${BR.rule}`, marginRight: 52 })}>
            <span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 18, letterSpacing: 5, lineHeight: 1.6, color: BR.muted, width: 160 }}>{label}</span>
          </div>
          <div style={col({ flex: 1 })}>{children}</div>
        </div>
      )}
      <div style={col({})}>
        <div style={{ height: 1, background: BR.rule, marginBottom: 20 }} />
        <div style={flex({ justifyContent: 'space-between', alignItems: 'center' })}>
          <span style={{ fontFamily: 'Geist', fontSize: 19, letterSpacing: 1, color: BR.muted }}>{foot[0]}</span>
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
  return <div style={flex({ fontFamily: 'Geist', fontSize: bBody(text), lineHeight: 1.5, color: BR.body, marginTop: top })}>{text}</div>;
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
                <span style={{ fontFamily: 'Geist', fontSize: 30, color: BR.body, flex: 1 }}>{f.label}</span>
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
              {cols.map((c, i) => <span key={i} style={{ width: w(i), fontFamily: 'Geist', fontWeight: 500, fontSize: 18, letterSpacing: 4, color: BR.muted }}>{c.toUpperCase()}</span>)}
            </div>
            {rows.map((r, j) => (
              <div key={j} style={flex({ borderBottom: `1px solid ${BR.rule}`, padding: '20px 0 18px' })}>
                {cols.map((_, i) => <span key={i} style={{ width: w(i), paddingRight: 18, fontFamily: i === 0 ? 'Geist' : 'Lora', fontSize: i === 0 ? 30 : 32, color: i === 0 ? BR.body : BR.ink }}>{r[i] ?? ''}</span>)}
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
          <span style={{ fontFamily: 'Geist', fontSize: 27, color: BR.body, lineHeight: 1.4, marginTop: 12 }}>{q[i]?.text ?? ''}</span>
        </div>
      );
      return { wide: true, el: (
        <div style={col({})}>
          <BriefTitle text={t} />
          <span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 17, letterSpacing: 4, color: BR.muted, marginTop: 40 }}>{`↑ ${(d.y || '').toUpperCase()}`}</span>
          <div style={col({ marginTop: 14, position: 'relative', width: 910 })}>
            <div style={flex({ borderBottom: `1px solid ${BR.strong}` })}>{cell(0)}<div style={{ width: 1, background: BR.strong }} />{cell(1)}</div>
            <div style={flex({})}>{cell(2)}<div style={{ width: 1, background: BR.strong }} />{cell(3)}</div>
          </div>
          <span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 17, letterSpacing: 4, color: BR.muted, marginTop: 14, alignSelf: 'flex-end' }}>{`${(d.x || '').toUpperCase()} →`}</span>
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
                <span style={{ fontFamily: 'Geist', fontSize: 30, lineHeight: 1.4, color: BR.ink, flex: 1 }}>{r}</span>
              </div>
            ))}
          </div>
          <BriefBody text={b} top={26} />
        </div>) };
    case 'contrast': {
      const side = (s: { label: string; items: string[] } | undefined, strong: boolean) => (
        <div style={col({ width: 430 })}>
          <span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 18, letterSpacing: 4, color: strong ? BR.ink : BR.muted, paddingBottom: 14, borderBottom: `2px solid ${strong ? BR.strong : BR.rule}` }}>{(s?.label ?? '').toUpperCase()}</span>
          {(s?.items ?? []).slice(0, 4).map((it, i) => <span key={i} style={{ fontFamily: 'Geist', fontSize: 29, lineHeight: 1.4, color: strong ? BR.ink : BR.muted, padding: '18px 0 16px', borderBottom: `1px solid ${BR.rule}` }}>{it}</span>)}
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
function briefMasthead(d: BriefPage, date: string, pages: number, words: number) {
  const mins = Math.max(2, Math.round(words / 200));
  return briefFern({
    low: true,
    top: (<div style={col({})}><img src={art!.logoWhite} width={Math.round(60 * 1200 / 360)} height={60} style={{ display: 'flex' }} /><div style={{ height: 1, background: BR.hair, marginTop: 30 }} /></div>),
    children: (
      <div style={col({ width: 860 })}>
        <span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 19, letterSpacing: 6, color: BR.pale, marginBottom: 40 }}>THE RELÈVE BRIEF</span>
        <div style={flex({ fontFamily: 'Lora', fontSize: bHead(d.title, true) + 10, lineHeight: 1.06, color: BR.cream, textWrap: 'balance' } as any)}>{d.title}</div>
        {d.body ? <div style={flex({ fontFamily: 'Geist', fontSize: 32, lineHeight: 1.45, color: BR.silver, marginTop: 40, width: 780 })}>{d.body}</div> : null}
      </div>),
    foot: (
      <div style={col({})}>
        <div style={{ height: 1, background: BR.hair, marginBottom: 22 }} />
        <div style={flex({ justifyContent: 'space-between', fontFamily: 'Geist', fontSize: 20, letterSpacing: 2, color: BR.pale })}>
          <span>{`${pages} PAGES · ${mins} MINUTE READ`}</span><span>{date.toUpperCase()}</span>
        </div>
      </div>)
  });
}
function briefClose(d: BriefPage, page: string) {
  return briefFern({
    top: (<div style={col({})}><span style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 19, letterSpacing: 6, color: BR.pale }}>WHAT TO DO NEXT</span><div style={{ height: 1, background: BR.hair, marginTop: 26 }} /></div>),
    children: (
      <div style={col({ width: 860 })}>
        <div style={flex({ fontFamily: 'Lora', fontSize: bHead(d.title, true), lineHeight: 1.1, color: BR.cream, textWrap: 'balance' } as any)}>{d.title}</div>
        {d.body ? <div style={flex({ fontFamily: 'Geist', fontSize: 33, lineHeight: 1.45, color: BR.silver, marginTop: 40 })}>{d.body}</div> : null}
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
function briefEl(p: Drawable, n: number) {
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
    return briefMasthead(s, date, total, words);
  }
  if (layout === 'close') return briefClose(s, page);
  const d = { ...s, layout } as BriefPage;
  const { wide, el } = briefInner(d);
  return <BriefPaper label={(s.kicker || SECTION[layout as string] || '').toUpperCase()} foot={[date, page]} wide={wide}>{el}</BriefPaper>;
}

/* One image of a post as PNG bytes. n counts from 0. */
export async function renderSlidePng(p: Drawable, n: number): Promise<Buffer> {
  /* A post may name its look (card.look or the first slide's look). */
  const named = (p.format === 'card' ? (p.card as any)?.look : (p.slides as any)?.[0]?.look) as Look['key'] | undefined;
  const L = named && LOOKS[named] ? LOOKS[named] : lookFor(p.slot);
  await loadArt();
  const hiring = p.format === 'card' && (p.card as any)?.layout === 'hiring';
  const el = hiring ? hiringEl(p.card as any, await loadHiringBg()) : isBrief(p as any) ? briefEl(p, n) : p.format === 'card' ? cardEl(p, L) : slideEl(p, L, n);
  const res = new ImageResponse(el, { width: W, height: H, fonts: await loadFonts() });
  return Buffer.from(await res.arrayBuffer());
}

/* Instagram accepts JPEG only. */
export function pngToJpeg(png: Buffer, quality = 90): Buffer {
  const img = PNG.sync.read(png);
  return Buffer.from(jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality).data);
}
