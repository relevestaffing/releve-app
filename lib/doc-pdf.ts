/* A business audit or 90-day plan as a PDF, for the email attachment.
   -------------------------------------------------------------------
   Built on the server from the same Markdown the client reads online. Letter
   size, generous margins, the Relève wordmark, Times for headings and
   Helvetica for the working text (the closest standard fonts to Lora and
   Poppins, so nothing has to be downloaded), ruled tables, a quiet footer with
   page numbers. Only the Markdown the studios produce is handled: headings,
   paragraphs, bullet, numbered and task lists, tables, rules, quotes. */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { marked } from 'marked';

const W = 612, H = 792, MX = 64, TOP = 58, BOT = 70;
const INK = rgb(0.133, 0.188, 0.165), FERN = rgb(0.208, 0.267, 0.227), BODY = rgb(0.235, 0.275, 0.247);
const MUTED = rgb(0.478, 0.541, 0.494), RULE = rgb(0.80, 0.82, 0.80);

/* The standard PDF fonts cover WinAnsi only. Anything outside it is swapped
   for a plain equivalent or dropped, so drawing never throws. */
const WIN = new Set([0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178]);
export function pdfSafe(s: string): string {
  const pre = String(s ?? '')
    .replace(/→/g, '->').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[✓✔]/g, '-')
    .replace(/\s+/g, ' ');
  let out = '';
  for (const ch of pre) {
    const c = ch.codePointAt(0) as number;
    if ((c >= 0x20 && c <= 0x7E) || (c >= 0xA1 && c <= 0xFF) || WIN.has(c)) { out += ch; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/^[\x20-\x7E]*$/.test(base)) out += base;
  }
  return out;
}
const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");

type Run = { t: string; b?: boolean };
function runs(tokens: any[] | undefined, bold = false): Run[] {
  const out: Run[] = [];
  for (const k of tokens ?? []) {
    switch (k.type) {
      case 'strong': out.push(...runs(k.tokens, true)); break;
      case 'em': case 'del': case 'link': out.push(...runs(k.tokens, bold)); break;
      case 'codespan': case 'escape': out.push({ t: dec(k.text ?? ''), b: bold }); break;
      case 'br': out.push({ t: ' ', b: bold }); break;
      case 'html': break;
      case 'text': if (k.tokens?.length) out.push(...runs(k.tokens, bold)); else out.push({ t: dec(k.text ?? ''), b: bold }); break;
      default: if (k.raw) out.push({ t: dec(k.raw), b: bold });
    }
  }
  return out;
}
const plainLen = (rs: Run[]) => rs.map(r => r.t).join('').length;

type Fonts = { sans: PDFFont; sansB: PDFFont; sansI: PDFFont; serif: PDFFont; serifB: PDFFont; mono: PDFFont };
type Word = { t: string; b: boolean; w: number };

export type DocPdfOptions = {
  kind: 'audit' | 'plan';
  preparedFor?: string | null;
  title?: string;
  logoPng?: Uint8Array | null;
  date?: Date;
};

