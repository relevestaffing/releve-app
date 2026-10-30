import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { createHash } from 'crypto';
import {
  AGREEMENT_VERSION, AGREEMENT_TITLE, AGREEMENT_INTRO, AGREEMENT_SECTIONS
} from '@/lib/agreement-text';

/* The signed copy of the Client Services Agreement, as a PDF.
   ------------------------------------------------------------
   Built on the server at the moment of signing, from the exact text the client
   was shown (AGREEMENT_VERSION), with the signature block filled in and a
   signature record on the last page: who, when, from where, and a fingerprint
   of the text, so the copy proves what was agreed. Standard PDF fonts only, so
   there is nothing to download and it renders the same everywhere; anything
   outside their character set is swapped for a plain equivalent. */

const W = 612, H = 792, M = 72, LINE = 14.5;
const INK = rgb(0.13, 0.17, 0.15), MUTED = rgb(0.4, 0.45, 0.42), FERN = rgb(0.21, 0.27, 0.23);

export type SignatureRecord = {
  name: string; email: string; signedAt: Date; ip: string | null; userAgent: string | null;
  business?: string | null;
};

export function agreementFingerprint(): string {
  const text = [
    ...AGREEMENT_INTRO,
    ...AGREEMENT_SECTIONS.flatMap(s => [s.h, ...s.items.map(i => i.p ?? i.sub ?? i.bullet ?? '')])
  ].join('\n');
  return createHash('sha256').update(text).digest('hex');
}

export async function buildSignedAgreement(rec: SignatureRecord): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${AGREEMENT_TITLE}, ${rec.name}`);
  pdf.setAuthor('Relève Staffing LLC');
  pdf.setSubject(`Client Services Agreement, version ${AGREEMENT_VERSION}`);
  const reg = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ital = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  /* Anything the standard fonts cannot encode becomes the nearest plain
     character, never an exception halfway through someone's signature. */
  const safe = (s: string, f: PDFFont) => {
    let out = '';
    for (const ch of s.normalize('NFC')) {
      try { f.encodeText(ch); out += ch; }
      catch {
        const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
        try { f.encodeText(base); out += base; } catch { out += '?'; }
      }
    }
    return out;
  };

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const need = (h: number) => { if (y - h < M + 20) newPage(); };

  const wrap = (text: string, f: PDFFont, size: number, width: number): string[] => {
    const words = safe(text, f).split(/\s+/);
    const lines: string[] = []; let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  };
  const para = (text: string, o: { f?: PDFFont; size?: number; indent?: number; gap?: number; color?: any; bullet?: boolean } = {}) => {
    const f = o.f ?? reg, size = o.size ?? 10.5, indent = o.indent ?? 0;
    const lines = wrap(text, f, size, W - 2 * M - indent);
    for (let i = 0; i < lines.length; i++) {
      need(LINE);
      if (o.bullet && i === 0) page.drawText('•', { x: M + indent - 12, y, size, font: f, color: INK });
      page.drawText(lines[i], { x: M + indent, y, size, font: f, color: o.color ?? INK });
      y -= LINE;
    }
    y -= o.gap ?? 5;
  };

  // Title
  page.drawText('RELÈVE', { x: M, y, size: 11, font: bold, color: FERN }); y -= 26;
  page.drawText(AGREEMENT_TITLE, { x: M, y, size: 22, font: bold, color: INK }); y -= 18;
  para('Client / Executive Master Agreement, governing the retainer relationship', { f: ital, size: 10.5, color: MUTED, gap: 14 });

  for (const p of AGREEMENT_INTRO) {
    if (p === 'Recitals') para(p, { f: bold, size: 11, gap: 4 }); else para(p);
  }
  for (const s of AGREEMENT_SECTIONS) {
    need(60); y -= 6;
    para(s.h, { f: bold, size: 11.5, gap: 6 });
    for (const it of s.items) {
      if (it.sub) para(it.sub, { f: bold, size: 10.5, gap: 2 });
      else if (it.bullet) para(it.bullet, { indent: 18, bullet: true, gap: 3 });
      else if (it.p) para(it.p);
    }
  }

  // Signature block
  need(190); y -= 8;
  para('SIGNATURES', { f: bold, size: 11.5, gap: 8 });
  const dateStr = rec.signedAt.toLocaleDateString('en-US', { timeZone: 'America/Denver', year: 'numeric', month: 'long', day: 'numeric' });
  const col2 = M + 250;
  const startY = y;
  page.drawText('Relève', { x: M, y, size: 11, font: bold, color: INK });
  page.drawText('Client', { x: col2, y, size: 11, font: bold, color: INK });
  y -= 20;
  page.drawText('Relève Staffing LLC', { x: M, y, size: 15, font: ital, color: FERN });
  page.drawText(safe(rec.name, ital), { x: col2, y, size: 15, font: ital, color: FERN });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + 210, y }, thickness: 0.5, color: MUTED });
  page.drawLine({ start: { x: col2, y }, end: { x: W - M, y }, thickness: 0.5, color: MUTED });
  y -= 13;
  const small = (t: string, x: number) => page.drawText(safe(t, reg), { x, y, size: 9, font: reg, color: MUTED });
  small('Signed electronically on the Client’s acceptance,', M); small('Signature (typed full name)', col2); y -= 12;
  small('under the company’s standing authorization', M); small(`Full name: ${rec.name}`, col2); y -= 12;
  small(`Date: ${dateStr}`, M); small(rec.business ? `Business: ${rec.business}` : 'Business name: n/a', col2); y -= 12;
  small('', M); small(`Date: ${dateStr}`, col2); y -= 24;
  void startY;

  // Signature record
  newPage();
  page.drawText('SIGNATURE RECORD', { x: M, y, size: 11.5, font: bold, color: INK }); y -= 22;
  const rows: [string, string][] = [
    ['Document', `${AGREEMENT_TITLE}, version ${AGREEMENT_VERSION}`],
    ['Signer', rec.name],
    ['Email', rec.email],
    ['Signed (UTC)', rec.signedAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')],
    ['Method', 'Typed full name, entered on the Relève platform after the client confirmed they had read and agreed to the full text'],
    ['Network address', rec.ip ?? 'not recorded'],
    ['Browser', (rec.userAgent ?? 'not recorded').slice(0, 160)],
    ['Text fingerprint (SHA-256)', agreementFingerprint()]
  ];
  for (const [k, v] of rows) {
    need(40);
    page.drawText(safe(k.toUpperCase(), reg), { x: M, y, size: 8, font: reg, color: MUTED }); y -= 12;
    const lines = wrap(v, reg, 10, W - 2 * M);
    for (const l of lines) { need(LINE); page.drawText(l, { x: M, y, size: 10, font: reg, color: INK }); y -= LINE - 1; }
    y -= 9;
  }
  y -= 6;
  para('This record, with the agreement above, is the executed copy. Under 11.6 of the agreement, the Client’s electronic acceptance is a valid signature with the same effect as a handwritten one.', { f: ital, size: 9.5, color: MUTED });

  // page numbers
  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(`Relève Staffing LLC  ·  ${AGREEMENT_TITLE}  ·  Page ${i + 1} of ${pages.length}`,
    { x: M, y: 36, size: 8, font: reg, color: MUTED }));

  return Buffer.from(await pdf.save());
}
