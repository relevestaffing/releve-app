import { hasServiceKey, adminClient, teamEmailsAdmin } from '@/lib/supabase/admin';
import { send, emailReady } from '@/lib/email';
import { unsubscribeUrl, listUnsubscribeHeaders } from '@/lib/subscribers';

/* Relève's email campaign (29 October 2026).
   ------------------------------------------
   Nona's call: twice a week, Tuesdays and Thursdays at 9:00 AM Pacific, from
   The Relève Letter <letter@relevestaffing.com>, drafted by Claude and sent
   automatically unless she holds it. Each draft is written two days ahead
   and emailed to the team as a preview with a link to hold or edit it.

   Nothing is sent without a physical mailing address in the footer
   (CAN-SPAM). Until CAMPAIGN_MAILING_ADDRESS is set in Netlify, drafts are
   still written and previewed, and each one is held at send time with that
   reason, so the team sees exactly what is waiting.

   Recipients are the subscribers list (part 53) where subscribed = true.
   Every message carries that person's own unsubscribe link and the one-tap
   List-Unsubscribe headers (lib/subscribers.ts). */

export type Campaign = {
  id: string; slot: string; send_at: string;
  status: 'scheduled' | 'held' | 'sending' | 'sent' | 'failed' | 'cancelled';
  hold_reason: string | null; topic: string | null;
  subject: string; preheader: string | null; paragraphs: string[];
  cta_label: string | null; cta_url: string | null;
  written_by: 'claude' | 'team';
  recipients: number; delivered: number; error: string | null;
  sent_at: string | null; created_at: string; updated_at: string;
};

const TZ = 'America/Los_Angeles';
const SEND_HOUR = 9;                        // 9:00 AM Pacific
const SEND_DAYS = [2, 4];                   // Tuesday, Thursday
const DRAFT_LEAD_HOURS = 48;                // drafts are written two days ahead
const FROM = () => process.env.CAMPAIGN_FROM || 'The Relève Letter <letter@relevestaffing.com>';
const REPLY_TO = 'hello@relevestaffing.com';
const APP = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');
export const mailingAddress = () => (process.env.CAMPAIGN_MAILING_ADDRESS || '').trim();

export function campaignsReady() { return hasServiceKey(); }

/* ---------- time: 9:00 AM Pacific on the next Tuesdays and Thursdays ---------- */

function pacificParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, wd: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(o.weekday) };
}

/* The UTC instant of a Pacific wall-clock time, correct across daylight saving. */
function pacificToUtc(y: number, m: number, d: number, h: number) {
  let t = Date.UTC(y, m - 1, d, h + 8);
  for (let i = 0; i < 2; i++) {
    const p = pacificParts(new Date(t));
    const diff = (h - p.h + 24) % 24;
    t += (diff > 12 ? diff - 24 : diff) * 3600000;
  }
  return new Date(t);
}

export type Slot = { slot: string; sendAt: Date; day: 'Tuesday' | 'Thursday' };

/* The next send slots within `days` days. */
export function upcomingSlots(now = new Date(), days = 9): Slot[] {
  const out: Slot[] = [];
  const base = pacificParts(now);
  for (let i = 0; i <= days; i++) {
    const noon = pacificToUtc(base.y, base.m, base.d, 12);
    const day = new Date(noon.getTime() + i * 86400000);
    const p = pacificParts(day);
    if (!SEND_DAYS.includes(p.wd)) continue;
    const sendAt = pacificToUtc(p.y, p.m, p.d, SEND_HOUR);
    if (sendAt.getTime() <= now.getTime()) continue;
    const iso = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    out.push({ slot: `${iso}-${p.wd === 2 ? 'tue' : 'thu'}`, sendAt, day: p.wd === 2 ? 'Tuesday' : 'Thursday' });
  }
  return out;
}

export function whenLabel(iso: string) {
  return new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT';
}

/* ---------- data ---------- */

const sb = () => adminClient();

export async function listCampaigns(): Promise<Campaign[]> {
  if (!hasServiceKey()) return [];
  const { data, error } = await sb().from('campaigns').select('*').order('send_at', { ascending: false }).limit(60);
  if (error) return [];
  return (data ?? []) as Campaign[];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const { data } = await sb().from('campaigns').select('*').eq('id', id).maybeSingle();
  return (data as Campaign) ?? null;
}