export async function buildDocPdf(markdown: string, opts: DocPdfOptions): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const f: Fonts = {
    sans: await pdf.embedFont(StandardFonts.Helvetica), sansB: await pdf.embedFont(StandardFonts.HelveticaBold),
    sansI: await pdf.embedFont(StandardFonts.HelveticaOblique), serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifB: await pdf.embedFont(StandardFonts.TimesRomanBold), mono: await pdf.embedFont(StandardFonts.Courier)
  };
  const tokens: any[] = marked.lexer(markdown ?? '', { gfm: true }) as any[];
  const firstH1 = tokens.findIndex(t => t.type === 'heading' && t.depth === 1);
  const title = pdfSafe(opts.title ?? (firstH1 >= 0 ? runs(tokens[firstH1].tokens).map(r => r.t).join('') : '')) ||
    (opts.kind === 'plan' ? 'Your 90-Day Success Plan' : 'Your Business Audit');
  if (firstH1 >= 0 && !opts.title) tokens.splice(firstH1, 1);

  pdf.setTitle(title); pdf.setAuthor('Relève'); pdf.setSubject(opts.kind === 'plan' ? '90-Day Success Plan' : 'Business Audit');

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - TOP;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - TOP; };
  const ensure = (h: number) => { if (y - h < BOT) newPage(); };
  const rule = (x1 = MX, x2 = W - MX, thick = 0.5, color = RULE) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: thick, color });

  /* ----- text wrapping ----- */
  const widthOf = (t: string, font: PDFFont, size: number) => font.widthOfTextAtSize(t, size);
  function words(rs: Run[], size: number, base: PDFFont, bold: PDFFont): Word[] {
    const out: Word[] = [];
    for (const r of rs) {
      const font = r.b ? bold : base;
      for (const piece of pdfSafe(r.t).split(' ')) if (piece) out.push({ t: piece, b: !!r.b, w: widthOf(piece, font, size) });
    }
    return out;
  }
  function lines(ws: Word[], size: number, maxW: number, base: PDFFont): Word[][] {
    const space = widthOf(' ', base, size);
    const out: Word[][] = []; let cur: Word[] = []; let w = 0;
    for (const word of ws) {
      const add = (cur.length ? space : 0) + word.w;
      if (cur.length && w + add > maxW) { out.push(cur); cur = [word]; w = word.w; } else { cur.push(word); w += add; }
    }
    if (cur.length) out.push(cur);
    return out;
  }
  function drawLine(ws: Word[], x: number, size: number, base: PDFFont, bold: PDFFont, color = BODY, yy?: number) {
    const space = widthOf(' ', base, size); let cx = x;
    for (const w of ws) { page.drawText(w.t, { x: cx, y: yy ?? y, size, font: w.b ? bold : base, color }); cx += w.w + space; }
  }
  function paragraph(rs: Run[], o: { x?: number; size?: number; lead?: number; color?: any; base?: PDFFont; bold?: PDFFont; gap?: number; width?: number } = {}) {
    const size = o.size ?? 10.5, lead = o.lead ?? size * 1.5, x = o.x ?? MX;
    const base = o.base ?? f.sans, bold = o.bold ?? f.sansB;
    const ls = lines(words(rs, size, base, bold), size, o.width ?? (W - MX - x), base);
    for (const l of ls) { ensure(lead); y -= lead * 0.82; drawLine(l, x, size, base, bold, o.color ?? BODY); y -= lead * 0.18; }
    y -= o.gap ?? 7;
  }

  /* ----- the cover block ----- */
  let logoOk = false;
  if (opts.logoPng) {
    try {
      const img = await pdf.embedPng(opts.logoPng);
      const lw = 150, lh = (img.height / img.width) * lw;
      page.drawImage(img, { x: MX, y: y - lh, width: lw, height: lh });
      y -= lh + 6; logoOk = true;
    } catch { /* fall back to the wordmark */ }
  }
  if (!logoOk) {
    let cx = MX; const wm = 'RELÈVE';
    for (const ch of wm) { page.drawText(ch, { x: cx, y: y - 18, size: 19, font: f.serif, color: INK }); cx += widthOf(ch, f.serif, 19) + 6.5; }
    y -= 26;
  }
  y -= 14; rule(MX, W - MX, 0.7, FERN); y -= 30;
  page.drawText(opts.kind === 'plan' ? 'YOUR 90-DAY SUCCESS PLAN' : 'YOUR BUSINESS AUDIT', { x: MX, y, size: 8, font: f.sans, color: MUTED });
  y -= 14;
  const tl = lines(words([{ t: title }], 26, f.serif, f.serifB), 26, W - 2 * MX, f.serif);
  for (const l of tl) { y -= 28; drawLine(l, MX, 26, f.serif, f.serifB, INK); }
  y -= 8;
  const d = (opts.date ?? new Date()).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' });
  const sub = pdfSafe(opts.preparedFor ? `Prepared for ${opts.preparedFor}   ·   ${d}` : d);
  y -= 8; page.drawText(sub, { x: MX, y, size: 9.5, font: f.sans, color: MUTED }); y -= 22;

  /* ----- the body ----- */
  function heading(tok: any) {
    const rs = runs(tok.tokens);
    if (tok.depth <= 2) {
      ensure(90); y -= 12; rule(); y -= 22;
      paragraph(rs, { size: 15, lead: 19, base: f.serif, bold: f.serifB, color: FERN, gap: 4 });
    } else {
      ensure(60); y -= 8;
      paragraph(rs, { size: 12, lead: 16, base: f.serif, bold: f.serifB, color: FERN, gap: 2 });
    }
  }

  function list(tok: any, level = 0) {
    const ind = MX + 16 + level * 18;
    (tok.items ?? []).forEach((item: any, i: number) => {
      const inner = (item.tokens ?? []).filter((t: any) => t.type === 'text' || t.type === 'paragraph');
      const rs = inner.flatMap((t: any) => runs(t.tokens?.length ? t.tokens : [{ type: 'text', text: t.text }]));
      const size = 10.5, lead = 15.5;
      const ls = lines(words(rs, size, f.sans, f.sansB), size, W - MX - ind, f.sans);
      ensure(lead * Math.min(ls.length, 2) + 2);
      const topY = y;
      if (item.task) {
        page.drawRectangle({ x: ind - 15, y: topY - lead * 0.82 - 1, width: 8, height: 8, borderColor: FERN, borderWidth: 0.8 });
        if (item.checked) { const by = topY - lead * 0.82; page.drawLine({ start: { x: ind - 14, y: by + 3 }, end: { x: ind - 12, y: by + 1 }, thickness: 1, color: FERN }); page.drawLine({ start: { x: ind - 12, y: by + 1 }, end: { x: ind - 9, y: by + 6 }, thickness: 1, color: FERN }); }
      } else {
        const mark = tok.ordered ? `${(Number(tok.start) || 1) + i}.` : '•';
        page.drawText(mark, { x: tok.ordered ? ind - 18 : ind - 12, y: topY - lead * 0.82, size, font: f.sans, color: FERN });
      }
      for (const l of ls) { ensure(lead); y -= lead * 0.82; drawLine(l, ind, size, f.sans, f.sansB); y -= lead * 0.18; }
      y -= 3;
      for (const nested of (item.tokens ?? []).filter((t: any) => t.type === 'list')) list(nested, level + 1);
    });
    if (level === 0) y -= 6;
  }

  function table(tok: any) {
    const header: Run[][] = tok.header.map((c: any) => runs(c.tokens));
    const rows: Run[][][] = tok.rows.map((r: any[]) => r.map((c: any) => runs(c.tokens)));
    const n = header.length;
    const wt = header.map((h, ci) => Math.min(44, Math.max(9, plainLen(h), ...rows.map(r => Math.min(plainLen(r[ci] ?? []), 44)))));
    const total = W - 2 * MX, sum = wt.reduce((a, b) => a + b, 0);
    const cw = wt.map(w => Math.max(54, (w / sum) * total));
    const scale = total / cw.reduce((a, b) => a + b, 0);
    const col = cw.map(w => w * scale);
    const PADX = 6, PADY = 6, size = 9, lead = 12.2;
    const cells = (r: Run[][], base: PDFFont, bold: PDFFont) =>
      r.map((rs, ci) => lines(words(rs, size, base, bold), size, col[ci] - 2 * PADX, base));
    const draw = (r: Run[][], isHead: boolean) => {
      const base = isHead ? f.serifB : f.sans, bold = isHead ? f.serifB : f.sansB;
      const ls = cells(r, base, bold);
      const rowH = Math.max(1, ...ls.map(l => l.length)) * lead + 2 * PADY;
      if (y - rowH < BOT) { newPage(); if (!isHead) { draw(header, true); } }
      let x = MX;
      ls.forEach((cl, ci) => {
        let cy = y - PADY;
        for (const l of cl) { cy -= lead * 0.82; drawLine(l, x + PADX, size, base, bold, isHead ? FERN : BODY, cy); cy -= lead * 0.18; }
        x += col[ci];
      });
      y -= rowH;
      page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: isHead ? 0.9 : 0.4, color: isHead ? FERN : RULE });
    };
    ensure(60); y -= 10;
    draw(header, true);
    for (const r of rows) draw(r.length === n ? r : [...r, ...Array(n - r.length).fill([])], false);
    y -= 14;
  }

  for (const tok of tokens) {
    switch (tok.type) {
      case 'heading': heading(tok); break;
      case 'paragraph': paragraph(runs(tok.tokens)); break;
      case 'text': paragraph(runs(tok.tokens?.length ? tok.tokens : [{ type: 'text', text: tok.text }])); break;
      case 'list': list(tok); break;
      case 'table': table(tok); break;
      case 'hr': ensure(30); y -= 10; rule(); y -= 14; break;
      case 'blockquote': {
        const start = y;
        const rs = (tok.tokens ?? []).flatMap((t: any) => runs(t.tokens ?? []));
        paragraph(rs, { x: MX + 16, base: f.sansI, bold: f.sansB, color: MUTED });
        page.drawLine({ start: { x: MX + 4, y: start }, end: { x: MX + 4, y: y + 7 }, thickness: 1.2, color: FERN });
        break;
      }
      case 'code': paragraph([{ t: String(tok.text ?? '') }], { base: f.mono, bold: f.mono, size: 9, lead: 13 }); break;
      default: break; // space, html
    }
  }

  /* ----- footer on every page ----- */
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MX, y: 46 }, end: { x: W - MX, y: 46 }, thickness: 0.4, color: RULE });
    p.drawText('Relève  ·  Executive Staffing', { x: MX, y: 32, size: 8, font: f.serif, color: MUTED });
    const label = `${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - MX - widthOf(label, f.sans, 8), y: 32, size: 8, font: f.sans, color: MUTED });
  });

  return Buffer.from(await pdf.save());
}

export function docPdfFilename(kind: 'audit' | 'plan', who: string | null | undefined): string {
  const tail = String(who ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `Releve-${kind === 'plan' ? '90-Day-Success-Plan' : 'Business-Audit'}${tail ? `-${tail}` : ''}.pdf`;
}
