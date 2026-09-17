/* ============================================================
   OUTBOUND EMAIL
   Relève had no way to contact anyone. This is it.

   Sends through Google Workspace SMTP with an app password, so there is
   no third party and no extra bill. If the credentials are absent the
   whole thing quietly does nothing — the app must never fall over
   because an email could not go out.
   ============================================================ */
import nodemailer from 'nodemailer';
import { APPLY_QUESTIONS } from './jobs-public';

const HOST = process.env.SMTP_HOST ?? 'smtp.gmail.com';
const PORT = Number(process.env.SMTP_PORT ?? 465);
const USER = process.env.SMTP_USER;              // team@relevestaffing.com
const PASS = process.env.SMTP_PASS;              // the Google app password
const FROM = process.env.SMTP_FROM ?? (USER ? `Relève <${USER}>` : '');
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

/* One built message. Every template returns this shape, and `kind` is the
   template's own name — added automatically at the bottom of this file, so a
   new template cannot be added without also being loggable. */
export type Message = { subject: string; text: string; html: string; kind: string; from?: string };

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
    const { supabaseServer } = await import('./supabase/server');
    const sb = await supabaseServer();
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
export async function sendOrThrow(to: string, msg: Message) {
  if (!emailReady()) {
    await record(msg.kind, to, msg.subject, false,
      'Skipped before it was attempted: the server has no SMTP username or password.');
    throw new Error('No SMTP username or password is set on the server.');
  }
  try {
    const info = await transport().sendMail({
      from: msg.from ?? FROM, to, subject: msg.subject, text: msg.text, html: msg.html
    });
    await record(msg.kind, to, msg.subject, true);
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
    await transport().sendMail({ from: msg.from ?? FROM, to, subject: msg.subject, text: msg.text, html: msg.html });
    await record(msg.kind, to, msg.subject, true);
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
function shell(
  headline: string, inner: string,
  cta?: { label: string; href: string },
  secondary?: { label: string; href: string } | { label: string; href: string }[]
) {
  const links = secondary ? (Array.isArray(secondary) ? secondary : [secondary]) : [];
  /* Apple Mail and a few other clients "smart"-invert an email that never
     says otherwise once the phone is in dark mode — cream backgrounds go
     near-black, fern text goes pale, and a deliberately light, on-brand
     email reads as a dark one nobody designed. These two lines are what
     that inversion checks for; without them, every message this file sends
     is at the mercy of whatever mode the reader's phone happens to be in. */
  /* White throughout, fern for every word that isn't a rule or a border —
     the cream-on-cream card this replaced looked like a printed pamphlet
     next to a real letter. A plain white page reads like the latter, and
     is also the least "template-shaped" a transactional email can look —
     the boxed, tinted-background layout it replaced is exactly the shape
     Gmail's own filter has learned to call promotional. */
  return `<!DOCTYPE html><html><head>
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head><body style="margin:0;padding:0;background:#FFFFFF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#FFFFFF;">
  <tr><td style="padding:0 4px 22px;border-bottom:1px solid #E4E9E3;text-align:center;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;letter-spacing:6px;text-transform:uppercase;color:#35443A;">Relève</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#7C897F;margin-top:6px;">Executive Staffing</div>
  </td></tr>
  <tr><td style="padding:32px 4px 30px;font-family:Helvetica,Arial,sans-serif;font-size:15.5px;line-height:1.65;color:#3F4C43;">
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;line-height:1.3;color:#35443A;margin:0 0 18px;">${headline}</h1>
    ${inner}
    ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
      <tr><td style="background:#35443A;border-radius:2px;">
        <a href="${cta.href}" style="display:inline-block;padding:14px 30px;color:#FFFFFF;text-decoration:none;font-size:14px;letter-spacing:0.6px;">${cta.label}</a>
      </td></tr></table>` : ''}
    ${links.map(s => `<p style="margin:16px 0 0;font-size:13.5px;">
      <a href="${s.href}" style="color:#4C594F;">${s.label} →</a>
    </p>`).join('')}
  </td></tr>
  <tr><td style="padding:20px 4px 0;border-top:1px solid #E4E9E3;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.6;color:#7C897F;">
    Relève Executive Staffing · <a href="https://relevestaffing.com" style="color:#7C897F;">relevestaffing.com</a><br>
    Replies to this address reach a person, not a mailbox nobody reads.
  </td></tr>
</table></td></tr></table></body></html>`;
}
const p = (s: string) => `<p style="margin:0 0 15px;">${s}</p>`;

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
const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ---------- the messages ---------- */

const rawTemplates = {
  talentInvite: (name: string, o?: { docsUrl?: string }) => {
    const links = [{ label: 'Set up how you get paid', href: `${SITE}/app/pay` },
      ...(o?.docsUrl ? [{ label: 'Sign your paperwork', href: o.docsUrl }] : [])];
    return {
      subject: 'Your Relève account is ready',
      text: `${name ? name + ',' : 'Hello,'}\n\nYou have been invited to join the Relève roster — the assessed, verified group we put in front of executives.\n\nSign in at ${SITE} using this email address — there is no password, we send you a link.\n\nThere are a few things to do before you can be matched: a twenty-minute assessment, your availability, and verifying who you are. Your dashboard walks you through them.\n\n${links.map(l => `${l.label}: ${l.href}`).join('\n')}\n\n— Relève`,
      html: shell('Your account is ready',
        p(`${name ? name + ',' : 'Hello,'}`) +
        p('You have been invited to join the Relève roster — the assessed, verified group we put in front of executives.') +
        p('There is no password. Sign in with this email address and we send you a link.') +
        p('Before you can be matched there are a few things to do — a twenty-minute assessment, your availability, and verifying who you are. Your dashboard walks you through them in order.'),
        { label: 'Open your account', href: SITE }, links)
    };
  },

  clientInvite: (name: string, o?: { docsUrl?: string }) => {
    const links = [{ label: "Set up how you'll be invoiced", href: `${SITE}/app/billing` },
      ...(o?.docsUrl ? [{ label: 'Sign your paperwork', href: o.docsUrl }] : [])];
    return {
      subject: 'Your Relève account',
      text: `${name ? name + ',' : 'Hello,'}\n\nYour Relève account is open at ${SITE}. Sign in with this address — no password, we send a link.\n\nTwo things from you: the Executive Signature, which takes about thirteen minutes, and your availability. Everything after that is ours.\n\n${links.map(l => `${l.label}: ${l.href}`).join('\n')}\n\n— Relève`,
      html: shell('Your account is open',
        p(`${name ? name + ',' : 'Hello,'}`) +
        p('Everything about your search runs through here. Sign in with this address — there is no password, we send you a link.') +
        p('Two things from you: the Executive Signature, about thirteen minutes, and your availability. Every candidate you see will have been scored against that profile before their name reaches you.'),
        { label: 'Open your account', href: SITE }, links)
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
  depositReady: (o: { name: string; payUrl: string; cents: number; docsUrl?: string }) => {
    const amount = (o.cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    /* Step 1 falls back to the Terms of Service page (the same link TermsGate
       itself opens, and where the placement terms actually live — Sections 5
       and 6) rather than to SITE, which is step 3's own link. It used to fall
       back to SITE too: harmless once signed in, since the terms gate is the
       first thing anyone hits — but it meant two differently-worded steps
       pointed at the exact same URL, which is exactly the "one CTA with two
       footnotes" this layout was built to avoid. */
    const steps = [
      { n: 1, label: 'Review the agreement', href: o.docsUrl ?? 'https://relevestaffing.com/terms', cta: 'Review agreement' },
      { n: 2, label: `Pay your ${amount} deposit`, href: o.payUrl, cta: `Pay ${amount}` },
      { n: 3, label: 'Set up your Relève account', href: SITE, cta: 'Set up account' }
    ];
    const stepRow = (s: typeof steps[number]) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #E4E9E3;">
        <tr>
          <td style="width:44px;padding:20px 0 20px 20px;vertical-align:top;">
            <div style="width:26px;height:26px;border-radius:50%;background:#35443A;color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:13px;text-align:center;line-height:26px;">${s.n}</div>
          </td>
          <td style="padding:20px 20px 20px 14px;font-family:Helvetica,Arial,sans-serif;">
            <div style="font-size:15.5px;color:#35443A;margin:0 0 12px;">${s.label}</div>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#35443A;border-radius:2px;">
              <a href="${s.href}" style="display:inline-block;padding:10px 20px;color:#FFFFFF;text-decoration:none;font-size:12.5px;">${s.cta}</a>
            </td></tr></table>
          </td>
        </tr>
      </table>`;
    const firstName = o.name ? o.name.split(/\s+/)[0] : '';
    return {
      subject: `Welcome to Relève${firstName ? `, ${firstName}` : ''}`,
      text: `${o.name ? o.name + ',' : 'Hello,'}\n\nGood talking today. Running a growing business without the right person beside you means everything eventually lands on your desk — the calendar, the inbox, the fires only you have time for. Relève is not filling a task list; we are placing your right hand.\n\nYour deposit is what opens the search. Here's what's next: review the agreement, pay your ${amount} deposit, and set up your Relève account:\n\n${steps.map(s => `${s.n}. ${s.label}: ${s.href}`).join('\n')}\n\nYour deposit is credited in full toward your first month once you are placed.\n\nWe are already thinking about who is right for you — talk soon.\n\n— Relève`,
      html: shell(`Welcome to Relève${firstName ? `, ${firstName}` : ''}`,
        p(`${o.name ? o.name + ',' : 'Hello,'}`) +
        p(`Good talking today. Running a growing business without the right person beside you means everything eventually lands on your desk — the calendar, the inbox, the fires only you have time for. Relève is not filling a task list; we are placing your right hand.`) +
        p(`Your deposit is what opens the search. Here's what's next: review the agreement, pay your ${amount} deposit, and set up your Relève account.`) +
        steps.map(stepRow).join('') +
        `<p style="margin:18px 0 0;font-size:13px;color:#7C897F;">Your deposit is credited in full toward your first month once you are placed.</p>` +
        `<p style="margin:20px 0 0;">We are already thinking about who is right for you — talk soon.</p>` +
        `<p style="margin:14px 0 0;">— Relève</p>`)
    };
  },

  /* The moment a profile first exists — not sent by anyone from the console,
     it fires itself the instant someone's first sign-in creates their row.
     Two things belong in it and nothing else: that it worked, and how to put
     it on their home screen, since a bookmark in a browser tab is not what a
     high-end candidate or client experience should look like on a phone. */
  profileWelcome: (name: string | null) => ({
    subject: 'Your profile is live',
    text: `${name ? name + ',' : 'Hello,'}\n\nYour Relève profile is up and running.\n\nOne thing worth doing now: put it on your home screen. Opened that way it behaves like any other app — full screen, no address bar, one tap away.\n\nOn iPhone: open ${SITE}/app in Safari, tap the Share icon, then "Add to Home Screen."\nOn Android: open it in Chrome, tap the menu (⋮), then "Install app" (or "Add to Home Screen").\n\n${SITE}/app\n\n— Relève`,
    html: shell('Your profile is live',
      p(`${name ? name + ',' : 'Hello,'}`) +
      p('Your Relève profile is up and running.') +
      p('One thing worth doing now: put it on your home screen. Opened that way it behaves like any other app — full screen, no address bar, one tap away.') +
      `<div style="margin:0 0 12px;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7C8B7E;margin-bottom:5px;">On iPhone</div>` +
      `<p style="margin:0;padding:12px 16px;background:#F3EFE6;border-left:2px solid #B0C4B2;">Open this in Safari, tap the Share icon, then "Add to Home Screen."</p></div>` +
      `<div style="margin:0 0 15px;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7C8B7E;margin-bottom:5px;">On Android</div>` +
      `<p style="margin:0;padding:12px 16px;background:#F3EFE6;border-left:2px solid #B0C4B2;">Open this in Chrome, tap the menu (⋮), then "Install app."</p></div>`,
      { label: 'Open your profile', href: `${SITE}/app` })
  }),

  interviewBooked: (o: { name: string; withWhom: string; when: string; url: string | null }) => ({
    subject: `Interview confirmed — ${o.when}`,
    text: `${o.name},\n\nYour interview with ${o.withWhom} is confirmed for ${o.when}.\n\n${o.url ? `Join here: ${o.url}\n\n` : 'The joining link will follow.\n\n'}It is in your account at ${SITE} as well.\n\n— Relève`,
    html: shell('Interview confirmed',
      p(`${o.name},`) +
      p(`Your interview with <b>${o.withWhom}</b> is confirmed for <b>${o.when}</b>.`) +
      p(o.url ? 'The joining link is below and in your account.' : 'The joining link will follow shortly.'),
      o.url ? { label: 'Join the interview', href: o.url } : { label: 'See it in your account', href: `${SITE}/app/interviews` })
  }),

  /* The interview page used to say "we will arrange another time" and then
     tell nobody — the other side found out by turning up to an empty call.
     Sent to whoever did NOT cancel it, whichever side that was. */
  interviewCancelled: (o: { name: string; withWhom: string; when: string }) => ({
    subject: `Your interview needs a new time`,
    text: `${o.name},\n\nYour interview with ${o.withWhom}, previously set for ${o.when}, has been cancelled. Nothing further from you — we will be in touch with a new time.\n\n${SITE}/app/interviews\n\n— Relève`,
    html: shell('Your interview needs a new time',
      p(`${o.name},`) +
      p(`Your interview with <b>${o.withWhom}</b>, previously set for <b>${o.when}</b>, has been cancelled.`) +
      p('Nothing further needed from you — we will be in touch with a new time.'),
      { label: 'See it in your account', href: `${SITE}/app/interviews` })
  }),

  checkinNudge: (name: string) => ({
    subject: 'Your week — two minutes',
    text: `${name},\n\nIt is Friday. Your weekly check-in takes about two minutes: what got done, what is in the way, and how the working relationship feels.\n\n${SITE}/app/checkin\n\nThis goes to us, never to the executive. Say what is actually true — it is the only way we can help.\n\n— Relève`,
    html: shell('How was your week?',
      p(`${name},`) +
      p('Two minutes: what got done, what is in the way, and how the working relationship feels.') +
      p('<b>This comes to us, never to the executive.</b> Say what is actually true — it is the only way we can be useful to you.'),
      { label: 'File your check-in', href: `${SITE}/app/checkin` })
  }),

  vettingVerified: (name: string) => ({
    subject: 'You are verified',
    text: `${name},\n\nEverything checks out. You are cleared and can be matched.\n\n${SITE}\n\n— Relève`,
    html: shell('You are verified',
      p(`${name},`) +
      p('Everything checks out. You are cleared, and you can now be matched to an executive.') +
      p('Nothing you sent is ever shown to a client — they see that you are verified, never the documents.'),
      { label: 'Open your account', href: SITE })
  }),

  vettingRejected: (name: string, item: string, reason: string) => ({
    subject: `${item} — needs a retake`,
    text: `${name},\n\nWe could not accept the ${item.toLowerCase()} you sent. ${reason}\n\nUpload another at ${SITE}/app/vetting — it takes a minute.\n\n— Relève`,
    html: shell('Almost there — one document needs a retake',
      p(`${esc(name)},`) +
      p(`We could not accept the ${esc(item.toLowerCase())} you sent.`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #B0C4B2;">${esc(reason)}</p>` +
      p('Nothing else is affected — send another when you have a moment.'),
      { label: 'Upload another', href: `${SITE}/app/vetting` })
  }),

  /* Sent the moment Relève sends the contractor agreement + NDA through
     DocuSign — an embedded envelope is never emailed by DocuSign itself,
     so without this the talent would have no idea it was waiting. */
  agreementReady: (name: string) => ({
    subject: 'Your agreement is ready to sign',
    text: `${name},\n\nYour Relève contractor agreement and NDA are ready. Sign it in your account — it takes about two minutes.\n\n${SITE}/app/vetting\n\n— Relève`,
    html: shell('Ready to sign',
      p(`${name},`) +
      p('Your contractor agreement and NDA are ready. Sign it in your account — it takes about two minutes.'),
      { label: 'Sign your agreement', href: `${SITE}/app/vetting` })
  }),

  newMessage: (o: { name: string; from: string; preview: string; toTeam: boolean }) => ({
    subject: o.toTeam ? `${o.from} wrote to you` : 'A reply from Relève',
    text: `${o.name},\n\n${o.toTeam ? `${o.from} has written to you.` : 'Your account manager has replied.'}\n\n"${o.preview}"\n\n${SITE}/app/messages\n\n— Relève`,
    html: shell(o.toTeam ? `${esc(o.from)} wrote to you` : 'A reply from Relève',
      p(`${esc(o.name)},`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #B0C4B2;font-style:italic;">${esc(o.preview)}</p>`,
      { label: 'Read and reply', href: o.toTeam ? `${SITE}/console/messages` : `${SITE}/app/messages` })
  }),

  /* The invoice actually reaching the person who owes it. Marking a row
     "sent" used to send nothing at all, so a number was minted on a document
     nobody would ever see. payUrl, when there is one, leads — a no-login
     link straight to paying this exact amount — with the account itself as
     the quieter second option, the same shape depositReady already uses. */
  invoiceIssued: (o: { name: string; number: string; amount: string; period: string; due: string; payUrl?: string }) => ({
    subject: `Relève invoice ${o.number} — ${o.period}`,
    text: `${o.name},\n\nInvoice ${o.number} for ${o.period}.\n\nAmount: ${o.amount}\nDue: ${o.due}\n\n${o.payUrl ? `Pay it directly, no sign-in needed: ${o.payUrl}\n\n` : ''}The full invoice is in your account under Billing, along with everything issued before it.\n\n${SITE}/app/billing\n\nIf anything on it looks wrong, reply to this email rather than paying it — we would rather fix it now than sort it out afterwards.\n\n— Relève`,
    html: shell(`Invoice ${o.number}`,
      p(`${o.name},`) +
      p(`<b>${o.amount}</b> for ${o.period}, due ${o.due}.`) +
      p('If anything on it looks wrong, reply to this email rather than paying it — we would rather fix it now than sort it out afterwards.'),
      o.payUrl ? { label: `Pay ${o.amount} now`, href: o.payUrl } : { label: 'See it in your account', href: `${SITE}/app/billing` },
      o.payUrl ? { label: 'Or see it in your account first', href: `${SITE}/app/billing` } : undefined)
  }),

  /* Day one. Creating a placement used to send nothing to anybody: nine
     onboarding steps appeared in an account neither side was told to open. */
  placementStarted: (o: { name: string; withWhom: string; startsOn: string; side: 'client' | 'talent' }) => ({
    subject: `Your placement starts ${o.startsOn}`,
    text: `${o.name},\n\n${o.side === 'client' ? `${o.withWhom} starts with you on ${o.startsOn}.` : `You start with ${o.withWhom} on ${o.startsOn}.`}\n\nYour account has a two-week plan waiting: the kick-off call, the tools to share, the rhythm to agree, and the first things to hand over. It is short, and the first week goes considerably better when it is followed.\n\n${SITE}/app/care\n\n— Relève`,
    html: shell(o.side === 'client' ? 'Your placement starts' : 'You start soon',
      p(`${o.name},`) +
      p(o.side === 'client'
        ? `<b>${o.withWhom}</b> starts with you on <b>${o.startsOn}</b>.`
        : `You start with <b>${o.withWhom}</b> on <b>${o.startsOn}</b>.`) +
      p('Your account has a two-week plan waiting: the kick-off call, the tools to share, the rhythm to agree, and the first things to hand over. It is short, and the first week goes considerably better when it is followed.'),
      { label: 'Open your onboarding plan', href: `${SITE}/app/care` })
  }),

  emailTest: (name: string) => ({
    subject: 'Relève — email is working',
    text: `${name},\n\nIf you are reading this, the platform can send email. Applications, approvals, interview confirmations and invitations will all reach people.\n\n— Relève`,
    html: shell('Email is working',
      p(`${name},`) +
      p('If you are reading this, the platform can send email. Applications, approvals, interview confirmations and invitations will all reach people.'))
  }),

  /* Someone applied to a posting. They are a stranger — this is the first
     thing Relève ever says to them, so it says something true and stops. */
  applicationReceived: (o: { name: string; role: string }) => ({
    subject: `We have your application — ${o.role}`,
    text: `${o.name},\n\nThank you for applying for ${o.role}. Your application is with us and a person will read it — we do not screen with software.\n\nIf it looks like a fit, the next thing is a short call with us: twenty to thirty minutes, a conversation rather than a test. We will write with a time. If it is not a fit this time, we will tell you that too rather than leave you waiting.\n\n— Relève`,
    html: shell('We have your application',
      p(`${o.name},`) +
      p(`Thank you for applying for <b>${o.role}</b>. Your application is with us and a person will read it — we do not screen with software.`) +
      p('If it looks like a fit, the next thing is a short call with us — twenty to thirty minutes, a conversation rather than a test. We will write with a time.') +
      p('If it is not a fit this time, we will tell you that too rather than leave you waiting.'))
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
      ? `speaking: ${o.english_speaking ?? '—'} · writing: ${o.english_writing ?? '—'}`
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
      ? `<div style="margin:0 0 15px;"><div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7C8B7E;margin-bottom:5px;">${esc(label)}</div>` +
        `<p style="margin:0;padding:12px 16px;background:#F3EFE6;border-left:2px solid #B0C4B2;white-space:pre-wrap;">${esc(v)}</p></div>`
      : '';
    const textAnswers = [
      ...APPLY_QUESTIONS.map(q => o.answers[q.key] ? `${q.label}\n${o.answers[q.key]}\n` : ''),
      o.note ? `Anything else\n${o.note}\n` : ''
    ].filter(Boolean).join('\n');
    return {
      subject: `${o.full_name} applied — ${o.role}`,
      text: `${o.full_name} applied for ${o.role}.\n\n${o.email}${o.phone ? ` · ${o.phone}` : ''}${facts ? `\n${facts}` : ''}\n${o.links ? `\nLinks: ${o.links}\n` : ''}${o.resume_name ? `Resume: ${o.resume_name} (in the console)\n` : ''}${textAnswers ? `\n${textAnswers}` : ''}\n${SITE}/console/applications`,
      html: shell('A new application',
        p(`<b>${esc(o.full_name)}</b> applied for <b>${esc(o.role)}</b>.`) +
        p(`<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${o.phone ? ` · ${esc(o.phone)}` : ''}${facts ? ` · ${esc(facts)}` : ''}`) +
        (o.links ? p(`Links: ${esc(o.links)}`) : '') +
        (o.resume_name ? p(`Resume attached — ${esc(o.resume_name)}, open in the console to read it.`) : '') +
        APPLY_QUESTIONS.map(q => block(q.label, o.answers[q.key])).join('') +
        block('Anything else', o.note),
        { label: 'Open in the console', href: `${SITE}/console/applications` })
    };
  },

  /* The screening call, sent to somebody who has no account and no reason to
     trust an unfamiliar sender. It says who, when, in their own timezone, and
     what the call is for — and it says what happens if the time is wrong. */
  callInvite: (o: { name: string; role: string; when: string; url: string | null; minutes: number }) => ({
    subject: `A call about your application — ${o.role}`,
    text: `${o.name},\n\nWe have read your application for ${o.role} and we would like to talk.\n\n${o.when}\nAbout ${o.minutes} minutes.\n${o.url ? `\nJoin here: ${o.url}\n` : '\nWe will send the joining link before the call.\n'}\nThis is a conversation, not a test. We want to hear how you work and answer whatever you want to ask about Relève. Nothing to prepare.\n\nIf that time does not suit you, reply to this email and we will find another. Saying so costs you nothing.\n\n— Relève`,
    html: shell('We would like to talk',
      p(`${o.name},`) +
      p(`We have read your application for <b>${o.role}</b> and we would like to talk.`) +
      p(`<b>${o.when}</b><br>About ${o.minutes} minutes.`) +
      p('This is a conversation, not a test. We want to hear how you work, and to answer whatever you want to ask about Relève. There is nothing to prepare.') +
      p('If that time does not suit you, reply to this email and we will find another. Saying so costs you nothing.'),
      o.url ? { label: 'Join the call', href: o.url } : undefined)
  }),

  callMoved: (o: { name: string; when: string; url: string | null }) => ({
    subject: 'Your Relève call has moved',
    text: `${o.name},\n\nYour call has been moved to:\n\n${o.when}\n${o.url ? `\nJoin here: ${o.url}\n` : ''}\nSorry for the change. If this one does not suit you either, reply and say so.\n\n— Relève`,
    html: shell('Your call has moved',
      p(`${o.name},`) +
      p(`Your call is now <b>${o.when}</b>.`) +
      p('Sorry for the change. If this one does not suit you either, reply and say so.'),
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
  applicationInvited: (o: { name: string; role: string; docsUrl?: string }) => ({
    subject: `Welcome to Relève, ${o.name}`,
    text: `${o.name},\n\nThank you for taking the time to interview with us — we enjoyed learning how you work, and we would like to move forward.\n\n${o.docsUrl ? `Before you get started, you are welcome to sign your NDA and contractor agreement whenever suits you: ${o.docsUrl}\n\n` : ''}Everything else happens inside your Relève account. Relève is a matching platform, not a job board: it starts with the Talent Signature, twenty to twenty-five minutes and saved as you go, followed by a short skills breakdown and identity verification — all of it is what lets us place you with a leader you are genuinely suited to for the long term, rather than whoever happens to be hiring this week.\n\nSet it up and it will walk you through the rest, one step at a time.\n\nCreate your account with this same email address and everything will be waiting for you: ${SITE}\n\n— Relève`,
    html: shell(`Welcome to Relève, ${o.name}`,
      p(`${o.name},`) +
      p('Thank you for taking the time to interview with us — we enjoyed learning how you work, and we would like to move forward.') +
      (o.docsUrl ? p(`Before you get started, you are welcome to sign your <a href="${o.docsUrl}" style="color:#4C594F;">NDA and contractor agreement</a> whenever suits you.`) : '') +
      p('Everything else happens inside your Relève account. Relève is a matching platform, not a job board: it starts with the Talent Signature — twenty to twenty-five minutes, saved as you go — followed by a short skills breakdown and identity verification. All of it is what lets us place you with a leader you are genuinely suited to for the long term, rather than whoever happens to be hiring this week.') +
      p('Set it up and it will walk you through the rest, one step at a time.'),
      { label: 'Create your account', href: SITE })
  }),

  /* Sent the moment Relève approves a candidate for an executive. The site and
     the app both promise this mail; for a long time nothing sent it. */
  candidateReady: (o: { name: string; candidate: string }) => ({
    subject: 'Your candidate is ready to meet',
    text: `${o.name},\n\nWe have someone for you. ${o.candidate} has been vetted, matched against your Signature and the role you described, and briefed on how you work.\n\nRead the match in your account and tell us yes or no — that is all we need.\n\n${SITE}/app/pipeline\n\n— Relève`,
    html: shell('Your candidate is ready to meet',
      p(`${o.name},`) +
      p(`We have someone for you. <b>${o.candidate}</b> has been vetted, matched against your Signature and the role you described, and briefed on how you work.`) +
      p('Read the match and tell us yes or no — that is all we need.'),
      { label: 'See your candidate', href: `${SITE}/app/pipeline` })
  }),

  shortlisted: (o: { name: string; who: string; candidate?: string }) => ({
    subject: `${o.who} approved ${o.candidate ?? 'their candidate'}`,
    text: `${o.name},\n\n${o.who} has approved ${o.candidate ?? 'the candidate you put forward'} and would like to meet them. Book the introduction from Interviews.\n\n${SITE}/console/interviews\n\n— Relève`,
    html: shell('A candidate was approved',
      p(`${o.name},`) +
      p(`<b>${o.who}</b> has approved <b>${o.candidate ?? 'the candidate you put forward'}</b> and would like to meet them.`) +
      p('Book the introduction from Interviews — both sides\' free times are already there.'),
      { label: 'Book the introduction', href: `${SITE}/console/interviews` })
  }),

  /* A decline brings the next person forward — which only happens if
     Relève hears about it. The reason is the most useful thing in here. */
  candidateDeclined: (o: { name: string; who: string; candidate: string; reason?: string | null; note?: string | null }) => ({
    subject: `${o.who} declined ${o.candidate}`,
    text: `${o.name},\n\n${o.who} has declined ${o.candidate}.${o.reason ? `\n\nReason: ${o.reason}` : ''}${o.note ? `\nIn their words: “${o.note}”` : ''}\n\nThe candidate has not been told. Release the next person from Matching.\n\n${SITE}/console/matching\n\n— Relève`,
    html: shell('A candidate was declined',
      p(`${o.name},`) +
      p(`<b>${o.who}</b> has declined <b>${o.candidate}</b>.`) +
      (o.reason || o.note
        ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #9A7B3F;">${o.reason ? `<b>${o.reason}</b>` : ''}${o.reason && o.note ? '<br>' : ''}${o.note ? `“${o.note}”` : ''}</p>`
        : '') +
      p('The candidate has not been told. Release the next person from Matching.'),
      { label: 'Open Matching', href: `${SITE}/console/matching` })
  }),

  /* The offer. Both sides get the same letter, and neither sees the other's
     number — because the number is not in it. */
  offerMade: (name: string, role: string, startsOn: string) => {
    const when = new Date(startsOn + 'T00:00:00Z').toLocaleDateString('en-GB',
      { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      subject: `Your offer from Relève — ${role}`,
      text: `${name},\n\nThere is an offer waiting in your account: ${role}, starting ${when}.\n\nThe role, the hours and the terms are all there. Have a read and say yes or no — nothing is settled until both sides have answered.\n\n${SITE}/app\n\n— Relève`,
      html: shell('There is an offer waiting for you',
        p(`${name},`) +
        p(`<b>${role}</b>, starting <b>${when}</b>.`) +
        p('The role, the hours and the terms are in your account. Have a read and say yes or no.') +
        p('Nothing is settled until both sides have answered.'),
        { label: 'Open your offer', href: `${SITE}/app` })
    };
  },

  paymentReceived: (o: { name: string; number: string; amount: string }) => ({
    subject: `Payment received — ${o.amount}`,
    text: `${o.name},\n\nWe have received ${o.amount}${o.number ? ` against invoice ${o.number}` : ''}. Nothing further is needed.\n\nYour billing page has the full history: ${SITE}/app/billing\n\n— Relève`,
    html: shell('Payment received',
      p(`${o.name},`) +
      p(`We have received <b>${o.amount}</b>${o.number ? ` against invoice <b>${o.number}</b>` : ''}. Nothing further is needed from you.`) +
      p('Bank transfers can take a few days to clear, so this may arrive a little after the debit appeared on your statement.'),
      { label: 'See your billing', href: `${SITE}/app/billing` })
  }),

  /* ---- offers: the answer is the moment the business earns money ---- */
  /* To the team, every time either side answers. */
  offerAnswered: (o: { who: string; side: 'executive' | 'talent'; answer: 'yes' | 'no'; role: string; both: boolean; reason?: string | null }) => ({
    subject: o.both
      ? `Both sides said yes — ${o.role}`
      : `${o.who} said ${o.answer === 'yes' ? 'yes' : 'no'} to the offer — ${o.role}`,
    text: o.both
      ? `Both sides have accepted the offer for ${o.role}. Make the placement from Offers — that opens their shared task list, the 30/60/90 plan and the weekly check-ins.\n\n${SITE}/console/offers\n\n— Relève`
      : `${o.who} (${o.side}) said ${o.answer === 'yes' ? 'yes' : 'no'} to the offer for ${o.role}.${o.reason ? `\n\nReason: ${o.reason}` : ''}\n\n${o.answer === 'yes' ? 'Waiting on the other side.' : 'The offer is closed. Decide what happens next from Offers.'}\n\n${SITE}/console/offers\n\n— Relève`,
    html: shell(o.both ? 'Both sides said yes' : `${o.who} said ${o.answer}`,
      (o.both
        ? p(`Both sides have accepted the offer for <b>${o.role}</b>.`) +
          p('Make the placement from Offers — that opens their shared task list, the 30/60/90 plan and the weekly check-ins.')
        : p(`<b>${o.who}</b> (${o.side}) said <b>${o.answer}</b> to the offer for <b>${o.role}</b>.`) +
          (o.reason ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #9A7B3F;">${o.reason}</p>` : '') +
          p(o.answer === 'yes' ? 'Waiting on the other side.' : 'The offer is closed. Decide what happens next from Offers.')),
      { label: 'Open Offers', href: `${SITE}/console/offers` })
  }),

  /* To each side once both have said yes. No number in it — each side's
     own terms are in their account, and nobody else's. */
  offerAgreed: (o: { name: string; withWhom: string; role: string; startsOn: string }) => {
    const when = new Date(o.startsOn + 'T00:00:00Z').toLocaleDateString('en-GB',
      { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      subject: `It is agreed — ${o.role}`,
      text: `${o.name},\n\nBoth sides have said yes. ${o.withWhom} and you are starting ${when}: ${o.role}.\n\nRelève confirms the start and sets up your shared workspace — the task list, the 30/60/90 plan and the weekly rhythm. You will get one more email when it is live.\n\n${SITE}/app\n\n— Relève`,
      html: shell('It is agreed',
        p(`${o.name},`) +
        p(`Both sides have said yes. <b>${o.withWhom}</b> and you are starting <b>${when}</b>: ${o.role}.`) +
        p('Relève confirms the start and sets up your shared workspace — the task list, the 30/60/90 plan and the weekly rhythm. You will get one more email when it is live.'),
        { label: 'Open your account', href: `${SITE}/app` })
    };
  },

  /* ---- time off ---- */
  timeOffRequested: (o: { talent: string; from: string; to: string; reason?: string | null }) => ({
    subject: `Time off requested — ${o.talent}, ${o.from} to ${o.to}`,
    text: `${o.talent} has asked for time off from ${o.from} to ${o.to}.${o.reason ? `\n\n“${o.reason}”` : ''}\n\nApprove it and record who covers from Care.\n\n${SITE}/console/care\n\n— Relève`,
    html: shell('Time off requested',
      p(`<b>${o.talent}</b> has asked for time off from <b>${o.from}</b> to <b>${o.to}</b>.`) +
      (o.reason ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #35443A;">“${o.reason}”</p>` : '') +
      p('Approve it and record who covers from Care.'),
      { label: 'Open Care', href: `${SITE}/console/care` })
  }),
  timeOffDecided: (o: { name: string; from: string; to: string; approved: boolean; cover?: string | null }) => ({
    subject: o.approved ? `Your time off is approved — ${o.from} to ${o.to}` : `About your time off — ${o.from} to ${o.to}`,
    text: `${o.name},\n\n${o.approved
      ? `Your time off from ${o.from} to ${o.to} is approved.${o.cover ? ` Cover: ${o.cover}.` : ''} Let the executive know your handover before you go.`
      : `We could not approve time off from ${o.from} to ${o.to} this time. Your Talent Success Manager will write to you about it — reply here if you want to talk it through.`}\n\n${SITE}/app/care\n\n— Relève`,
    html: shell(o.approved ? 'Your time off is approved' : 'About your time off',
      p(`${o.name},`) +
      p(o.approved
        ? `Your time off from <b>${o.from}</b> to <b>${o.to}</b> is approved.${o.cover ? ` Cover: ${o.cover}.` : ''} Let the executive know your handover before you go.`
        : `We could not approve time off from <b>${o.from}</b> to <b>${o.to}</b> this time. Your Talent Success Manager will write to you about it — reply here if you want to talk it through.`),
      { label: 'Open your placement', href: `${SITE}/app/care` })
  }),

  /* ---- feedback, shared deliberately ---- */
  feedbackShared: (o: { name: string; period: string }) => ({
    subject: `Feedback from Relève — ${o.period}`,
    text: `${o.name},\n\nYour Talent Success Manager has written up ${o.period}: what is going well, and one thing to build on. It is in your account.\n\n${SITE}/app/care\n\n— Relève`,
    html: shell('There is feedback waiting for you',
      p(`${o.name},`) +
      p(`Your Talent Success Manager has written up <b>${o.period}</b>: what is going well, and one thing to build on.`),
      { label: 'Read it', href: `${SITE}/app/care` })
  }),

  /* ---- tasks: the two moments each side needs to hear about ---- */
  taskAssigned: (o: { name: string; from: string; title: string; due?: string | null; priority?: string | null }) => ({
    subject: `New task from ${o.from} — ${o.title}`,
    text: `${o.name},\n\n${o.from} added a task for you: ${o.title}.${o.due ? `\nDue ${o.due}.` : ''}${o.priority ? `\nPriority: ${o.priority}.` : ''}\n\n${SITE}/app/tasks\n\n— Relève`,
    html: shell('A new task for you',
      p(`${o.name},`) +
      p(`<b>${o.from}</b> added a task for you: <b>${o.title}</b>.${o.due ? ` Due <b>${o.due}</b>.` : ''}${o.priority ? ` Priority: ${o.priority}.` : ''}`),
      { label: 'Open your tasks', href: `${SITE}/app/tasks` })
  }),
  taskDone: (o: { name: string; by: string; title: string }) => ({
    subject: `Done — ${o.title}`,
    text: `${o.name},\n\n${o.by} marked a task done: ${o.title}.\n\n${SITE}/app/tasks\n\n— Relève`,
    html: shell('A task is done',
      p(`${o.name},`) +
      p(`<b>${o.by}</b> marked a task done: <b>${o.title}</b>.`),
      { label: 'See the list', href: `${SITE}/app/tasks` })
  }),

  /* ---- Taking The Watch, scored ---- */
  watchScored: (o: { name: string; discipline: string; cleared: boolean; feedback?: string | null }) => ({
    subject: o.cleared ? `You cleared Taking The Watch — ${o.discipline}` : `Taking The Watch — ${o.discipline}`,
    text: `${o.name},\n\n${o.cleared
      ? `Your Taking The Watch for ${o.discipline} has been reviewed and you cleared it. You are now eligible to be put forward for ${o.discipline} roles.`
      : `Your Taking The Watch for ${o.discipline} has been reviewed and did not clear this time.`}${o.feedback ? `\n\nFeedback: ${o.feedback}` : ''}\n\n${SITE}/app/watch\n\n— Relève`,
    html: shell(o.cleared ? 'You cleared it' : 'Your Watch has been reviewed',
      p(`${o.name},`) +
      p(o.cleared
        ? `Your Taking The Watch for <b>${o.discipline}</b> has been reviewed and you cleared it. You are now eligible to be put forward for ${o.discipline} roles.`
        : `Your Taking The Watch for <b>${o.discipline}</b> has been reviewed and did not clear this time.`) +
      (o.feedback ? `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #35443A;">${o.feedback}</p>` : ''),
      { label: 'Open Taking The Watch', href: `${SITE}/app/watch` })
  }),

  /* ---- the end of a placement, and notice ---- */
  noticeGiven: (o: { name: string; who: string; endsOn: string; toTeam: boolean }) => ({
    subject: o.toTeam ? `Notice given — ${o.who}` : 'Notice received',
    text: o.toTeam
      ? `${o.who} has given notice. The placement runs to ${o.endsOn}, billed to the end of that month as the terms say.\n\n${SITE}/console/care\n\n— Relève`
      : `${o.name},\n\nWe have your notice. The placement runs to ${o.endsOn}, and billing stops at the end of that month, as the terms say. Your Client Success Manager will be in touch about the handover.\n\n${SITE}/app/care\n\n— Relève`,
    html: shell(o.toTeam ? 'Notice given' : 'We have your notice',
      o.toTeam
        ? p(`<b>${o.who}</b> has given notice. The placement runs to <b>${o.endsOn}</b>, billed to the end of that month as the terms say.`)
        : p(`${o.name},`) + p(`We have your notice. The placement runs to <b>${o.endsOn}</b>, and billing stops at the end of that month, as the terms say. Your Client Success Manager will be in touch about the handover.`),
      { label: o.toTeam ? 'Open Care' : 'Open your placement', href: o.toTeam ? `${SITE}/console/care` : `${SITE}/app/care` })
  }),
  placementEnded: (o: { name: string; withWhom: string; endedOn: string; side: 'client' | 'talent' }) => ({
    subject: 'Your placement has ended',
    text: `${o.name},\n\nYour placement with ${o.withWhom} ended on ${o.endedOn}. ${o.side === 'client'
      ? 'If a replacement is owed under the guarantee, we are already on it and will write with the next candidate.'
      : 'Your profile stays with us and you are back on the roster for the next role. Your Talent Success Manager will be in touch.'}\n\n${SITE}/app\n\n— Relève`,
    html: shell('Your placement has ended',
      p(`${o.name},`) +
      p(`Your placement with <b>${o.withWhom}</b> ended on <b>${o.endedOn}</b>.`) +
      p(o.side === 'client'
        ? 'If a replacement is owed under the guarantee, we are already on it and will write with the next candidate.'
        : 'Your profile stays with us and you are back on the roster for the next role. Your Talent Success Manager will be in touch.'),
      { label: 'Open your account', href: `${SITE}/app` })
  }),

  /* ---- an interview needs rebooking, and Relève is the one who does it ---- */
  interviewNeedsRebooking: (o: { who: string; withWhom: string; when: string }) => ({
    subject: `Interview cancelled — ${o.who} and ${o.withWhom}`,
    text: `${o.who} cancelled the interview with ${o.withWhom} that was set for ${o.when}. Both were told a new time is coming — book it from Interviews.\n\n${SITE}/console/interviews\n\n— Relève`,
    html: shell('An interview needs rebooking',
      p(`<b>${o.who}</b> cancelled the interview with <b>${o.withWhom}</b> set for ${o.when}.`) +
      p('Both were told a new time is coming — book it from Interviews.'),
      { label: 'Open Interviews', href: `${SITE}/console/interviews` })
  }),

  /* ---- a booking went out without a meeting link ---- */
  meetingLinkOwed: (o: { who: string; withWhom: string; when: string }) => ({
    subject: `Meeting link owed — ${o.who} and ${o.withWhom}, ${o.when}`,
    text: `An interview was booked between ${o.who} and ${o.withWhom} for ${o.when}, but no meeting link could be made (Zoom is not connected). Both sides were told the link is coming — send it from Interviews.\n\n${SITE}/console/interviews\n\n— Relève`,
    html: shell('A meeting link is owed',
      p(`An interview was booked between <b>${o.who}</b> and <b>${o.withWhom}</b> for ${o.when}, but no meeting link could be made — Zoom is not connected.`) +
      p('Both sides were told the link is coming. Send it from Interviews.'),
      { label: 'Open Interviews', href: `${SITE}/console/interviews` })
  }),

  checkinFlagged: (o: { talent: string; why: string }) => ({
    subject: `Check-in needs a look — ${o.talent}`,
    text: `${o.talent}'s weekly check-in needs a closer look.\n\n${o.why}\n\n${SITE}/console/checkins\n\n— Relève`,
    html: shell('A check-in needs a look',
      p(`<b>${esc(o.talent)}</b>'s weekly check-in needs a closer look.`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #7A2E26;">${esc(o.why)}</p>`,
      { label: 'Open check-ins', href: `${SITE}/console/checkins` })
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

/* The one message with no template, so the nudge for a monthly pulse can be
   written where it is sent. Kept here so every outbound message still passes
   through one file. */
export function pulseNudge(name: string, month: string, placementId: string): Message {
  return {
    kind: 'pulseNudge',
    subject: `How is it going? — ${month}`,
    text: `${name},\n\nA short one: how has this month been?\n\nFive taps and two boxes, and it goes to us rather than to the person you work with — so say what is actually true.\n\n${SITE}/app/care\n\n— Relève`,
    html: shell('How has this month been?',
      p(`${name},`) +
      p('Five taps and two boxes. It takes about a minute.') +
      p('<b>This comes to us, never to the person you work with.</b> If something is not right, this is the cheapest possible moment to say so.'),
      { label: 'File this month', href: `${SITE}/app/care` })
  };
}