export async function listStats() {
  if (!hasServiceKey()) return { subscribed: 0, unsubscribed: 0, ready: false };
  const a = await sb().from('subscribers').select('id', { count: 'exact', head: true }).eq('subscribed', true);
  const b = await sb().from('subscribers').select('id', { count: 'exact', head: true }).eq('subscribed', false);
  const c = await sb().from('campaigns').select('id', { count: 'exact', head: true });
  return { subscribed: a.count ?? 0, unsubscribed: b.count ?? 0, ready: !c.error };
}

export async function updateCampaign(id: string, patch: Partial<Campaign>) {
  const { error } = await sb().from('campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* ---------- writing: Claude drafts in Relève's voice ---------- */

/* What each email is about (Nona, 29 October 2026): every email adds real
   value and ends with an invitation to book a discovery call. Four lanes,
   rotated so no two emails in a row feel alike:
     tips     a practical VA or delegation tip the reader can use this week
     trends   what is changing in staffing, remote work and AI right now
              (Claude searches the web for these and names its source)
     stories  founder stories: composite founder scenes, or Relève's own
              founder story
     method   how Relève does it, told through the reader's problem
   Tuesdays draw from tips and trends, Thursdays from stories and method. */
type Lane = 'tips' | 'trends' | 'stories' | 'method';
const ANGLES: Record<Lane, string[]> = {
  tips: [
    'What to hand off first: a simple way to pick the first three tasks (the ones you do weekly, dread, and could explain in ten minutes).',
    'The ten-minute Loom: how recording a task once turns it into a process a virtual professional can own.',
    'Inbox triage a VA can run: the folders, the rules and the one daily summary that gives an owner their mornings back.',
    'Calendar defense: how an assistant protects deep-work blocks and handles rescheduling without the owner in the thread.',
    'The weekly 15-minute check-in that replaces constant pinging, and the three questions to ask in it.',
    'Delegating outcomes, not tasks: how to brief "own client follow-up" instead of "send these emails".',
    'Lead follow-up that never slips: what a VA can do with a CRM in the first month.',
    'Giving access safely: password managers, shared inboxes and permissions when bringing on a virtual professional.',
    'The first two weeks: what a great start looks like for a new virtual hire, day by day.',
    'Life admin is business admin: the personal tasks that quietly drain a founder, and handing them off.'
  ],
  trends: [
    'A current shift in how small businesses and founders are hiring remote or offshore talent.',
    'How AI is changing the executive assistant role right now, and why the best assistants now pair judgment with AI tools.',
    'Current data or reporting on founder burnout, workload or hours worked.',
    'What is happening in the remote work and hiring market this season that matters to a growing business owner.',
    'A recent change in the Philippines or Latin America remote talent market, framed around quality and fit.',
    'The rise of fractional and managed talent, and what it means for owners deciding who to hire next.'
  ],
  stories: [
    'A composite founder: the coach who answered client emails at 11pm until she handed the inbox to someone she trusted.',
    'A composite founder: the agency owner who hired a VA from a job board, spent a month managing them, and what changed the second time.',
    'Relève\'s founder story: seven years as an executive assistant to CEOs and high-net-worth entrepreneurs, six years recruiting, "I have been the talent", and why that is why Relève vets for fit.',
    'A composite founder: the practice owner whose first Monday with a prepared professional felt like exhaling for the first time in years.',
    'Relève\'s founder story: time spent living with talent families in Asia, and what a remote role means for a family there (mission, told with dignity, no poverty imagery).',
    'A composite founder: the consultant who thought she needed a second business partner and actually needed an operator.',
    'A composite founder: the owner who finally took a real vacation because someone else had the watch.'
  ],
  method: [
    'Hires rarely fail on skill. They fail on fit: the right resume, the wrong working style, and how Relève matches to how the owner works.',
    'Vetted on six fronts: what happens before an owner ever meets a candidate.',
    'We interview many, you meet one: why one prepared candidate beats a pile of resumes.',
    'Relief, not one more person to manage: the Client Success Manager and the Talent Success Manager.',
    'The 14-day path from one conversation to a professional at work.',
    'Why Relève takes ten new clients a year, and what that attention looks like for each one.'
  ]
};
const LANES: Record<'Tuesday' | 'Thursday', Lane[]> = { Tuesday: ['tips', 'trends'], Thursday: ['stories', 'method'] };

function pickAngle(day: 'Tuesday' | 'Thursday', n: number) {
  const lanes = LANES[day];
  const lane = lanes[n % lanes.length];
  const list = ANGLES[lane];
  return { lane, angle: list[Math.floor(n / lanes.length) % list.length] };
}

const VOICE = `You write Relève's twice-weekly email to business owners and founders. Every email must do two things: give the reader something genuinely useful or moving, and make booking a free 30-minute discovery call feel like the natural next step.

About Relève: a premium virtual executive staffing agency. It places a vetted, fully managed virtual professional (executive assistants and other remote staff, from the Philippines and Latin America) with founders, and supports them for the life of the relationship through a Client Success Manager and a Talent Success Manager. Every candidate is vetted on six fronts: the business is studied first and the role built around it; tested for the role with a graded, paid work sample; matched to how the owner works through the Relève Signature working-style and personality assessment; background checked and verified; "we interview many, you meet one"; and a person signs off before anyone is presented. They are prepared for the role before day one. First candidate within 14 days. Up to two replacements. Talent at 30% of the cost of a local hire. Relève takes ten new clients a year, deliberately. Relève's founder, Sage Jackson, spent seven years as an executive assistant to CEOs and high-net-worth entrepreneurs and six years recruiting before founding Relève.

Positioning: trust and relief, the feeling of "Consider it handled." The reader's real fears are "can I trust someone with this?" and "will they add work instead of removing it?" Never lead with cost, cheapness, offshore savings, or "fix your inbox". Cost may appear only as a supporting line.

The hook: the subject line is what gets the email opened. Make it intriguing and specific: a surprising claim, an open loop, a sharp question, or a concrete moment. It must be honest (the email delivers on it), never clickbait, never all-caps, no "Re:" or "Fwd:" tricks. The first sentence must pay the subject off and pull the reader into the second.

Voice: high-end, calm, direct, warm but never chatty. Write the way a thoughtful founder talks to one owner across a table: plain words, contractions (I'm, don't, you'll), paragraphs of two to four sentences with a natural mix of long and short sentences. Specific and concrete, with one small real moment the reader can picture. Speak to the reader as "you". American English. Say "virtual" so it is clear the staff are remote. Use "prepared" rather than "trained", "supported" or "handled" rather than "managed" when describing talent.

Hard rules: no em dashes or en dashes anywhere (use commas, periods or colons). No prices or plan names. No invented clients, testimonials, quotes, names or statistics. Composite founder stories must read as illustrative ("Picture a coach who...", "We hear this often:"), never as a named or real client. Any number must come either from the facts above or from a source you found by searching, and then you name the source in the sentence (for example "according to Gallup"). Write as Sage, the founder, in the first person ("I", "me"): warm and personal, like a letter to one owner, never corporate and never like AI. Do not write a greeting, a sign-off, an invitation to book, or a line like "Consider it handled": the greeting, the sign-off, the invitation and the booking button are added around your text. The letter must still read for any kind of business owner, not one industry. No emojis. No exclamation marks. Never threaten or shame the reader; point toward the better outcome.

Sound human, not like a template: never open with a bare rule, label, slogan or "Here is the test"; the first paragraph starts like a real note, with a sentence or two of context for why you are writing this week, and only then the idea. Do not stack several one-sentence paragraphs for drama. Avoid "It is not X, it is Y" constructions, lists of three adjectives, "Here is the thing", "Let that sink in", and any line that sounds like a slogan or a LinkedIn post. If a sentence would feel strange said aloud to one person, rewrite it.`;

const FORMAT = `When you are done, return only a JSON object as the last thing you write:
{"subject": "...", "preheader": "...", "paragraphs": ["...", "..."], "cta_label": "..."}
- subject: under 55 characters, the hook.
- preheader: under 90 characters, adds to the subject without repeating it.
- paragraphs: 6 to 9 paragraphs of two to four sentences each, 350 to 550 words in total, written as Sage in the first person. Open warmly in context, then lead with the value and let it breathe; this is a letter, not a blurb. Do NOT write a greeting like "Hello" or "Hi" ("Hello, {name}" is added above your text), a sign-off, an invitation to book, or a closing line like "Consider it handled": those are added around your text. You may mark ONE short, quotable line as a pull quote by starting that paragraph with "> ". You may include ONE short checklist by writing two to four consecutive paragraphs that each start with "- ". End with one final paragraph that starts with "P.S. " giving one more reason to book the call (for example that Relève takes only ten new clients a year). Plain text only, no markdown beyond the "> " and "- " markers, no links or URLs in the text.
- cta_label: 2 to 5 words for the booking button, e.g. "Book your Zoom coffee".`;

const CTA_URL = 'https://relevestaffing.com/discovery';

export type Draft = { subject: string; preheader: string; paragraphs: string[]; cta_label: string; cta_url: string; topic: string };

function clean(s: unknown, max: number) {
  return String(s ?? '').replace(/[–—]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function askClaude(key: string, brief: string, search: boolean) {
  /* The cron and console requests have about 26 seconds in all. */
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), search ? 21000 : 22000);
  const body: any = {
    model: process.env.ANTHROPIC_CAMPAIGN_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    max_tokens: 2500,
    system: `${VOICE}\n\n${FORMAT}`,
    messages: [{ role: 'user', content: brief }]
  };
  if (search) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body), signal: ctl.signal
  }).catch(() => null).finally(() => clearTimeout(timer));
  if (!res) throw new Error(ctl.signal.aborted ? 'The AI took too long. Try again in a moment.' : 'Could not reach the AI service.');
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json())?.error?.message ?? ''; } catch { /* */ }
    throw new Error(`The AI service refused the request (${res.status})${detail ? `: ${detail}` : ''}.`);
  }
  const data: any = await res.json();
  return (data?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
}

