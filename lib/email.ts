/* ============================================================
   OUTBOUND EMAIL
   Relève had no way to contact anyone. This is it.

   Sends over SMTP. Since 23 October 2026 the intended route is Resend
   (smtp.resend.com, user "resend", the API key as the password, sender
   notify@relevestaffing.com): automated mail sits on its own sender and
   reputation, apart from the hello@ mailbox people actually write from, and
   Resend keeps the delivery logs Gmail never did. Google Workspace SMTP still
   works as the fallback. If the credentials are absent the whole thing
   quietly does nothing — the app must never fall over because an email
   could not go out.
   ============================================================ */
import nodemailer from 'nodemailer';
import { APPLY_QUESTIONS } from './jobs-public';
import { fmtDate, fmtDay } from './words';

const HOST = process.env.SMTP_HOST ?? 'smtp.gmail.com';
const PORT = Number(process.env.SMTP_PORT ?? 465);
const USER = process.env.SMTP_USER;              // "resend" on Resend, hello@relevestaffing.com on Google
const PASS = process.env.SMTP_PASS;              // the Resend API key, or the Google app password
/* On Resend the login is the literal word "resend", which is not an address,
   so the sender has to be named. notify@ is an alias of hello@, so a reply to
   an automated email still reaches a person. */
const FROM = process.env.SMTP_FROM
  ?? (HOST.includes('resend') ? 'Relève <notify@relevestaffing.com>' : (USER ? `Relève <${USER}>` : ''));
const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

/* Tried a personal sender name here once ("Sage Jackson, Relève <...>") —
   reverted on request: every outbound message is signed and sent as the
   Relève brand, never a named person, no exceptions. Left as a note so
   nobody re-adds it thinking it was an oversight. */

export function emailReady() { return Boolean(USER && PASS); }

let cached: nodemailer.Transporter | null = null;
function transport() {
  if (!cached) {
    cached = nodemailer.createTransport({
      host: HOST, port: PORT, secure: PORT === 465, auth: { user: USER, pass: PASS }
    });
  }
  return cached;
}

/* The step-by-step "add Relève to your phone or computer" guide, fetched from
   the app's own public folder and attached to the first welcome email. If it
   cannot be fetched the email still goes, with the link in its body. */
let guideCache: Attachment | null = null;
export async function appGuideAttachment(): Promise<Attachment[]> {
  try {
    if (!guideCache) {
      const r = await fetch(`${SITE}/guides/Add-Releve-to-your-device.pdf`);
      if (!r.ok) return [];
      guideCache = { filename: 'Add-Releve-to-your-device.pdf', content: Buffer.from(await r.arrayBuffer()), contentType: 'application/pdf' };
    }
    return [guideCache];
  } catch { return []; }
}

/* One built message. Every template returns this shape, and `kind` is the
   template's own name — added automatically at the bottom of this file, so a
   new template cannot be added without also being loggable. */
export type Attachment = { filename: string; content: Buffer; contentType: string };
export type Message = { subject: string; text: string; html: string; kind: string; from?: string; attachments?: Attachment[]; headers?: Record<string, string>; icalEvent?: { method: string; filename?: string; content: string } };

/* Mirror a transactional notification to the recipient's push devices.
   Best-effort and gated: marketing (campaign*) emails never push, and any
   failure is swallowed so a push problem can never fail an email. */
async function pushMirror(to: string, msg: Message) {
  if (/^campaign/i.test(msg.kind || '')) return;
  try {
    const { sendPushToEmail } = await import('./push');
    await sendPushToEmail(to, { title: msg.subject || 'Relève', url: '/app', tag: msg.kind || undefined });
  } catch { /* push is best-effort */ }
}

/* Every attempt leaves a row behind.
   ---------------------------------
   This used to catch its own failure and return false, and almost every caller
   ignored the return value. So a page said "Sent" whether or not anything left
   the building, and the first anyone knew was a person saying they never got
   it. Swallowing is still right — losing a notification is a nuisance, losing
   the request that triggered it is a bug — but silence is not: the outcome now
   goes to email_log, which is what the console reads.

   The logging itself is wrapped, because a platform that cannot write its own
   log must still be able to send mail. */
async function record(kind: string, to: string, subject: string, ok: boolean, detail?: string) {
  try {
    /* log_email() is callable by the service role only (PART 39): a signed-in
       or anonymous session could otherwise write whatever it liked into the
       log the console trusts. */
    const { adminClient, hasServiceKey } = await import('./supabase/admin');
    if (!hasServiceKey()) { console.error('[email] no service key, so this send is not logged'); return; }
    const sb = adminClient();
    await sb.rpc('log_email', {
      p_kind: kind, p_to: to, p_subject: subject, p_ok: ok, p_detail: detail ?? null
    });
  } catch (e) {
    console.error('[email] could not write the log:', e);
  }
}

/* Throws. Used only by the deliberate test, which needs the mail host's own
   words rather than a boolean — a silent false is how a completely broken
   setup passed for a working one.

   It logs as well, and that is not decoration. Without it the test sat above a
   delivery log still insisting nothing had ever sent: a green badge and a red
   banner disagreeing on the same screen, which is worse than either alone. The
   deliberate test is a send like any other and belongs in the record. */
/* Light only, for every message, in one place (Nona, 2 November 2026).
   Gmail's dark mode (web, iOS and Android) re-colours any light background it
   finds, which turns a white Relève email charcoal and leaves the fern text and
   logo nearly unreadable. A solid colour is what it rewrites; a background-image
   is left alone, and a bgcolor attribute stops the client from guessing. So
   every message passes through here on its way out: each surface that carries a
   hex background also gets a same-colour gradient and a bgcolor, and the
   document declares itself light only. The Letter already does this by hand;
   running it twice changes nothing. */
export function lightOnly(html: string): string {
  let h = String(html ?? '');
  h = h.replace(/(<meta\s+name="color-scheme"\s+content=")light(")/i, '$1light only$2')
       .replace(/(<meta\s+name="supported-color-schemes"\s+content=")light(")/i, '$1light only$2');
  if (!/name="color-scheme"/i.test(h)) {
    h = /<head[^>]*>/i.test(h)
      ? h.replace(/<head[^>]*>/i, m => `${m}<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">`)
      : h;
  }
  if (!/color-scheme:\s*light only/i.test(h) && /<\/head>/i.test(h)) {
    h = h.replace(/<\/head>/i, '<style>:root{color-scheme:light only;supported-color-schemes:light only}</style></head>');
  }
  h = h.replace(/<(body|table|td|div|p|a)\b([^>]*)>/gi, (m, tag: string, attrs: string) => {
    const sm = /style="([^"]*)"/i.exec(attrs);
    if (!sm) return m;
    let st = sm[1];
    const bm = /background(?:-color)?:\s*(#[0-9a-f]{6})\b/i.exec(st);
    if (!bm) return m;
    const c = bm[1];
    if (!/background-image/i.test(st)) st = st.replace(/;?\s*$/, ';') + `background-image:linear-gradient(${c},${c});`;
    let a = attrs.replace(sm[0], `style="${st}"`);
    if (/^(body|table|td)$/i.test(tag) && !/\bbgcolor=/i.test(a)) a += ` bgcolor="${c}"`;
    return `<${tag}${a}>`;
  });
  return h;
}

export async function sendOrThrow(to: string, msg: Message) {
  if (!emailReady()) {
    await record(msg.kind, to, msg.subject, false,
      'Skipped before it was attempted: the server has no SMTP username or password.');
    throw new Error('No SMTP username or password is set on the server.');
  }
  try {
    const info = await transport().sendMail({
      from: msg.from ?? FROM, to, subject: msg.subject, text: msg.text, html: lightOnly(msg.html), attachments: msg.attachments, headers: msg.headers, icalEvent: msg.icalEvent
    });
    await record(msg.kind, to, msg.subject, true);
    await pushMirror(to, msg);
    return info;
  } catch (e: any) {
    await record(msg.kind, to, msg.subject, false,
      String(e?.responseCode ? `${e.responseCode} ` : '') + String(e?.message ?? e));
    throw e;
  }
}


/** Never throws. Returns whether the mail host accepted it. */
export async function send(to: string, msg: Message) {
  if (!emailReady()) {
    console.warn('[email] not configured, skipped:', msg.subject);
    await record(msg.kind, to, msg.subject, false,
      'Skipped before it was attempted: the server has no SMTP username or password.');
    return false;
  }
  try {
    await transport().sendMail({ from: msg.from ?? FROM, to, subject: msg.subject, text: msg.text, html: lightOnly(msg.html), attachments: msg.attachments, headers: msg.headers, icalEvent: msg.icalEvent });
    await record(msg.kind, to, msg.subject, true);
    await pushMirror(to, msg);
    return true;
  } catch (e: any) {
    console.error('[email] failed:', msg.subject, e);
    await record(msg.kind, to, msg.subject, false,
      String(e?.responseCode ? `${e.responseCode} ` : '') + String(e?.message ?? e));
    return false;
  }
}

/* ---------- the wrapper every message sits in ---------- */
/* secondary is a plain, quieter link under the button — for the rare message
   with a real second action, like the deposit email's "or create your
   account first" beneath its "pay your deposit" button. Everything else
   passes one cta and no message needs to touch this signature. */
