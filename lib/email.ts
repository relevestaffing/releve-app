/* ============================================================
   OUTBOUND EMAIL
   Relève had no way to contact anyone. This is it.

   Sends through Google Workspace SMTP with an app password, so there is
   no third party and no extra bill. If the credentials are absent the
   whole thing quietly does nothing — the app must never fall over
   because an email could not go out.
   ============================================================ */
import nodemailer from 'nodemailer';

const HOST = process.env.SMTP_HOST ?? 'smtp.gmail.com';
const PORT = Number(process.env.SMTP_PORT ?? 465);
const USER = process.env.SMTP_USER;              // team@relevestaffing.com
const PASS = process.env.SMTP_PASS;              // the Google app password
const FROM = process.env.SMTP_FROM ?? (USER ? `Relève <${USER}>` : '');
const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

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

/* Never throws. A failed send is logged and swallowed — losing a
   notification is a nuisance; losing the request that triggered it is a bug. */
export async function send(to: string, subject: string, body: { text: string; html: string }) {
  if (!emailReady()) { console.warn('[email] not configured, skipped:', subject); return false; }
  try {
    await transport().sendMail({ from: FROM, to, subject, text: body.text, html: body.html });
    return true;
  } catch (e) {
    console.error('[email] failed:', subject, e);
    return false;
  }
}

/* ---------- the wrapper every message sits in ---------- */
function shell(headline: string, inner: string, cta?: { label: string; href: string }) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F3EFE6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EFE6;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#FAF8F2;border:1px solid #DDE5DC;">
  <tr><td style="padding:34px 40px 26px;border-bottom:1px solid #DDE5DC;text-align:center;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:7px;text-transform:uppercase;color:#22302A;">Relève</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#66736A;margin-top:7px;">Executive Staffing</div>
  </td></tr>
  <tr><td style="padding:38px 40px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15.5px;line-height:1.65;color:#3C463F;">
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:25px;line-height:1.25;color:#22302A;margin:0 0 18px;">${headline}</h1>
    ${inner}
    ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 6px;">
      <tr><td style="background:#35443A;">
        <a href="${cta.href}" style="display:inline-block;padding:14px 30px;color:#FAF8F2;text-decoration:none;font-size:14px;letter-spacing:1.4px;text-transform:uppercase;">${cta.label}</a>
      </td></tr></table>` : ''}
  </td></tr>
  <tr><td style="padding:22px 40px 30px;border-top:1px solid #DDE5DC;font-family:Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.6;color:#66736A;">
    Relève Executive Staffing · <a href="https://relevestaffing.com" style="color:#66736A;">relevestaffing.com</a><br>
    Replies to this address reach a person, not a mailbox nobody reads.
  </td></tr>
</table></td></tr></table></body></html>`;
}
const p = (s: string) => `<p style="margin:0 0 15px;">${s}</p>`;

/* ---------- the messages ---------- */

export const templates = {
  talentInvite: (name: string) => ({
    subject: 'Your Relève account is ready',
    text: `${name ? name + ',' : 'Hello,'}\n\nYou have been invited to Relève because someone here thinks you are worth placing well.\n\nSign in at ${SITE} using this email address — there is no password, we send you a link.\n\nThere are a few things to do before you can be matched: a twenty-minute assessment, your availability, and verifying who you are. Your dashboard walks you through them.\n\n— Relève`,
    html: shell('Your account is ready',
      p(`${name ? name + ',' : 'Hello,'}`) +
      p('You have been invited to Relève because someone here thinks you are worth placing well.') +
      p('There is no password. Sign in with this email address and we send you a link.') +
      p('Before you can be matched there are a few things to do — a twenty-minute assessment, your availability, and verifying who you are. Your dashboard walks you through them in order.'),
      { label: 'Open your account', href: SITE })
  }),

  clientInvite: (name: string) => ({
    subject: 'Your Relève account',
    text: `${name ? name + ',' : 'Hello,'}\n\nYour Relève account is open at ${SITE}. Sign in with this address — no password, we send a link.\n\nTwo things from you: the Executive Signature, which takes about thirteen minutes, and your availability. Everything after that is ours.\n\n— Relève`,
    html: shell('Your account is open',
      p(`${name ? name + ',' : 'Hello,'}`) +
      p('Everything about your search runs through here. Sign in with this address — there is no password, we send you a link.') +
      p('Two things from you: the Executive Signature, about thirteen minutes, and your availability. Every candidate you see will have been scored against that profile before their name reaches you.'),
      { label: 'Open your account', href: SITE })
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
    subject: `${item} — one more go`,
    text: `${name},\n\nWe could not accept the ${item.toLowerCase()} you sent. ${reason}\n\nUpload another at ${SITE}/app/vetting — it takes a minute.\n\n— Relève`,
    html: shell('One more go',
      p(`${name},`) +
      p(`We could not accept the ${item.toLowerCase()} you sent.`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #B0C4B2;">${reason}</p>` +
      p('Nothing else is affected — send another when you have a moment.'),
      { label: 'Upload another', href: `${SITE}/app/vetting` })
  }),

  newMessage: (o: { name: string; from: string; preview: string; toTeam: boolean }) => ({
    subject: o.toTeam ? `${o.from} wrote to you` : 'A reply from Relève',
    text: `${o.name},\n\n${o.toTeam ? `${o.from} has written to you.` : 'Your account manager has replied.'}\n\n"${o.preview}"\n\n${SITE}/app/messages\n\n— Relève`,
    html: shell(o.toTeam ? `${o.from} wrote to you` : 'A reply from Relève',
      p(`${o.name},`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #B0C4B2;font-style:italic;">${o.preview}</p>`,
      { label: 'Read and reply', href: o.toTeam ? `${SITE}/console/messages` : `${SITE}/app/messages` })
  }),

  shortlisted: (o: { name: string; who: string }) => ({
    subject: `${o.who} would like to meet someone`,
    text: `${o.name},\n\n${o.who} has shortlisted a candidate and would like to meet them.\n\n${SITE}/console/signals\n\n— Relève`,
    html: shell('A shortlist decision',
      p(`${o.name},`) +
      p(`<b>${o.who}</b> has shortlisted a candidate and would like to meet them.`),
      { label: 'See the decision', href: `${SITE}/console/signals` })
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

  checkinFlagged: (o: { talent: string; why: string }) => ({
    subject: `Check-in needs a look — ${o.talent}`,
    text: `${o.talent}'s weekly check-in raised a flag.\n\n${o.why}\n\n${SITE}/console/checkins\n\n— Relève`,
    html: shell('A check-in needs a look',
      p(`<b>${o.talent}</b>'s weekly check-in raised a flag.`) +
      `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #7A2E26;">${o.why}</p>`,
      { label: 'Open check-ins', href: `${SITE}/console/checkins` })
  })
};