/* search: allow a web search for trend emails. The hourly cron allows it
   while the send is more than 30 hours away, so a slow search simply retries
   next hour, and the last day falls back to an evergreen version. */
export async function writeDraft(day: 'Tuesday' | 'Thursday', recentSubjects: string[], topicIndex: number, search = false): Promise<Draft> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Add ANTHROPIC_API_KEY in Netlify so Claude can write the emails.');
  const { lane, angle } = pickAngle(day, topicIndex);
  const laneBrief: Record<Lane, string> = {
    tips: 'This is a VA tip email: teach one practical idea the reader can use this week, concrete enough to act on. Then show how much easier it is when a prepared professional runs it.',
    trends: `This is a staffing trends email. Today's date is ${new Date().toISOString().slice(0, 10)}. Search the web for one current, credible development (from the last few months) that fits the angle, and build the email around it, naming the source in the text. Explain what it means for a founder and what to do about it. If nothing credible and recent turns up, write about the underlying shift without any figures.`,
    stories: 'This is a founder story email: tell a short scene with a beginning, a turn and a feeling of relief at the end, then draw out the lesson for the reader.',
    method: 'This is a Relève method email: open on the reader\'s problem in a vivid moment, then show how Relève solves it, specifically.'
  };
  const brief = (search: boolean) => [
    `This is the ${day} email.`,
    search ? laneBrief[lane] : laneBrief[lane === 'trends' ? 'tips' : lane],
    `Angle: ${angle}`,
    recentSubjects.length ? `Recent subjects, do not repeat their angle, hook style or wording:\n- ${recentSubjects.join('\n- ')}` : ''
  ].filter(Boolean).join('\n\n');

  const useSearch = lane === 'trends' && search;
  const text = await askClaude(key, brief(useSearch), useSearch);
  const start = text.lastIndexOf('{"subject"');
  const m = (start >= 0 ? text.slice(start) : text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI sent back something that was not an email.');
  let j: any; try { j = JSON.parse(m[0]); } catch { throw new Error('The AI sent back an email that could not be read.'); }
  const paragraphs = (Array.isArray(j.paragraphs) ? j.paragraphs : []).map((p: unknown) => clean(p, 1200)).filter(Boolean).slice(0, 13);
  if (!j.subject || paragraphs.length < 3) throw new Error('The AI draft was incomplete.');
  return {
    subject: clean(j.subject, 90), preheader: clean(j.preheader, 140), paragraphs,
    cta_label: clean(j.cta_label, 40) || 'Book your Zoom coffee',
    cta_url: CTA_URL, topic: `${lane}: ${angle}`
  };
}