export function shell(
  headline: string, inner: string,
  cta?: { label: string; href: string },
  secondary?: { label: string; href: string } | { label: string; href: string }[]
) {
  const links = secondary ? (Array.isArray(secondary) ? secondary : [secondary]) : [];
  /* The inbox preview line. Without one, Gmail previews the header image's
     alt text ("Relève Executive Staffing. Consider it handled.") on every
     email. Taken from the first real sentence of the letter, skipping a
     greeting line such as "Jordan,". The trailing spacers stop clients from
     pulling more text into the preview. */
  const plain = (h: string) => h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const paras = (inner.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? []).map(plain).filter(Boolean);
  const firstReal = paras.find(t => !/^[^.!?]{1,40},$/.test(t)) ?? plain(inner);
  const pre = esc(firstReal.length > 140 ? firstReal.slice(0, 137).replace(/\s+\S*$/, '') + '…' : firstReal);
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${pre}${'&zwnj;&nbsp;'.repeat(60)}</div>`;
  /* The house frame, matched to the website's front page (6 Nov 2026): the
     plaster wall with the window light, framed inside a cream card, the white
     wordmark and the script tagline on it, then a serif letter beneath. The
     color-scheme lines keep Apple Mail from inverting it in dark mode. The
     wall has a dark fallback color, so a client that blocks images still
     shows white type on fern. */
  const SERIF = "Georgia,'Times New Roman',serif", SANS = 'Helvetica,Arial,sans-serif';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<style>@media (max-width:480px){.px{padding-left:26px!important;padding-right:26px!important}.cta{padding:16px 24px!important;letter-spacing:2.2px!important;font-size:11px!important}.h1{font-size:25px!important}}</style>
</head><body style="margin:0;padding:0;background:#E7E2D5;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E7E2D5;padding:40px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#F5F2EA;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(34,48,42,.10);">
  <tr><td style="padding:14px 14px 0;">
    <a href="https://relevestaffing.com" style="text-decoration:none;display:block;"><img src="${SITE}/email-header.jpg" width="572" alt="Relève Executive Staffing. Consider it handled." style="display:block;width:100%;max-width:572px;height:auto;border:0;border-radius:9px;background:#18221C;font-family:Georgia,serif;font-size:22px;letter-spacing:6px;color:#F5F2EA;text-align:center;"></a>
  </td></tr>
  <tr><td class="px" align="center" style="padding:46px 56px 0;">
    <h1 class="h1" style="font-family:${SERIF};font-weight:normal;font-size:30px;line-height:1.25;color:#22302A;margin:0;">${headline}</h1>
  </td></tr>
  <tr><td class="px" align="center" style="padding:28px 56px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="border-top:1px solid #D9D3C4;font-size:0;line-height:0;">&nbsp;</td>
      <td width="40" align="center" style="font-family:${SERIF};font-size:12px;color:#B0C4B2;line-height:1;">&#9670;</td>
      <td style="border-top:1px solid #D9D3C4;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>
  </td></tr>
  <tr><td class="px" style="padding:30px 56px 0;font-family:${SERIF};font-size:16.5px;line-height:1.75;color:#3F4E44;">
    ${inner}
  </td></tr>
  ${cta ? `<tr><td class="px" align="center" style="padding:22px 40px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#35443A" style="background:#35443A;padding:4px;border-radius:2px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border:1px solid #6E8073;">
        <a class="cta" href="${cta.href}" style="display:inline-block;padding:16px 40px;font-family:${SERIF};font-size:12px;letter-spacing:3.2px;text-transform:uppercase;color:#F5F2EA;text-decoration:none;white-space:nowrap;">${cta.label}</a>
      </td></tr></table>
    </td></tr></table>
  </td></tr>` : ''}
  ${links.length ? `<tr><td class="px" align="center" style="padding:20px 40px 0;font-family:${SANS};font-size:13px;line-height:1.9;">
    ${links.map(s => `<a href="${s.href}" style="color:#35443A;text-decoration:none;border-bottom:1px solid #B0C4B2;">${s.label}</a>`).join('<br>')}
  </td></tr>` : ''}
  <tr><td align="center" style="padding:46px 40px 50px;">
    <div style="width:44px;height:1px;background:#B0C4B2;margin:0 auto;font-size:0;line-height:0;">&nbsp;</div>
  </td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="padding:26px 8px 0;text-align:center;font-family:${SANS};font-size:10px;line-height:1.9;letter-spacing:3px;text-transform:uppercase;color:#8A8F82;">
  Relève Executive Staffing<br><a href="https://relevestaffing.com" style="color:#6B7A6F;text-decoration:none;letter-spacing:1.5px;text-transform:none;font-size:11px;">relevestaffing.com</a><span style="letter-spacing:1px;text-transform:none;font-size:11px;"> &middot; Replies reach a person.</span>
</td></tr></table>
</td></tr></table></body></html>`;
}
export const p = (s: string) => `<p style="margin:0 0 18px;">${s}</p>`;
/** The Relève signature tagline, set in Simple Serenity Script (image, so it renders the same in every mail client). */
/** The script tagline now lives in the photo at the top of every email (shell), so this adds nothing; kept so existing calls stay valid. */
export const tagline = () => '';

/* HTML-escapes a value before it goes into a template built from someone
   else's typed text. Only newApplication needs this: it is the one message
   in this file built entirely from an anonymous applicant's own words — full
   name, links, resume filename, and every free-text answer — with nothing in
   between checking what they typed. Every other template's free text comes
   from someone already signed in, doing something narrower than "write
   anything" (a decline reason, a time-off note), so this stays scoped to the
   one template that needs it rather than touched everywhere on principle. */
/* Everything a person typed gets escaped before it goes into an email, not
   only what a stranger typed. A signed-in talent or executive is still
   somebody else's input: an anchor tag pasted into a placement message would
   otherwise arrive as a live link inside a genuine, correctly-signed Relève
   email, which is a better phishing vector than anything an outsider can
   build. */
export const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ---------- the messages ---------- */