/* ---------- the email itself ---------- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function withUtm(url: string, slot: string) {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'email');
  u.searchParams.set('utm_campaign', slot);
  return u.toString();
}

/* Gmail and Outlook "dark mode" re-colour any light background they find, which
   turned the letter charcoal and hid the fern logo. A solid colour is what they
   rewrite; a background-image is left alone, so every surface carries both. */
const LIGHT = 'background-color:#FFFFFF;background-image:linear-gradient(#FFFFFF,#FFFFFF);';
const FERN = 'background-color:#35443A;background-image:linear-gradient(#35443A,#35443A);';
export const BODY_OPEN = `<body class="w" bgcolor="#FFFFFF" style="margin:0;padding:0;${LIGHT}">`;

const firstNameOf = (n?: string | null) => {
  const t = String(n ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[A-Za-zÀ-ÿ'’-]{2,24}$/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

export function renderEmail(c: Pick<Campaign, 'subject' | 'preheader' | 'paragraphs' | 'cta_label' | 'cta_url' | 'slot' | 'send_at'>, token: string | null, fullName?: string | null) {
  const unsub = token ? unsubscribeUrl(token) : `${APP()}/unsubscribe`;
  const address = mailingAddress() || '[mailing address goes here]';
  const cta = withUtm(c.cta_url || CTA_URL, c.slot);
  const logo = `${APP()}/logo-fern.png`;
  const first = firstNameOf(fullName);
  const greeting = first ? `Hello ${esc(first)},` : 'Hello,';
  let date = '';
  try { date = new Date(c.send_at).toLocaleDateString('en-US', { timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric' }); } catch { /* */ }

  /* The P.S. is lifted out to sit under the signature; the rest keeps its
     order. A paragraph that opens with "> " is the one pulled line, and a run
     of "- " paragraphs becomes the numbered checklist. */
  const psIdx = c.paragraphs.findIndex(p => /^p\.?\s*s\.?\b/i.test(p.trim()));
  const ps = psIdx >= 0 ? c.paragraphs[psIdx].trim().replace(/^p\.?\s*s\.?[:.\s]*/i, '') : '';
  const flow = c.paragraphs.filter((_, i) => i !== psIdx);

  const SERIF = "Georgia,'Times New Roman',serif";
  const SANS = 'Helvetica,Arial,sans-serif';
  const para = (p: string) => `<p class="ink" style="margin:0 0 20px;font-family:${SERIF};font-size:17px;line-height:1.75;color:#26312B;">${esc(p)}</p>`;
  const quote = (p: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 26px;"><tr><td class="w" style="${LIGHT}border-left:2px solid #35443A;padding:4px 0 4px 20px;"><div class="fern" style="font-family:${SERIF};font-style:italic;font-size:21px;line-height:1.5;color:#35443A;">${esc(p)}</div></td></tr></table>`;
  const list = (items: string[]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 26px;">${items.map((it, k) => `<tr><td class="w" style="${LIGHT}padding:15px 0;border-top:1px solid #DDE5DC;${k === items.length - 1 ? 'border-bottom:1px solid #DDE5DC;' : ''}font-family:${SERIF};"><span class="fern" style="font-style:italic;font-size:19px;color:#35443A;">${String(k + 1).padStart(2, '0')}</span><span class="ink" style="font-size:16.5px;line-height:1.6;color:#26312B;">&nbsp;&nbsp;${esc(it)}</span></td></tr>`).join('')}</table>`;

  let bodyHtml = para(greeting); let i = 0;
  while (i < flow.length) {
    const p = (flow[i] || '').trim();
    if (p.startsWith('> ')) { bodyHtml += quote(p.slice(2).trim()); i++; continue; }
    if (p.startsWith('- ')) { const items: string[] = []; while (i < flow.length && (flow[i] || '').trim().startsWith('- ')) { items.push((flow[i] || '').trim().slice(2).trim()); i++; } bodyHtml += list(items); continue; }
    bodyHtml += para(p); i++;
  }

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(c.subject)}</title>
<style>
:root{color-scheme:light only;supported-color-schemes:light only}
@media (prefers-color-scheme:dark){
  .w{background-color:#FFFFFF!important;background-image:linear-gradient(#FFFFFF,#FFFFFF)!important}
  .f{background-color:#35443A!important;background-image:linear-gradient(#35443A,#35443A)!important}
  .ink{color:#26312B!important}.fern{color:#35443A!important}.mute{color:#5F7466!important}.onf{color:#FFFFFF!important}
}
@media only screen and (max-width:620px){
  .px{padding-left:26px!important;padding-right:26px!important}
  .pad{padding-left:0!important;padding-right:0!important}
}
</style></head>
${BODY_OPEN}
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#FFFFFF;">${esc(c.preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="w" bgcolor="#FFFFFF" style="${LIGHT}"><tr><td align="center" class="w" style="${LIGHT}padding:0 0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="w" bgcolor="#FFFFFF" style="max-width:600px;${LIGHT}border-top:3px solid #35443A;">
  <tr><td class="w px" style="${LIGHT}padding:44px 48px 30px;text-align:center;">
    <img src="${logo}" width="210" alt="Relève Executive Staffing" style="display:block;margin:0 auto;width:210px;max-width:68%;height:auto;border:0;">
    <div class="mute" style="font-family:${SANS};font-size:10.5px;letter-spacing:2.5px;text-transform:uppercase;color:#5F7466;margin-top:22px;white-space:nowrap;">The Letter${date ? ` &nbsp;&middot;&nbsp; ${esc(date)}` : ''}</div>
  </td></tr>
  <tr><td class="w px" style="${LIGHT}padding:0 48px;"><div style="border-top:1px solid #DDE5DC;font-size:0;line-height:0;">&nbsp;</div></td></tr>
  <tr><td class="w px" style="${LIGHT}padding:34px 48px 6px;">${bodyHtml}</td></tr>
  <tr><td class="w px" style="${LIGHT}padding:8px 48px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="f" bgcolor="#35443A" style="${FERN}"><tr><td class="f" style="${FERN}padding:30px 30px;">
      <div class="onf" style="font-family:${SERIF};font-style:italic;font-size:20px;line-height:1.4;color:#FFFFFF;">I'd be glad to do this with you.</div>
      <p class="onf" style="margin:12px 0 22px;font-family:${SERIF};font-size:15.5px;line-height:1.7;color:#E4ECE4;">Book a free 30-minute Zoom coffee. We'll look at your real week together and map the first things to hand off, in order. No pitch, just a plan.</p>
      <a href="${esc(cta)}" style="display:inline-block;background-color:#FFFFFF;color:#35443A;text-decoration:none;font-family:${SANS};font-size:11px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;padding:15px 28px;">${esc(c.cta_label || 'Book your Zoom coffee')}</a>
    </td></tr></table>
  </td></tr>
  <tr><td class="w px" style="${LIGHT}padding:0 48px 34px;">
    <p class="ink" style="margin:0 0 2px;font-family:${SERIF};font-size:17px;line-height:1.7;color:#26312B;">Consider it handled,</p>
    <div class="fern" style="font-family:${SERIF};font-size:30px;color:#35443A;line-height:1.15;margin:4px 0 8px;">Sage</div>
    <div class="mute" style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#5F7466;">Sage Jackson &nbsp;&middot;&nbsp; Founder, Relève</div>
    ${ps ? `<p class="mute" style="margin:26px 0 0;font-family:${SERIF};font-style:italic;font-size:15.5px;line-height:1.7;color:#4C6353;">P.S. ${esc(ps)}</p>` : ''}
  </td></tr>
  <tr><td class="w px" style="${LIGHT}padding:22px 48px 36px;border-top:1px solid #DDE5DC;font-family:${SANS};font-size:12px;line-height:1.75;color:#5F7466;">
    <span class="mute" style="color:#5F7466;">You're receiving The Relève Letter because you shared your email with Relève.<br>
    <a href="${esc(unsub)}" style="color:#35443A;text-decoration:underline;">Unsubscribe</a> &nbsp;&middot;&nbsp; Relève Staffing LLC, ${esc(address)}</span>
  </td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    greeting.replace(/&amp;/g, '&'),
    '',
    ...flow.map(p => (p || '').replace(/^[>\-]\s*/, '')),
    '',
    `${c.cta_label || 'Book your Zoom coffee'}: ${cta}`,
    '',
    'Consider it handled,',
    'Sage',
    'Sage Jackson, Founder, Relève',
    ...(ps ? ['', `P.S. ${ps}`] : []),
    '',
    '---',
    "You're receiving The Relève Letter because you shared your email with Relève.",
    `Unsubscribe: ${unsub}`,
    `Relève Staffing LLC, ${address}`
  ].join('\n');
  return { html, text };
}

/* ---------- the team's preview ---------- */

async function previewToTeam(c: Campaign, note?: string) {
  const team = await teamEmailsAdmin().catch(() => [] as string[]);
  if (!team.length) return;
  const { html: inner } = renderEmail(c, null);
  const banner = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#35443A;background:#EAF1EA;padding:14px 18px;margin:0;">
<b>Preview.</b> This email sends <b>${esc(whenLabel(c.send_at))}</b> to everyone on the list unless you hold it.
${note ? `<br>${esc(note)}` : ''}<br><a href="${APP()}/console/campaigns" style="color:#35443A;">Review, edit or hold it in the console</a></div>`;
  const html = inner.replace(BODY_OPEN, `${BODY_OPEN}${banner}`);
  for (const to of team) {
    await send(to, {
      kind: 'campaignPreview',
      subject: `Preview, ${new Date(c.send_at).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' })}: ${c.subject}`,
      text: `Preview. This email sends ${whenLabel(c.send_at)} unless you hold it: ${APP()}/console/campaigns\n\n${c.paragraphs.join('\n\n')}`,
      html
    } as any);
  }
}

/* ---------- the scheduler: called hourly by the cron ---------- */

export async function draftUpcoming(now = new Date(), force = false) {
  const made: string[] = [];
  const { data: recent } = await sb().from('campaigns').select('subject, slot').order('send_at', { ascending: false }).limit(10);
  const { count } = await sb().from('campaigns').select('id', { count: 'exact', head: true });
  let topicIndex = count ?? 0;
  for (const s of upcomingSlots(now, 4)) {
    const hoursAway = (s.sendAt.getTime() - now.getTime()) / 3600000;
    if (!force && hoursAway > DRAFT_LEAD_HOURS) continue;
    const { data: exists } = await sb().from('campaigns').select('id').eq('slot', s.slot).maybeSingle();
    if (exists) continue;
    const d = await writeDraft(s.day, (recent ?? []).map((r: any) => r.subject), topicIndex++, !force && hoursAway > 30);
    const { data: row, error } = await sb().from('campaigns').insert({
      slot: s.slot, send_at: s.sendAt.toISOString(), status: 'scheduled', topic: d.topic,
      subject: d.subject, preheader: d.preheader, paragraphs: d.paragraphs,
      cta_label: d.cta_label, cta_url: d.cta_url, written_by: 'claude'
    }).select('*').single();
    if (error) { if (/duplicate/i.test(error.message)) continue; throw new Error(error.message); }
    made.push(s.slot);
    await previewToTeam(row as Campaign,
      mailingAddress() ? undefined : 'Sending is waiting on a mailing address (CAMPAIGN_MAILING_ADDRESS in Netlify). Until it is added, this email will be held instead of sent.');
    break;   // one draft per run keeps each request inside its time limit
  }
  return made;
}

async function recipientsFor(id: string) {
  /* Queue everyone subscribed right now; the primary key keeps it idempotent. */
  const { data: subs } = await sb().from('subscribers').select('id, email, unsubscribe_token, full_name').eq('subscribed', true);
  const rows = (subs ?? []).map((s: any) => ({ campaign_id: id, subscriber_id: s.id, email: s.email }));
  for (let i = 0; i < rows.length; i += 500) {
    await sb().from('campaign_sends').upsert(rows.slice(i, i + 500), { onConflict: 'campaign_id,subscriber_id', ignoreDuplicates: true });
  }
  const tokens = new Map((subs ?? []).map((s: any) => [s.id, s.unsubscribe_token as string]));
  const subscribed = new Set((subs ?? []).map((s: any) => s.id));
  const names = new Map((subs ?? []).map((s: any) => [s.id, (s.full_name as string) || null]));
  return { tokens, subscribed, names };
}

export async function sendCampaign(c: Campaign, deadline = Date.now() + 18000) {
  if (!mailingAddress()) {
    await updateCampaign(c.id, { status: 'held', hold_reason: 'Waiting on a mailing address. Add CAMPAIGN_MAILING_ADDRESS in Netlify, then press Resume.' } as any);
    return { held: true };
  }
  if (!emailReady()) {
    await updateCampaign(c.id, { status: 'held', hold_reason: 'Email sending is not configured on the server.' } as any);
    return { held: true };
  }
  /* Claim the campaign before sending so two runners (the hourly job and a
     "Send on schedule" press) never mail the same person twice. A claim is a
     scheduled campaign, or a sending one whose last touch is over a minute
     old (the previous runner stopped at its deadline). */
  const lease = new Date(Date.now() - 60000).toISOString();
  const { data: claimed } = await sb().from('campaigns')
    .update({ status: 'sending', hold_reason: null, updated_at: new Date().toISOString() })
    .eq('id', c.id).or(`status.eq.scheduled,and(status.eq.sending,updated_at.lt.${lease})`).select('id');
  if (!claimed?.length) return { sentNow: 0, done: false, busy: true };
  const { tokens, subscribed, names } = await recipientsFor(c.id);
  const { data: queue } = await sb().from('campaign_sends').select('subscriber_id, email, status').eq('campaign_id', c.id).neq('status', 'sent');
  let sentNow = 0;
  for (const q of (queue ?? []) as any[]) {
    if (Date.now() > deadline) break;                         // the next hourly run carries on
    if (!subscribed.has(q.subscriber_id)) {                   // unsubscribed since queuing
      await sb().from('campaign_sends').delete().eq('campaign_id', c.id).eq('subscriber_id', q.subscriber_id);
      continue;
    }
    const token = tokens.get(q.subscriber_id) || null;
    const { html, text } = renderEmail(c, token, names.get(q.subscriber_id) ?? null);
    const ok = await send(q.email, {
      kind: 'campaign', subject: c.subject, text, html, from: FROM(),
      headers: { ...(token ? listUnsubscribeHeaders(token) : {}), 'Reply-To': REPLY_TO }
    } as any);
    await sb().from('campaign_sends').update({ status: ok ? 'sent' : 'failed', sent_at: ok ? new Date().toISOString() : null, error: ok ? null : 'The mail host refused it.' })
      .eq('campaign_id', c.id).eq('subscriber_id', q.subscriber_id);
    if (ok) sentNow++;
  }
  const { count: total } = await sb().from('campaign_sends').select('subscriber_id', { count: 'exact', head: true }).eq('campaign_id', c.id);
  const { count: delivered } = await sb().from('campaign_sends').select('subscriber_id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'sent');
  const { count: pending } = await sb().from('campaign_sends').select('subscriber_id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'queued');
  const done = (pending ?? 0) === 0;
  await updateCampaign(c.id, {
    status: done ? ((delivered ?? 0) > 0 || (total ?? 0) === 0 ? 'sent' : 'failed') : 'sending',
    recipients: total ?? 0, delivered: delivered ?? 0, sent_at: done ? new Date().toISOString() : null
  } as any);
  return { sentNow, done, delivered: delivered ?? 0, total: total ?? 0 };
}

export async function sendDue(now = new Date()) {
  const { data } = await sb().from('campaigns').select('*').in('status', ['scheduled', 'sending']).lte('send_at', now.toISOString()).order('send_at');
  const out: any[] = [];
  for (const c of (data ?? []) as Campaign[]) out.push({ slot: c.slot, ...(await sendCampaign(c)) });
  return out;
}

/* A single copy to one address, marked as a test, for checking the look. */
export async function sendTest(c: Campaign, to: string) {
  const { html, text } = renderEmail(c, null);
  return send(to, { kind: 'campaignTest', subject: `[Test] ${c.subject}`, text, html, from: FROM(), headers: { 'Reply-To': REPLY_TO } } as any);
}