const rawTemplates = {
  talentInvite: (name: string) => {
    const links = [{ label: 'Set up how you get paid', href: `${SITE}/app/pay` },
      { label: 'Sign your agreement', href: `${SITE}/agreement` }];
    return {
      subject: 'Your Relève account is ready',
      text: `${name ? name + ',' : 'Hello,'}\n\nYou are invited to join the Relève roster: the assessed and verified professionals we introduce to executives.\n\nSign in at ${SITE} with this email address. There is no password; we send you a link.\n\nBefore you can be matched, a few steps come first: a twenty to twenty-five minute assessment, your availability, and confirming your identity. Your dashboard takes you through them in order.\n\n${links.map(l => `${l.label}: ${l.href}`).join('\n')}\n\nRelève`,
      html: shell('Your account is ready',
        p(`${name ? esc(name) + ',' : 'Hello,'}`) +
        p('You are invited to join the Relève roster: the assessed and verified professionals we introduce to executives.') +
        p('Sign in with this email address. There is no password; we send you a link.') +
        p('Before you can be matched, a few steps come first: a twenty to twenty-five minute assessment, your availability, and confirming your identity. Your dashboard takes you through them in order.'),
        { label: 'Open your account', href: SITE }, links)
    };
  },

  clientInvite: (name: string) => {
    const links = [{ label: 'Sign your agreement', href: `${SITE}/agreement` }];
    return {
      subject: 'Your Relève account is open',
      text: `${name ? name + ',' : 'Hello,'}\n\nYour search runs through your Relève account at ${SITE}/app. Sign in with this address. There is no password; we send you a link.\n\nThe account takes you through the rest in order: the search deposit, then the Executive Signature, which takes about fifteen minutes, then your availability.\n\nFrom there, the work is ours. Every candidate you see is scored against your Signature before their name reaches you.\n\n${links.map(l => `${l.label}: ${l.href}`).join('\n')}\n\nRelève`,
      html: shell('Your account is open',
        p(`${name ? esc(name) + ',' : 'Hello,'}`) +
        p('Your search runs through this account. Sign in with this address. There is no password; we send you a link.') +
        p('The account takes you through the rest in order: the search deposit, then the Executive Signature, which takes about fifteen minutes, then your availability.') +
        p('From there, the work is ours. Every candidate you see is scored against your Signature before their name reaches you.'),
        { label: 'Open your account', href: `${SITE}/app` }, links)
    };
  },

  /* Sent by hand from the console after the discovery call, once Relève has
     opened the search — never automatically. Three things stand between a
     good call and a first candidate, none of them optional and none of them
     ordered — a client who has already signed elsewhere or wants their
     account open first should not read a wall of text before finding out
     they can. So three equal steps rather than one CTA with two footnotes:
     same size, same weight, each with its own link, in the order they are
     named but not gated on one another. */
  depositReady: (o: { name: string; payUrl: string; cents: number; agreementUrl?: string }) => {
    const amount = (o.cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    /* Step 1 falls back to the Terms of Service page (the same link TermsGate
       itself opens, and where the placement terms actually live — Sections 5
       and 6) rather than to SITE, which is step 3's own link. It used to fall
       back to SITE too: harmless once signed in, since the terms gate is the
       first thing anyone hits — but it meant two differently-worded steps
       pointed at the exact same URL, which is exactly the "one CTA with two
       footnotes" this layout was built to avoid. */
    const steps = [
      { n: 1, label: 'Sign your agreement', note: 'Takes a minute, right on your screen.', href: o.agreementUrl ?? `${SITE}/agreement`, cta: 'Sign agreement' },
      { n: 2, label: 'Place your deposit', note: `${amount}, credited in full once your assistant is placed with you.`, href: o.payUrl, cta: `Pay ${amount}` },
      { n: 3, label: 'Set up your account', note: "This is where your candidate's profile will appear.", href: SITE, cta: 'Open account' },
      { n: 4, label: 'Add Relève to your phone', note: 'So updates reach you right away.', href: `${SITE}/install`, cta: 'Get the app' }
    ];
    const SERIF = "Georgia,'Times New Roman',serif", SANS = 'Helvetica,Arial,sans-serif';
    const ROMAN = ['I', 'II', 'III', 'IV'];
    /* The four steps chain on their own (agreement, then deposit, then
       account, then the app), so the letter carries one action, not four. */
    const step = (s: typeof steps[number], i: number) => {
      const last = i === steps.length - 1;
      return `
      <tr>
        <td width="44" valign="top" align="center" style="padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border:1px solid #9DB0A0;border-radius:17px;font-family:${SERIF};font-style:italic;font-size:13px;color:#35443A;line-height:34px;">${ROMAN[i]}</td></tr></table>
          ${last ? '' : '<div style="width:1px;height:46px;background:#CBD5CA;margin:6px auto 6px;font-size:0;line-height:0;">&nbsp;</div>'}
        </td>
        <td valign="top" style="padding:5px 0 0 20px;">
          <div style="font-family:${SERIF};font-size:19px;line-height:1.3;color:#22302A;">${s.label}</div>
          <div style="margin-top:5px;font-family:${SANS};font-size:13.5px;line-height:1.6;color:#6B7A6F;font-weight:300;">${s.note}</div>
        </td>
      </tr>`;
    };
    const firstName = o.name ? o.name.split(/\s+/)[0] : '';
    const hello = firstName ? `Welcome, ${firstName}.` : 'Welcome to Relève.';
    const begin = steps[0].href;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>@media (max-width:480px){.px{padding-left:26px!important;padding-right:26px!important}.cta{padding:16px 24px!important;letter-spacing:2.2px!important;font-size:11px!important}.h1{font-size:25px!important}}</style></head>
<body style="margin:0;padding:0;background:#E7E2D5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Four short steps to get started.${'&zwnj;&nbsp;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E7E2D5;padding:40px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#F5F2EA;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(34,48,42,.10);">
  <tr><td style="padding:14px 14px 0;">
    <a href="https://relevestaffing.com" style="text-decoration:none;display:block;"><img src="${SITE}/email-header-tall.jpg" width="572" alt="Relève Executive Staffing. Consider it handled." style="display:block;width:100%;max-width:572px;height:auto;border:0;border-radius:9px;background:#18221C;font-family:Georgia,serif;font-size:22px;letter-spacing:6px;color:#F5F2EA;text-align:center;"></a>
  </td></tr>

  <tr><td class="px" align="center" style="padding:50px 52px 0;">
    <div style="font-family:${SANS};font-size:10.5px;letter-spacing:4px;text-transform:uppercase;color:#8FA593;">Getting started</div>
    <div style="margin-top:16px;font-family:${SERIF};font-size:34px;line-height:1.2;color:#22302A;">${esc(hello)}</div>
    <div style="margin:18px auto 0;max-width:420px;font-family:${SERIF};font-size:16.5px;line-height:1.75;color:#4A5A4F;">Thanks for choosing Relève. Here is how we get started. It takes about ten minutes.</div>
  </td></tr>

  <tr><td class="px" align="center" style="padding:36px 52px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="border-top:1px solid #D9D3C4;font-size:0;line-height:0;">&nbsp;</td>
      <td width="40" align="center" style="font-family:${SERIF};font-size:12px;color:#B0C4B2;line-height:1;">&#9670;</td>
      <td style="border-top:1px solid #D9D3C4;font-size:0;line-height:0;">&nbsp;</td>
    </tr></table>
  </td></tr>

  <tr><td class="px" style="padding:36px 64px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${steps.map(step).join('')}</table>
  </td></tr>

  <tr><td class="px" align="center" style="padding:44px 40px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#35443A" style="background:#35443A;padding:4px;border-radius:2px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border:1px solid #6E8073;">
        <a class="cta" href="${begin}" style="display:inline-block;padding:17px 44px;white-space:nowrap;font-family:${SERIF};font-size:12px;letter-spacing:3.4px;text-transform:uppercase;color:#F5F2EA;text-decoration:none;">Sign your agreement</a>
      </td></tr></table>
    </td></tr></table>
    <div style="margin-top:18px;font-family:${SANS};font-size:12.5px;line-height:1.6;color:#7C887F;font-weight:300;">A copy is attached if you would like to read it first.</div>
  </td></tr>

  <tr><td align="center" style="padding:52px 40px 58px;">
    <div style="width:44px;height:1px;background:#B0C4B2;margin:0 auto 26px;font-size:0;line-height:0;">&nbsp;</div>
    <div style="font-family:${SERIF};font-style:italic;font-size:17px;line-height:1.6;color:#4A5A4F;">Your search begins the moment your deposit is in.</div>
  </td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="padding:26px 8px 0;text-align:center;font-family:${SANS};font-size:10px;line-height:1.9;letter-spacing:3px;text-transform:uppercase;color:#8A8F82;">
  Relève Executive Staffing<br><a href="https://relevestaffing.com" style="color:#6B7A6F;text-decoration:none;letter-spacing:1.5px;text-transform:none;font-size:11px;">relevestaffing.com</a>
</td></tr></table>
</td></tr></table></body></html>`;
    return {
      subject: `Welcome to Relève${firstName ? `, ${firstName}` : ''}`,
      text: `${o.name ? o.name + ',' : 'Hello,'}\n\nThanks for choosing Relève. Here is how we get started. It takes about ten minutes:\n\n${steps.map(s => `${s.n}. ${s.label}: ${s.href}\n   ${s.note}`).join('\n\n')}\n\nYour search begins the moment your deposit is in.\n\nConsider it handled.\nRelève`,
      html
    };
  },

  /* Nobody watches the sign-in screen, so this is the only thing that tells
     the team an invitation did not land. One an hour at most, see
     lib/signin-watch.ts. Written toward the fix: who, where it stopped, and
     the one page that shows the rest. */
  signinTrouble: (o: { email?: string | null; where: string; detail?: string | null }) => ({
    subject: 'Someone could not sign in',
    text: `Someone could not sign in${o.email ? `: ${o.email}` : ''}.\n\nWhere it stopped: ${o.where}.\n${o.detail ? `What the server said: ${o.detail}\n` : ''}\nThey were told their account could not be set up, and are waiting to hear from us. Every attempt is in the sign-in log, under The business, then Team.\n\n${SITE}/console/team\n\nRelève`,
    html: shell('Someone could not sign in',
      p(`Someone could not sign in${o.email ? `, <b>${esc(o.email)}</b>` : ''}.`) +
      p(`Where it stopped: <b>${esc(o.where)}</b>.`) +
      (o.detail ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #B0C4B2;">${esc(o.detail)}</p>` : '') +
      p('They were told their account could not be set up, and are waiting to hear from us. Every attempt is in the sign-in log, under The business, then Team.'),
      { label: 'Open the sign-in log', href: `${SITE}/console/team` })
  }),

  /* The executive's week, every Monday (25 October 2026). Hours, what got
     done, the win, and anything the talent chose to share. Concerns are not
     here: the form promised they go to Relève, and they do. Short on
     purpose; it is read on a phone between two other things. */
  weeklyDigest: (o: {
    name: string; talent: string; week: string; hours: number | null;
    accomplished: string | null; win: string | null;
    highlights: { date: string; text: string }[];
  }) => {
    const first = o.talent.split(' ')[0];
    const ending = fmtDay(o.week);
    const lines: string[] = [];
    if (o.hours != null) lines.push(`Hours: ${o.hours}`);
    if (o.accomplished) lines.push(`Done this week:\n${o.accomplished}`);
    if (o.win) lines.push(`A win: ${o.win}`);
    for (const h of o.highlights) lines.push(`${h.date}: ${h.text}`);
    return {
      subject: `${first}'s week, ending ${ending}`,
      text: `${o.name ? o.name + ',' : 'Hello,'}\n\nHere is ${first}'s week, ending ${ending}.\n\n${lines.join('\n\n')}\n\nIf you would like more of anything, or less, tell your Client Success Manager and it is handled.\n\n${SITE}/app/report\n\nRelève`,
      html: shell(`${esc(first)}'s week`,
        p(`${o.name ? esc(o.name) + ',' : 'Hello,'}`) +
        p(`Here is ${esc(first)}'s week, ending ${ending}.`) +
        (o.hours != null ? `<p style="margin:0 0 15px;"><b>${o.hours} hours</b></p>` : '') +
        (o.accomplished ? `<p style="margin:0 0 6px;color:#35443A;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Done this week</p><p style="margin:0 0 15px;white-space:pre-wrap;">${esc(o.accomplished)}</p>` : '') +
        (o.win ? `<p style="margin:0 0 6px;color:#35443A;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">A win</p><p style="margin:0 0 15px;">${esc(o.win)}</p>` : '') +
        (o.highlights.length ? `<p style="margin:0 0 6px;color:#35443A;font-size:12px;letter-spacing:.12em;text-transform:uppercase;">Shared with you</p>` +
          o.highlights.map(h => `<p style="margin:0 0 10px;"><span style="color:#35443A;">${esc(h.date)}</span> &nbsp;${esc(h.text)}</p>`).join('') : '') +
        p('If you would like more of anything, or less, tell your Client Success Manager and it is handled.'),
        { label: 'See the full month', href: `${SITE}/app/report` })
    };
  },

  /* The moment a profile first exists — not sent by anyone from the console,
     it fires itself the instant someone's first sign-in creates their row.
     Two things belong in it and nothing else: that it worked, and how to put
     it on their home screen, since a bookmark in a browser tab is not what a
     high-end candidate or client experience should look like on a phone. */
  profileWelcome: (fullName: string | null, role: 'client' | 'talent' | 'admin' | null = null, name = fullName ? fullName.trim().split(/\s+/)[0] : null) => ({
    subject: role === 'client' ? 'Your Relève account is open' : 'Your profile is live',
    text: `${name ? name + ',' : 'Hello,'}\n\n${role === 'client' ? 'Your Relève account is open.' : 'Your Relève profile is live.'}\n\nOne thing worth doing now: add Relève to your home screen. Opened from there, it works like any other app, full screen and one tap away.\n\nOn iPhone: open ${SITE}/app in Safari, tap the Share icon, then "Add to Home Screen."\nOn Android: open it in Chrome, tap the menu (⋮), then "Install app" (or "Add to Home Screen").\nOn Mac: open it in Safari, choose File, then "Add to Dock" (in Chrome: menu, Cast, save, and share, then "Install page as app").\n\nA step-by-step guide with pictures is attached, and here: ${SITE}/guides/Add-Releve-to-your-device.pdf\n\n${SITE}/app\n\nRelève`,
    html: shell(role === 'client' ? 'Your Relève account is open' : 'Your profile is live',
      p(`${name ? esc(name) + ',' : 'Hello,'}`) +
      p('One thing worth doing now: add Relève to your home screen. Opened from there, it works like any other app, full screen and one tap away.') +
      `<div style="margin:0 0 12px;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4E6B57;margin-bottom:5px;">On iPhone</div>` +
      `<p style="margin:0;padding:12px 16px;background:#F1F6F1;border-left:2px solid #B0C4B2;">Open this in Safari, tap the Share icon, then "Add to Home Screen."</p></div>` +
      `<div style="margin:0 0 15px;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4E6B57;margin-bottom:5px;">On Android</div>` +
      `<p style="margin:0;padding:12px 16px;background:#F1F6F1;border-left:2px solid #B0C4B2;">Open this in Chrome, tap the menu (⋮), then "Install app."</p></div>` +
      `<div style="margin:0 0 15px;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4E6B57;margin-bottom:5px;">On Mac</div>` +
      `<p style="margin:0;padding:12px 16px;background:#F1F6F1;border-left:2px solid #B0C4B2;">Open this in Safari, choose File, then "Add to Dock." In Chrome: menu, Cast, save, and share, then "Install page as app."</p></div>` +
      `<p style="margin:0 0 15px;">A step-by-step guide with pictures is attached. If you do not see it, <a href="${SITE}/guides/Add-Releve-to-your-device.pdf" style="color:#35443A;">open it here</a>.</p>`,
      { label: role === 'client' ? 'Open Relève' : 'Open your profile', href: `${SITE}/app` })
  }),

  interviewBooked: (o: { name: string; withWhom: string; when: string; url: string | null }) => ({
    subject: `Interview confirmed: ${o.when}`,
    text: `${o.name},\n\nYour interview with ${o.withWhom} is set for ${o.when}.\n\n${o.url ? `Join here: ${o.url}\n\n` : 'The link to join will follow.\n\n'}It is in your account at ${SITE} as well.\n\nRelève`,
    html: shell('Your interview is confirmed',
      p(`${esc(o.name)},`) +
      p(`Your interview with <b>${esc(o.withWhom)}</b> is set for <b>${esc(o.when)}</b>.`) +
      p(o.url ? 'The link to join is below, and in your account.' : 'The link to join will follow. The interview is in your account as well.'),
      o.url ? { label: 'Join the interview', href: o.url } : { label: 'See it in your account', href: `${SITE}/app/interviews` })
  }),

  /* The interview page used to say "we will arrange another time" and then
     tell nobody — the other side found out by turning up to an empty call.
     Sent to whoever did NOT cancel it, whichever side that was. */
  interviewCancelled: (o: { name: string; withWhom: string; when: string }) => ({
    subject: `Your interview needs a new time`,
    text: `${o.name},\n\nYour interview with ${o.withWhom}, set for ${o.when}, has been cancelled. We will write with a new time. Nothing is needed from you in the meantime.\n\n${SITE}/app/interviews\n\nRelève`,
    html: shell('Your interview needs a new time',
      p(`${esc(o.name)},`) +
      p(`Your interview with <b>${esc(o.withWhom)}</b>, set for <b>${esc(o.when)}</b>, has been cancelled.`) +
      p('We will write with a new time. Nothing is needed from you in the meantime.'),
      { label: 'See it in your account', href: `${SITE}/app/interviews` })
  }),

  checkinNudge: (name: string) => ({
    subject: 'Your end of week report',
    text: `${name},\n\nIt is Friday. Four things, about two minutes: your hours, the tasks you completed, a win from the week, and any concerns.\n\n${SITE}/app/checkin\n\nThis comes to us, never to the executive. Please write what is true, so we can be useful to you.\n\nRelève`,
    html: shell('Your end of week report',
      p(`${esc(name)},`) +
      p('It is Friday. Four things, about two minutes: your hours, the tasks you completed, a win from the week, and any concerns.') +
      p('<b>This comes to us, never to the executive.</b> Please write what is true, so we can be useful to you.'),
      { label: 'File your report', href: `${SITE}/app/checkin` })
  }),

  vettingVerified: (name: string) => ({
    subject: 'You are verified',
    text: `${name},\n\nEverything checks out, and you can now be matched with an executive.\n\nNothing you sent is ever shown to an executive. They see that you are verified, never the documents.\n\n${SITE}\n\nRelève`,
    html: shell('You are verified',
      p(`${esc(name)},`) +
      p('Everything checks out, and you can now be matched with an executive.') +
      p('Nothing you sent is ever shown to an executive. They see that you are verified, never the documents.'),
      { label: 'Open your account', href: SITE })
  }),

  vettingRejected: (name: string, item: string, reason: string) => ({
    subject: `${item} needs a new upload`,
    text: `${name},\n\nWe could not accept the ${item.toLowerCase()} you sent. ${reason}\n\nNothing else is affected. Upload another at ${SITE}/app/vetting when you have a moment. It takes about a minute.\n\nRelève`,
    html: shell('One document to send again',
      p(`${esc(name)},`) +
      p(`We could not accept the ${esc(item.toLowerCase())} you sent.`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #B0C4B2;">${esc(reason)}</p>` +
      p('Nothing else is affected. Upload another when you have a moment. It takes about a minute.'),
      { label: 'Upload a new copy', href: `${SITE}/app/vetting` })
  }),

  /* Sent to the talent the moment they sign their contractor agreement in the
     app. The PDF rides on the message itself (see send()). */
  talentAgreementSigned: (name: string) => ({
    subject: 'Your signed Relève contractor agreement',
    text: `${name},\n\nThank you. Your Independent Contractor and Confidentiality Agreement is signed. Your copy is attached for your records, and kept on your Verification page.\n\n${SITE}/app/vetting\n\nRelève`,
    html: shell('Your agreement is signed',
      p(`${esc(name)},`) +
      p('Thank you. Your copy of the Independent Contractor and Confidentiality Agreement is attached for your records, and kept on your Verification page.'),
      { label: 'Open your account', href: `${SITE}/app/vetting` })
  }),

  /* The team's note that a talent signed, with the same copy attached. */
  talentAgreementSignedTeam: (o: { name: string; email: string; country: string }) => ({
    subject: `${o.name} signed the contractor agreement`,
    text: `${o.name} (${o.email}), resident in ${o.country}, signed the Independent Contractor and Confidentiality Agreement in the app. The signed copy is attached and filed on their Verification record.\n\n${SITE}/console/vetting\n\nRelève`,
    html: shell('An agreement was signed',
      p(`<b>${esc(o.name)}</b> (${esc(o.email)}), resident in ${esc(o.country)}, signed the Independent Contractor and Confidentiality Agreement in the app.`) +
      p('The signed copy is attached and filed on their Verification record.'),
      { label: 'Open Verification', href: `${SITE}/console/vetting` })
  }),

  /* The signed copy, for the client's own records, sent the moment they sign
     in the app. The PDF rides on the message itself (see send()). */
  clientAgreementSigned: (name: string, depositDue = true) => ({
    subject: 'Your signed Relève Client Services Agreement',
    text: `${name},\n\nThank you. Your Client Services Agreement is signed. Your copy is attached for your records, and kept in your Relève account.${depositDue ? '\n\nThe next step is your $500 deposit, which opens your search.' : ''}\n\n${SITE}/app\n\nRelève`,
    html: shell('Your agreement is signed',
      p(`${esc(name)},`) +
      p('Thank you. Your copy of the Client Services Agreement is attached for your records, and kept in your Relève account.') +
      (depositDue ? p('The next step is your $500 deposit, which opens your search.') : ''),
      { label: 'Open your account', href: `${SITE}/app` })
  }),

  /* The team's note that an executive signed, with the same copy attached. */
  clientAgreementSignedTeam: (o: { name: string; email: string }) => ({
    subject: `${o.name} signed the Client Services Agreement`,
    text: `${o.name} (${o.email}) signed the Client Services Agreement in the app. The signed copy is attached and filed on their row in People.\n\n${SITE}/console/people\n\nRelève`,
    html: shell('An agreement was signed',
      p(`<b>${esc(o.name)}</b> (${esc(o.email)}) signed the Client Services Agreement in the app.`) +
      p('The signed copy is attached and filed on their row in People.'),
      { label: 'Open People', href: `${SITE}/console/people` })
  }),

  clientAgreementReady: (name: string) => ({
    subject: 'Your Client Services Agreement is ready to sign',
    text: `${name},\n\nYour Relève Client Services Agreement is waiting in your account. You read and sign it on screen, in about two minutes.\n\n${SITE}/agreement\n\nRelève`,
    html: shell('Your agreement is ready',
      p(`${esc(name)},`) +
      p('Your Client Services Agreement is waiting in your account. You read and sign it on screen, in about two minutes.'),
      { label: 'Sign your agreement', href: `${SITE}/agreement` })
  }),

  /* Three different letters under one name, told apart by `kind`:
     'team'    someone wrote to Relève (goes to their manager, or every admin)
     'manager' their Success Manager replied (named, when there is one)
     'direct'  the other side of a placement wrote to them directly
     The direct one used to say "Your account manager has replied" above a
     message from the executive or the talent, which was simply untrue. href
     deep-links to the right tab, so the reply box is one tap away. */
  newMessage: (o: {
    name: string; from: string; preview: string; toTeam: boolean;
    kind?: 'team' | 'manager' | 'direct'; href?: string
  }) => {
    const kind = o.kind ?? (o.toTeam ? 'team' : 'manager');
    const href = o.href ?? (kind === 'team' ? `${SITE}/console/messages` : `${SITE}/app/messages`);
    /* A reply from the team is signed as the brand. o.from carries who is
       answering in words ("Your Client Success Manager"), never a person. */
    const head = kind === 'team' ? `${o.from} wrote to you`
      : kind === 'direct' ? `A message from ${o.from}`
      : 'A reply from Relève';
    const lead = kind === 'team' ? `${o.from} has written to you.`
      : kind === 'direct' ? `${o.from} has written to you directly.`
      : `${o.from} has replied to your message.`;
    return {
      subject: head,
      text: `${o.name},\n\n${lead}\n\n"${o.preview}"\n\nRead and reply: ${href}\n\nRelève`,
      html: shell(esc(head),
        p(`${esc(o.name)},`) + p(esc(lead)) +
        `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #B0C4B2;font-style:italic;">${esc(o.preview)}</p>`,
        { label: 'Read and reply', href })
    };
  },

  /* Day one. Creating a placement used to send nothing to anybody: nine
     onboarding steps appeared in an account neither side was told to open. */
  placementStarted: (o: { name: string; withWhom: string; startsOn: string; side: 'client' | 'talent' }) => ({
    subject: `Your placement starts ${o.startsOn}`,
    text: `${o.name},\n\n${o.side === 'client' ? `${o.withWhom} starts with you on ${o.startsOn}.` : `You start with ${o.withWhom} on ${o.startsOn}.`}\n\nYour 90-Day Success Plan is waiting in your account: the kick-off call, the tools to share, the rhythm to agree, and the first things to hand over. It is short, and the first week goes better when you follow it.\n\n${SITE}/app/care\n\nRelève`,
    html: shell(o.side === 'client' ? 'Your placement begins' : 'Your start date is set',
      p(`${esc(o.name)},`) +
      p(o.side === 'client'
        ? `<b>${esc(o.withWhom)}</b> starts with you on <b>${esc(o.startsOn)}</b>.`
        : `You start with <b>${esc(o.withWhom)}</b> on <b>${esc(o.startsOn)}</b>.`) +
      p('Your 90-Day Success Plan is waiting in your account: the kick-off call, the tools to share, the rhythm to agree, and the first things to hand over. It is short, and the first week goes better when you follow it.'),
      { label: 'Open your plan', href: `${SITE}/app/care` })
  }),

  emailTest: (name: string) => ({
    subject: 'Relève: email is working',
    text: `${name},\n\nIf you are reading this, the platform can send email. Applications, approvals, interview confirmations and invitations will reach people.\n\nRelève`,
    html: shell('Email is working',
      p(`${esc(name)},`) +
      p('If you are reading this, the platform can send email. Applications, approvals, interview confirmations and invitations will reach people.'))
  }),

  /* Someone applied to a posting. They are a stranger — this is the first
     thing Relève ever says to them, so it says something true and stops. */
  applicationReceived: (o: { name: string; role: string }) => ({
    subject: `We have your application: ${o.role}`,
    text: `${o.name},\n\nThank you for applying for ${o.role}. A person will read your application. We do not screen with software.\n\nIf it looks like a fit, the next step is a short call with us: twenty to thirty minutes, a conversation rather than a test. We will write with a time.\n\nIf it is not a fit this time, we will tell you so, rather than leave you waiting.\n\nRelève`,
    html: shell('We have your application',
      p(`${esc(o.name)},`) +
      p(`Thank you for applying for <b>${esc(o.role)}</b>. A person will read your application. We do not screen with software.`) +
      p('If it looks like a fit, the next step is a short call with us: twenty to thirty minutes, a conversation rather than a test. We will write with a time.') +
      p('If it is not a fit this time, we will tell you so, rather than leave you waiting.'))
  }),

  /* To the team, the moment someone applies — everything they wrote, not just
     a name and a link, so the call to book a screening call (or not) can be
     made straight from the inbox if that is faster than opening the console. */
  newApplication: (o: {
    full_name: string; role: string; email: string;
    phone: string | null; location: string | null; years: number | null;
    heard_via: string | null; links: string | null; resume_name: string | null;
    english_speaking: string | null; english_writing: string | null;
    answers: Record<string, string>; note: string | null;
  }) => {
    const english = o.english_speaking || o.english_writing
      ? `speaking: ${o.english_speaking ?? '·'} · writing: ${o.english_writing ?? '·'}`
      : null;
    const facts = [
      o.location, o.years != null ? `${o.years} ${o.years === 1 ? 'year' : 'years'} experience` : null,
      english,
      o.heard_via ? `found us via ${o.heard_via.toLowerCase()}` : null
    ].filter(Boolean).join(' · ');
    /* Every value here is a stranger's own typing, HTML-escaped before it
       goes into the letter — an applicant with a hostile "note" or "links"
       field should produce ugly text in the team's inbox, never a link, an
       image, or markup that changes how the message renders. */
    const block = (label: string, v: string | null | undefined) => v
      ? `<div style="margin:0 0 15px;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4E6B57;margin-bottom:5px;">${esc(label)}</div>` +
        `<p style="margin:0;padding:12px 16px;background:#F1F6F1;border-left:2px solid #B0C4B2;white-space:pre-wrap;">${esc(v)}</p></div>`
      : '';
    const textAnswers = [
      ...APPLY_QUESTIONS.map(q => o.answers[q.key] ? `${q.label}\n${o.answers[q.key]}\n` : ''),
      o.note ? `Anything else\n${o.note}\n` : ''
    ].filter(Boolean).join('\n');
    return {
      subject: `${o.full_name} applied: ${o.role}`,
      text: `${o.full_name} applied for ${o.role}.\n\n${o.email}${o.phone ? ` · ${o.phone}` : ''}${facts ? `\n${facts}` : ''}\n${o.links ? `\nLinks: ${o.links}\n` : ''}${o.resume_name ? `Resume: ${o.resume_name} (in the console)\n` : ''}${textAnswers ? `\n${textAnswers}` : ''}\n${SITE}/console/applications`,
      html: shell('A new application',
        p(`<b>${esc(o.full_name)}</b> applied for <b>${esc(o.role)}</b>.`) +
        p(`<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${o.phone ? ` · ${esc(o.phone)}` : ''}${facts ? ` · ${esc(facts)}` : ''}`) +
        (o.links ? p(`Links: ${esc(o.links)}`) : '') +
        (o.resume_name ? p(`Resume attached: ${esc(o.resume_name)}. Open the console to read it.`) : '') +
        APPLY_QUESTIONS.map(q => block(q.label, o.answers[q.key])).join('') +
        block('Anything else', o.note),
        { label: 'Open in the console', href: `${SITE}/console/applications` })
    };
  },

  /* The screening call, sent to somebody who has no account and no reason to
     trust an unfamiliar sender. It says who, when, in their own timezone, and
     what the call is for — and it says what happens if the time is wrong. */
  callInvite: (o: { name: string; role: string; when: string; url: string | null; minutes: number }) => ({
    subject: `A call about your application: ${o.role}`,
    text: `${o.name},\n\nWe have read your application for ${o.role} and we would like to talk.\n\n${o.when}\nAbout ${o.minutes} minutes.\n${o.url ? `\nJoin here: ${o.url}\n` : '\nWe will send the joining link before the call.\n'}\nIt is a conversation, not a test. We would like to hear how you work, and to answer any questions you have about Relève. There is nothing to prepare.\n\nIf that time does not suit you, reply to this email and we will find another.\n\nRelève`,
    html: shell('We would like to talk',
      p(`${esc(o.name)},`) +
      p(`We have read your application for <b>${esc(o.role)}</b>, and we have set aside a time.`) +
      p(`<b>${esc(o.when)}</b><br>About ${o.minutes} minutes.`) +
      p('It is a conversation, not a test. We would like to hear how you work, and to answer any questions you have about Relève. There is nothing to prepare.') +
      p('If that time does not suit you, reply to this email and we will find another.'),
      o.url ? { label: 'Join the call', href: o.url } : undefined)
  }),

  callMoved: (o: { name: string; when: string; url: string | null }) => ({
    subject: 'Your Relève call has moved',
    text: `${o.name},\n\nYour call has been moved to:\n\n${o.when}\n${o.url ? `\nJoin here: ${o.url}\n` : ''}\nIf this time does not suit you, reply and we will find another.\n\nRelève`,
    html: shell('Your call has moved',
      p(`${esc(o.name)},`) +
      p(`Your call is now <b>${esc(o.when)}</b>.`) +
      p('If this time does not suit you, reply and we will find another.'),
      o.url ? { label: 'Join the call', href: o.url } : undefined)
  }),

  /* The invitation out of the applicant pile and into the roster.
     ---------------------------------------------------------------
     "Two short assessments, twenty to twenty-five minutes total" used to
     be the whole promise here — true only if Skills, Vetting and the
     Watch did not exist. They do, and the Watch alone runs two and a half
     to three hours per discipline claimed. Overselling the time in the
     first email a candidate reads is not a warm welcome, it is a broken
     promise waiting to happen a week in — so this now names the Signature
     specifically (the one part the twenty-to-twenty-five-minute figure is
     actually true of) and leaves the rest to the account itself, which
     tracks each step honestly as it comes. */
  applicationInvited: (o: { name: string; role: string }) => ({
    /* An applicant with no recorded name gets a plain welcome, never
       "Welcome to Relève, there". */
    subject: o.name ? `Welcome to Relève, ${o.name}` : 'Welcome to Relève',
    text: `${o.name || 'Hello'},\n\nThank you for interviewing with us. We would like to move forward.\n\nThree steps come next:\n\n1. Sign your agreement. A copy is attached to read first, and you sign it in your account: ${SITE}/agreement\n2. Complete the Talent Signature. Twenty to twenty-five minutes, saved as you go.\n3. Verify your identity.\n\nOnce they are done, we can begin matching you with an executive.\n\nCreate your account with this email address, and each step will be waiting for you: ${SITE}\n\nRelève`,
    html: shell(o.name ? `Welcome to Relève, ${esc(o.name)}` : 'Welcome to Relève',
      p(`${o.name || 'Hello'},`) +
      p('Thank you for interviewing with us. We would like to move forward.') +
      p('Three steps come next:') +
      p(`<b>1.</b> <a href="${SITE}/agreement" style="color:#35443A;">Sign your agreement.</a> A copy is attached to read first, and you sign it in your account.<br><b>2.</b> Complete the Talent Signature. Twenty to twenty-five minutes, saved as you go.<br><b>3.</b> Verify your identity.`) +
      p('Once they are done, we can begin matching you with an executive. Create your account with this email address, and each step will be waiting for you.'),
      { label: 'Create your account', href: SITE })
  }),

  /* Sent the moment Relève approves a candidate for an executive. The site and
     the app both promise this mail; for a long time nothing sent it. */
  candidateReady: (o: { name: string; candidate: string }) => ({
    subject: 'Your candidate is ready to meet',
    text: `${o.name},\n\nWe have found someone for you. ${o.candidate} has been vetted on six fronts, identity verified, matched against your Signature and the role you described, and briefed on how you work.\n\nRead the match in your account and tell us yes or no. That is all we need from you.\n\n${SITE}/app/pipeline\n\nRelève`,
    html: shell('Your candidate is ready',
      p(`${esc(o.name)},`) +
      p(`We have found someone for you. <b>${esc(o.candidate)}</b> has been vetted on six fronts, identity verified, matched against your Signature and the role you described, and briefed on how you work.`) +
      p('Read the match in your account and tell us yes or no. That is all we need from you.'),
      { label: 'Meet your candidate', href: `${SITE}/app/pipeline` })
  }),

  shortlisted: (o: { name: string; who: string; candidate?: string }) => ({
    subject: `${o.who} approved ${o.candidate ?? 'their candidate'}`,
    text: `${o.name},\n\n${o.who} has approved ${o.candidate ?? 'the candidate you put forward'} and would like to meet them. Book the introduction from Introductions. Both sides' free times are already there.\n\n${SITE}/console/interviews\n\nRelève`,
    html: shell('A candidate was approved',
      p(`${esc(o.name)},`) +
      p(`<b>${esc(o.who)}</b> has approved <b>${esc(o.candidate ?? 'the candidate you put forward')}</b> and would like to meet them.`) +
      p('Book the introduction from Introductions. Both sides\' free times are already there.'),
      { label: 'Book the introduction', href: `${SITE}/console/interviews` })
  }),

  /* A decline brings the next person forward — which only happens if
     Relève hears about it. The reason is the most useful thing in here. */
  candidateDeclined: (o: { name: string; who: string; candidate: string; reason?: string | null; note?: string | null }) => ({
    subject: `${o.who} declined ${o.candidate}`,
    text: `${o.name},\n\n${o.who} has declined ${o.candidate}.${o.reason ? `\n\nReason: ${o.reason}` : ''}${o.note ? `\nIn their words: “${o.note}”` : ''}\n\nThe candidate has not been told. Release the next person from Matching.\n\n${SITE}/console/matching\n\nRelève`,
    html: shell('A candidate was declined',
      p(`${esc(o.name)},`) +
      p(`<b>${esc(o.who)}</b> has declined <b>${esc(o.candidate)}</b>.`) +
      (o.reason || o.note
        ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #9A7B3F;">${o.reason ? `<b>${esc(o.reason)}</b>` : ''}${o.reason && o.note ? '<br>' : ''}${o.note ? `“${esc(o.note)}”` : ''}</p>`
        : '') +
      p('The candidate has not been told. Release the next person from Matching.'),
      { label: 'Open Matching', href: `${SITE}/console/matching` })
  }),

  /* The offer. Both sides get the same letter, and neither sees the other's
     number — because the number is not in it. */
  offerMade: (name: string, role: string, startsOn: string) => {
    const when = fmtDate(startsOn);
    return {
      subject: `Your offer from Relève: ${role}`,
      text: `${name},\n\nAn offer is waiting in your account: ${role}, starting ${when}.\n\nThe role, the hours and the terms are all there. Read them through, then give us your yes or no. Nothing is settled until both sides have answered.\n\n${SITE}/app\n\nRelève`,
      html: shell('An offer is waiting',
        p(`${esc(name)},`) +
        p(`<b>${role}</b>, starting <b>${when}</b>.`) +
        p('The role, the hours and the terms are in your account. Read them through, then give us your yes or no.') +
        p('Nothing is settled until both sides have answered.'),
        { label: 'Open your offer', href: `${SITE}/app` })
    };
  },

  paymentReceived: (o: { name: string; number: string; amount: string }) => ({
    subject: `Payment received: ${o.amount}`,
    text: `${o.name},\n\nThank you. We have received ${o.amount}${o.number ? ` against invoice ${o.number}` : ''}. Nothing further is needed from you.\n\nBank transfers can take a few days to clear, so this note may arrive a little after the debit shows on your statement.\n\nYour billing page has the full history: ${SITE}/app/billing\n\nRelève`,
    html: shell('Payment received',
      p(`${esc(o.name)},`) +
      p(`Thank you. We have received <b>${o.amount}</b>${o.number ? ` against invoice <b>${o.number}</b>` : ''}. Nothing further is needed from you.`) +
      p('Bank transfers can take a few days to clear, so this note may arrive a little after the debit shows on your statement.'),
      { label: 'See your billing', href: `${SITE}/app/billing` })
  }),

  /* A charge that did not go through, told the moment it happens rather than
     left for the 14-day-late flag to eventually surface (admin-console
     audit, P1). Points at the fix (retry from Billing), never at the miss. */
  paymentFailed: (o: { name: string; number: string; amount: string }) => ({
    subject: `A payment needs another try: ${o.amount}`,
    text: `${o.name},\n\nThe payment of ${o.amount}${o.number ? ` for invoice ${o.number}` : ''} did not go through, so it is still outstanding. This is usually a bank declining the debit, and a second attempt often clears.\n\nYou can retry it from your billing page at any time. If you would prefer a different payment method, reply to this email.\n\n${SITE}/app/billing\n\nRelève`,
    html: shell('A payment needs another try',
      p(`${esc(o.name)},`) +
      p(`The payment of <b>${o.amount}</b>${o.number ? ` for invoice <b>${o.number}</b>` : ''} did not go through, so it is still outstanding. This is usually a bank declining the debit, and a second attempt often clears.`) +
      p('You can retry it from your billing page at any time. If you would prefer a different payment method, reply to this email.'),
      { label: 'Retry the payment', href: `${SITE}/app/billing` })
  }),

  /* To the team, the same moment — so a failed charge is a task on Money
     today, not a discovery two weeks from now. */
  paymentFailedTeam: (o: { client: string; number: string; amount: string; reason?: string | null }) => ({
    subject: `Payment failed: ${o.client}, ${o.amount}`,
    text: `${o.client}'s ${o.amount}${o.number ? ` (invoice ${o.number})` : ''} was declined.${o.reason ? ` Reason: ${o.reason}` : ''}\n\nThey have already been emailed with a retry link. Worth a follow-up if it is still open in a few days.\n\n${SITE}/console/money\n\nRelève`,
    html: shell('Payment failed',
      p(`<b>${esc(o.client)}</b>'s <b>${o.amount}</b>${o.number ? ` (invoice <b>${o.number}</b>)` : ''} was declined.`) +
      (o.reason ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #8C4A3F;">${esc(o.reason)}</p>` : '') +
      p('They have already been emailed with a retry link. Worth a follow-up if it is still open in a few days.'),
      { label: 'Open Billing', href: `${SITE}/console/money` })
  }),

  /* A talent's own monthly pay, marked sent or failed by the team on
     Payroll — the notification half of that screen that never existed
     (talent-experience audit, P0). 'due' fires nothing; a talent already
     sees that state by simply not having a payment yet. */
  talentPaymentSent: (o: { name: string; amount: string; period: string; reference?: string | null }) => ({
    subject: `Your pay is on its way: ${o.amount}`,
    text: `${o.name},\n\n${o.amount} for ${o.period} has been sent to you.${o.reference ? ` Reference: ${o.reference}.` : ''}\n\nIt is on your pay page whenever you want to see it.\n\n${SITE}/app/pay\n\nRelève`,
    html: shell('Your pay is on its way',
      p(`${esc(o.name)},`) +
      p(`<b>${o.amount}</b> for ${o.period} has been sent to you.${o.reference ? ` Reference: <b>${esc(o.reference)}</b>.` : ''}`) +
      p('It is on your pay page whenever you want to see it.'),
      { label: 'See your pay', href: `${SITE}/app/pay` })
  }),

  talentPaymentFailed: (o: { name: string; amount: string; period: string }) => ({
    subject: `About your ${o.period} payment`,
    text: `${o.name},\n\nYour ${o.amount} payment for ${o.period} did not go through. We are looking into it, and nothing is needed from you. Reply at any time if you would like an update.\n\n${SITE}/app/pay\n\nRelève`,
    html: shell('About your payment',
      p(`${esc(o.name)},`) +
      p(`Your <b>${o.amount}</b> payment for ${o.period} did not go through.`) +
      p('We are looking into it, and nothing is needed from you. Reply at any time if you would like an update.'),
      { label: 'See your pay', href: `${SITE}/app/pay` })
  }),

  /* ---- offers: the answer is the moment the business earns money ---- */
  /* To the team, every time either side answers. */
  offerAnswered: (o: { who: string; side: 'executive' | 'talent'; answer: 'yes' | 'no'; role: string; both: boolean; reason?: string | null }) => ({
    subject: o.both
      ? `Both sides said yes: ${o.role}`
      : `${o.who} said ${o.answer === 'yes' ? 'yes' : 'no'} to the offer: ${o.role}`,
    text: o.both
      ? `Both sides have accepted the offer for ${o.role}. Make the placement from Matching, Offers. That opens their shared task list, the 90-Day Success Plan and the end of week reports.\n\n${SITE}/console/offers\n\nRelève`
      : `${o.who} (${o.side}) said ${o.answer === 'yes' ? 'yes' : 'no'} to the offer for ${o.role}.${o.reason ? `\n\nReason: ${o.reason}` : ''}\n\n${o.answer === 'yes' ? 'Waiting on the other side.' : 'The offer is closed. Decide what happens next from Matching, Offers.'}\n\n${SITE}/console/offers\n\nRelève`,
    html: shell(o.both ? 'Both sides said yes' : `${esc(o.who)} said ${o.answer}`,
      (o.both
        ? p(`Both sides have accepted the offer for <b>${esc(o.role)}</b>.`) +
          p('Make the placement from Matching, Offers. That opens their shared task list, the 90-Day Success Plan and the end of week reports.')
        : p(`<b>${esc(o.who)}</b> (${o.side}) said <b>${o.answer}</b> to the offer for <b>${esc(o.role)}</b>.`) +
          (o.reason ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #9A7B3F;">${esc(o.reason)}</p>` : '') +
          p(o.answer === 'yes' ? 'Waiting on the other side.' : 'The offer is closed. Decide what happens next from Matching, Offers.')),
      { label: 'Open Offers', href: `${SITE}/console/offers` })
  }),

  /* To each side once both have said yes. No number in it — each side's
     own terms are in their account, and nobody else's. */
  offerAgreed: (o: { name: string; withWhom: string; role: string; startsOn: string }) => {
    const when = fmtDate(o.startsOn);
    return {
      subject: `Confirmed: ${o.role}`,
      text: `${o.name},\n\nBoth sides have said yes. You and ${o.withWhom} are starting ${when}: ${o.role}.\n\nWe will now confirm the start and set up your shared workspace, with the task list, the 90-Day Success Plan and the weekly rhythm. One more email follows when it is live.\n\n${SITE}/app\n\nRelève`,
      html: shell('Both sides said yes',
        p(`${esc(o.name)},`) +
        p(`You and <b>${esc(o.withWhom)}</b> are starting <b>${when}</b>: ${o.role}.`) +
        p('We will now confirm the start and set up your shared workspace, with the task list, the 90-Day Success Plan and the weekly rhythm. One more email follows when it is live.'),
        { label: 'Open your account', href: `${SITE}/app` })
    };
  },

  /* ---- time off ---- */
  identityUploaded: (o: { talent: string }) => ({
    subject: `Identity document to check: ${o.talent}`,
    text: `${o.talent} has uploaded their proof of identity. The checklist promises a decision within one working day.\n\n${SITE}/console/vetting\n\nRelève`,
    html: shell('Identity document to check',
      p(`<b>${esc(o.talent)}</b> has uploaded their proof of identity. The checklist promises a decision within one working day.`),
      { label: 'Open Verification', href: `${SITE}/console/vetting` })
  }),
  watchSubmitted: (o: { talent: string; discipline: string }) => ({
    subject: `Watch submitted: ${o.talent}, ${o.discipline}`,
    text: `${o.talent} has submitted Taking The Watch for ${o.discipline}. The checklist promises a review within two working days.\n\n${SITE}/console/watch\n\nRelève`,
    html: shell('Watch submitted',
      p(`<b>${esc(o.talent)}</b> has submitted Taking The Watch for <b>${esc(o.discipline)}</b>. The checklist promises a review within two working days.`),
      { label: 'Open the Watch queue', href: `${SITE}/console/watch` })
  }),
  timeOffRequested: (o: { talent: string; from: string; to: string; reason?: string | null }) => ({
    subject: `Time off requested: ${o.talent}, ${o.from} to ${o.to}`,
    text: `${o.talent} has asked for time off from ${o.from} to ${o.to}.${o.reason ? `\n\n“${o.reason}”` : ''}\n\nApprove it and record who covers from Care.\n\n${SITE}/console/care\n\nRelève`,
    html: shell('Time off requested',
      p(`<b>${esc(o.talent)}</b> has asked for time off from <b>${o.from}</b> to <b>${o.to}</b>.`) +
      (o.reason ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #35443A;">“${esc(o.reason)}”</p>` : '') +
      p('Approve it and record who covers from Care.'),
      { label: 'Open Care', href: `${SITE}/console/care` })
  }),
  timeOffDecided: (o: { name: string; from: string; to: string; approved: boolean; cover?: string | null }) => ({
    subject: o.approved ? `Your time off is approved: ${o.from} to ${o.to}` : `About your time off: ${o.from} to ${o.to}`,
    text: `${o.name},\n\n${o.approved
      ? `Your time off from ${o.from} to ${o.to} is approved.${o.cover ? ` Cover: ${o.cover}.` : ''} Please share your handover with the executive before you go.`
      : `We are not able to approve time off from ${o.from} to ${o.to} this time. Your Talent Success Manager will write to you about it, and you can reply here if you would like to talk it through.`}\n\n${SITE}/app/care\n\nRelève`,
    html: shell(o.approved ? 'Your time off is approved' : 'About your time off',
      p(`${esc(o.name)},`) +
      p(o.approved
        ? `You are clear to be away from <b>${o.from}</b> to <b>${o.to}</b>.${o.cover ? ` Cover: ${esc(o.cover)}.` : ''} Please share your handover with the executive before you go.`
        : `We are not able to approve time off from <b>${o.from}</b> to <b>${o.to}</b> this time. Your Talent Success Manager will write to you about it, and you can reply here if you would like to talk it through.`),
      { label: 'Open your placement', href: `${SITE}/app/care` })
  }),

  /* ---- feedback, shared deliberately ---- */
  feedbackShared: (o: { name: string; period: string }) => ({
    subject: `Feedback from Relève: ${o.period}`,
    text: `${o.name},\n\nYour Talent Success Manager has written up ${o.period}: what is going well, and one thing to build on. It is in your account.\n\n${SITE}/app/care\n\nRelève`,
    html: shell('Your feedback is ready',
      p(`${esc(o.name)},`) +
      p(`Your Talent Success Manager has written up <b>${o.period}</b>: what is going well, and one thing to build on. It is in your account.`),
      { label: 'Read your feedback', href: `${SITE}/app/care` })
  }),

  /* ---- tasks: the two moments each side needs to hear about ---- */
  taskAssigned: (o: { name: string; from: string; title: string; due?: string | null; priority?: string | null }) => ({
    subject: `New task from ${o.from}: ${o.title}`,
    text: `${o.name},\n\n${o.from} added a task for you: ${o.title}.${o.due ? `\nDue ${o.due}.` : ''}${o.priority ? `\nPriority: ${o.priority}.` : ''}\n\n${SITE}/app/tasks\n\nRelève`,
    html: shell('A new task for you',
      p(`${esc(o.name)},`) +
      p(`<b>${esc(o.from)}</b> added a task for you: <b>${esc(o.title)}</b>.${o.due ? ` Due <b>${esc(o.due)}</b>.` : ''}${o.priority ? ` Priority: ${esc(o.priority)}.` : ''}`),
      { label: 'Open your tasks', href: `${SITE}/app/tasks` })
  }),
  taskReview: (o: { name: string; by: string; title: string }) => ({
    subject: `Ready for your review: ${o.title}`,
    text: `${o.name},\n\n${o.by} has finished ${o.title} and it is ready for your review. Accept it, or send it back with a note.\n\n${SITE}/app/tasks\n\nRelève`,
    html: shell('Ready for your review',
      p(`${esc(o.name)},`) +
      p(`<b>${esc(o.by)}</b> has finished <b>${esc(o.title)}</b>. Accept it, or send it back with a note.`),
      { label: 'Review the task', href: `${SITE}/app/tasks` })
  }),
  taskAccepted: (o: { name: string; by: string; title: string }) => ({
    subject: `Accepted: ${o.title}`,
    text: `${o.name},\n\n${o.by} accepted ${o.title}. It is done and off the list.\n\n${SITE}/app/tasks\n\nRelève`,
    html: shell('Task accepted',
      p(`${esc(o.name)},`) +
      p(`<b>${esc(o.by)}</b> accepted <b>${esc(o.title)}</b>. It is done and off the list.`),
      { label: 'Open your tasks', href: `${SITE}/app/tasks` })
  }),
  taskSentBack: (o: { name: string; by: string; title: string; note: string }) => ({
    subject: `One more pass: ${o.title}`,
    text: `${o.name},\n\n${o.by} sent ${o.title} back with a note:\n\n“${o.note}”\n\nIt is back on your list as in progress.\n\n${SITE}/app/tasks\n\nRelève`,
    html: shell('One more pass',
      p(`${esc(o.name)},`) +
      p(`<b>${esc(o.by)}</b> sent <b>${esc(o.title)}</b> back with a note:`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #35443A;">“${esc(o.note)}”</p>` +
      p('It is back on your list as in progress.'),
      { label: 'Open the task', href: `${SITE}/app/tasks` })
  }),
  taskOverdue: (o: { name: string; title: string; due: string; executive: string }) => ({
    subject: `Still open: ${o.title}`,
    text: `${o.name},\n\n${o.title} was due ${o.due} and is still open. If it is finished, mark it done. If something is in the way, ask ${o.executive} about it on the task, so you both know where it stands.\n\n${SITE}/app/tasks\n\nRelève`,
    html: shell('A task is still open',
      p(`${esc(o.name)},`) +
      p(`<b>${esc(o.title)}</b> was due ${esc(o.due)}. If it is finished, mark it done. If something is in the way, ask ${esc(o.executive)} about it on the task, so you both know where it stands.`),
      { label: 'Open your tasks', href: `${SITE}/app/tasks` })
  }),
  tasksOverdueTeam: (o: { items: { talent: string; executive: string; title: string; due: string }[] }) => ({
    subject: `${o.items.length === 1 ? 'A task is' : `${o.items.length} tasks are`} two days past due`,
    text: `These tasks are two or more days past their date and still open:\n\n${o.items.map(i => `${i.talent} for ${i.executive}: ${i.title} (due ${i.due})`).join('\n')}\n\nThe talent was nudged the day after. Worth a word from the Talent Success Manager before the executive asks.\n\n${SITE}/console/placements\n\nRelève`,
    html: shell('Two days past due',
      p('These tasks are two or more days past their date and still open:') +
      `<ul style="margin:0 0 15px;padding-left:18px;">${o.items.map(i => `<li style="margin:0 0 6px;"><b>${esc(i.talent)}</b> for ${esc(i.executive)}: ${esc(i.title)} (due ${esc(i.due)})</li>`).join('')}</ul>` +
      p('The talent was nudged the day after. Worth a word from the Talent Success Manager before the executive asks.'),
      { label: 'Open Placements', href: `${SITE}/console/placements` })
  }),
  taskDone: (o: { name: string; by: string; title: string }) => ({
    subject: `Done: ${o.title}`,
    text: `${o.name},\n\n${o.by} marked a task done: ${o.title}.\n\n${SITE}/app/tasks\n\nRelève`,
    html: shell('A task is done',
      p(`${esc(o.name)},`) +
      p(`<b>${esc(o.by)}</b> marked a task done: <b>${esc(o.title)}</b>.`),
      { label: 'See the list', href: `${SITE}/app/tasks` })
  }),

  /* ---- Taking The Watch, scored ---- */
  watchScored: (o: { name: string; discipline: string; cleared: boolean; feedback?: string | null }) => ({
    subject: o.cleared ? `You cleared Taking The Watch: ${o.discipline}` : `Taking The Watch: ${o.discipline}`,
    text: `${o.name},\n\n${o.cleared
      ? `Your Taking The Watch for ${o.discipline} has been reviewed, and you cleared it. You can now be put forward for ${o.discipline} roles.`
      : `Your Taking The Watch for ${o.discipline} has been reviewed and did not clear this time.`}${o.feedback ? `\n\nFeedback: ${o.feedback}` : ''}\n\n${SITE}/app/watch\n\nRelève`,
    html: shell(o.cleared ? 'You cleared the Watch' : 'Your Watch has been reviewed',
      p(`${esc(o.name)},`) +
      p(o.cleared
        ? `Your Taking The Watch for <b>${o.discipline}</b> has been reviewed. You can now be put forward for ${o.discipline} roles.`
        : `Your Taking The Watch for <b>${o.discipline}</b> has been reviewed and did not clear this time.`) +
      (o.feedback ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #35443A;">${esc(o.feedback)}</p>` : ''),
      { label: 'Open Taking The Watch', href: `${SITE}/app/watch` })
  }),

  /* ---- the end of a placement ---- */
  placementEnded: (o: { name: string; withWhom: string; endedOn: string; side: 'client' | 'talent' }) => ({
    subject: 'Your placement has ended',
    text: `${o.name},\n\nYour placement with ${o.withWhom} ended on ${o.endedOn}. ${o.side === 'client'
      ? 'If a replacement is owed under the guarantee, we have already begun and will write with the next candidate.'
      : 'Your profile stays with us, and you are back on the roster for the next role. Your Talent Success Manager will be in touch.'}\n\n${SITE}/app\n\nRelève`,
    html: shell('Your placement has ended',
      p(`${esc(o.name)},`) +
      p(`Your work with <b>${esc(o.withWhom)}</b> came to a close on <b>${o.endedOn}</b>.`) +
      p(o.side === 'client'
        ? 'If a replacement is owed under the guarantee, we have already begun and will write with the next candidate.'
        : 'Your profile stays with us, and you are back on the roster for the next role. Your Talent Success Manager will be in touch.'),
      { label: 'Open your account', href: `${SITE}/app` })
  }),

  /* ---- an interview needs rebooking, and Relève is the one who does it ---- */
  interviewNeedsRebooking: (o: { who: string; withWhom: string; when: string }) => ({
    subject: `Interview cancelled: ${o.who} and ${o.withWhom}`,
    text: `${o.who} cancelled the interview with ${o.withWhom} that was set for ${o.when}. Both were told a new time is coming. Book it from Introductions.\n\n${SITE}/console/interviews\n\nRelève`,
    html: shell('An interview needs rebooking',
      p(`<b>${esc(o.who)}</b> cancelled the interview with <b>${esc(o.withWhom)}</b> set for ${o.when}.`) +
      p('Both were told a new time is coming. Book it from Introductions.'),
      { label: 'Open Introductions', href: `${SITE}/console/interviews` })
  }),

  /* ---- a booking went out without a meeting link ---- */
  meetingLinkOwed: (o: { who: string; withWhom: string; when: string }) => ({
    subject: `Meeting link owed: ${o.who} and ${o.withWhom}, ${o.when}`,
    text: `An interview was booked between ${o.who} and ${o.withWhom} for ${o.when}, but no meeting link could be made (Zoom is not connected). Both sides were told the link is coming. Send it from Introductions.\n\n${SITE}/console/interviews\n\nRelève`,
    html: shell('A meeting link is owed',
      p(`An interview was booked between <b>${esc(o.who)}</b> and <b>${esc(o.withWhom)}</b> for ${o.when}, but no meeting link could be made, because Zoom is not connected.`) +
      p('Both sides were told the link is coming. Send it from Introductions.'),
      { label: 'Open Introductions', href: `${SITE}/console/interviews` })
  }),

  /* To the team each weekday morning, the leads owed a touch today.
     --------------------------------------------------------------
     A lead with a follow-up date that has arrived is a lead quietly going
     cold on the board nobody opened. This lists them, most overdue first,
     so the first thing the morning holds is who to chase. Sent only when
     there is at least one; an empty inbox is the right state, not a letter
     saying so. Each line is name, company, stage and how late. */
  followUps: (o: { leads: { name: string; company: string | null; stage: string; overdue: string }[] }) => {
    const n = o.leads.length;
    const line = (l: typeof o.leads[number]) =>
      `${l.name}${l.company ? `, ${l.company}` : ''} · ${l.stage} · ${l.overdue}`;
    return {
      subject: `${n} lead${n === 1 ? '' : 's'} to follow up with today`,
      text: `${n === 1 ? 'One lead is' : `${n} leads are`} due a follow-up today, most overdue first.\n\n${o.leads.map(line).join('\n')}\n\nOpen your leads: ${SITE}/console/prospects\n\nRelève`,
      html: shell('Leads to follow up with today',
        p(`${n === 1 ? 'One lead is' : `<b>${n}</b> leads are`} due a follow-up today, most overdue first.`) +
        o.leads.map(l =>
          `<p style="margin:0 0 10px;"><b style="color:#35443A;">${esc(l.name)}</b>${l.company ? `, ${esc(l.company)}` : ''}` +
          `<br><span style="color:#35443A;font-size:13.5px;">${esc(l.stage)} · ${esc(l.overdue)}</span></p>`).join(''),
        { label: 'Open your leads', href: `${SITE}/console/prospects` })
    };
  },

  checkinFlagged: (o: { talent: string; why: string }) => ({
    subject: `End of week report needs a look: ${o.talent}`,
    text: `${o.talent}'s end of week report needs a closer look.\n\n${o.why}\n\n${SITE}/console/checkins\n\nRelève`,
    html: shell('An end of week report needs a look',
      p(`<b>${esc(o.talent)}</b>'s end of week report needs a closer look.`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F1F6F1;border-left:2px solid #7A2E26;">${esc(o.why)}</p>`,
      { label: 'Open end of week reports', href: `${SITE}/console/checkins` })
  })
};

/* Each template tagged with its own name.
   ---------------------------------------
   The log is only useful if a row says which message it was, and a `kind`
   written by hand at each of the twenty call sites is a `kind` that goes stale
   the first time somebody copies a line. Taking it from the key means a new
   template is loggable the moment it exists, and cannot be mislabelled. */
type Built = { subject: string; text: string; html: string; from?: string };
type Tagged<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Built
    ? (...args: A) => Message
    : never;
};

export const templates = Object.fromEntries(
  Object.entries(rawTemplates).map(([kind, build]) => [
    kind,
    (...args: unknown[]) => ({ ...(build as (...a: unknown[]) => Built)(...args), kind })
  ])
) as Tagged<typeof rawTemplates>;

/* The one nudge an executive gets during onboarding.
   --------------------------------------------------
   Every other nudge in this file is post-placement. An executive who paid the
   deposit, opened their Signature and then got pulled back into their day was
   chased by nothing at all — and the Signature is the gate on being matched,
   so one stalled Signature quietly stops the whole search while the fourteen
   days run. Sent once, a few days in, never again. (12 October audit.)

   Short, and with no deadline in it: this person has already paid. The job is
   to make coming back easy, not to apply pressure to someone who is owed
   work. */
export function signatureNudge(name: string): Message {
  return {
    kind: 'signatureNudge',
    subject: 'Your Signature, whenever you have fifteen minutes',
    text: `${name},\n\nYour search is open and we are ready to source against it. The one thing we need from you is your Executive Signature.\n\nIt takes about fifteen minutes and saves as you go, so you can stop and come back to it.\n\n${SITE}/app/signature\n\nRelève`,
    html: shell('Your Executive Signature',
      p(`${esc(name)},`) +
      p('Your search is open and we are ready to source against it. The one thing we need from you is your Executive Signature.') +
      p('It takes about fifteen minutes and saves as you go, so you can stop and come back to it.'),
      { label: 'Begin your Signature', href: `${SITE}/app/signature` })
  };
}

/* The one message with no template, so the nudge for a monthly pulse can be
   written where it is sent. Kept here so every outbound message still passes
   through one file. */
export function pulseNudge(name: string, month: string, placementId: string): Message {
  return {
    kind: 'pulseNudge',
    subject: `A minute on ${month}`,
    text: `${name},\n\nA short note on how this month has gone: five taps and two boxes, about a minute.\n\nThis comes to us, never to the person you work with. If something is not right, this is the easiest moment to say so.\n\n${SITE}/app/care\n\nRelève`,
    html: shell('A minute on this month',
      p(`${esc(name)},`) +
      p('A short note on how this month has gone: five taps and two boxes, about a minute.') +
      p('<b>This comes to us, never to the person you work with.</b> If something is not right, this is the easiest moment to say so.'),
      { label: 'Share your month', href: `${SITE}/app/care` })
  };
}

/* The free training's welcome (29 Oct 2026, Nona: "new sign ups get an
   automatic welcome email"). Sent by /api/interest the moment someone opens
   The Handled Business at relevestaffing.com/training, or asks for it on the
   /discovery exit window. They are on the list from then on, so the message
   carries the list's unsubscribe link and headers. Signed by the brand. */
export function trainingWelcome(o: { name: string; unsubscribeUrl?: string; headers?: Record<string, string> }): Message {
  const first = (o.name || '').trim().split(/\s+/)[0] || 'Hello';
  /* One link, on our own domain, with no tracking parameters: on a young
     sending domain every extra outside link and tracking tag counts
     against the inbox. */
  const link = 'https://relevestaffing.com/training';
  const book = 'https://calendly.com/hello-relevestaffing/30min';   /* Nona, 29 Oct: keep this second link */
  const body = shell('Your training is ready.',
      p(`${esc(first)},`) +
      p('Thank you for starting <b>The Handled Business</b>: sixteen short lessons on where a virtual professional steps into every part of a business, what your week looks like before and after, and where the new revenue comes from.') +
      p('Go at your own pace. The first lesson takes five minutes and shows where your week goes.') +
      p('Twice a week you will also receive the Relève letter: short, practical notes on building a business that runs without you.'),
      { label: 'Open your training', href: link },
      { label: 'Or book a discovery call', href: book });
  /* The unsubscribe link sits in the footer, under the button, where people
     look for it. FOOT must match the last words of shell()'s footer exactly,
     or the link silently never appears (it had drifted out of step with the
     6 Nov footer rewrite). */
  const FOOT = 'Replies reach a person.';
  const html = o.unsubscribeUrl && body.includes(FOOT)
    ? body.replace(FOOT, `${FOOT}<br>You are receiving this because you signed up for The Handled Business. <a href="${o.unsubscribeUrl}" style="color:inherit;">Unsubscribe</a>`)
    : body;
  return {
    kind: 'trainingWelcome',
    subject: 'Your Handled Business training',
    text: `${first},\n\nThank you for starting The Handled Business: sixteen short lessons on where a virtual professional steps into every part of a business, what your week looks like before and after, and where the new revenue comes from.\n\nGo at your own pace. The first lesson takes five minutes and shows where your week goes.\n\nOpen your training: ${link}\n\nTwice a week you will also receive the Relève letter: short, practical notes on building a business that runs without you.\n\nOr book a discovery call: ${book}\n\nConsider it handled.\nRelève${o.unsubscribeUrl ? `\n\nUnsubscribe: ${o.unsubscribeUrl}` : ''}`,
    html,
    headers: o.headers
  };
}
