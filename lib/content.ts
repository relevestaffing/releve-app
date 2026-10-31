import { createHmac } from 'crypto';
import { hasServiceKey, adminClient, teamEmailsAdmin } from './supabase/admin';
import { send, shell, p, esc } from './email';
import {
  WEEK_PLAN, DAY_KEYS, DAY_NAMES, slotTime, weekStart, whenLabel, dayLabel, pacificParts, pageFor, CHANNELS,
  type Channel, type ContentPost, type Format, type Slide, type Card, type Script
} from './content-model';
import { igPublishImages, igStartReel, igFinishReel, fbPublishImages, fbPublishVideo, type MetaConn } from './social-meta';
import { linkedinPost, pageAccess, orgFor, type LinkedInConn } from './social-linkedin';
import { vaConfigured, folderIn, upload, appendToDoc } from './google-va';

/* Relève's content engine (30 October 2026).
   -----------------------------------------
   Nona: Sage's LinkedIn six times a week, a training post or carousel in four
   LinkedIn groups five times a week (one may be a face-to-camera video, script
   only), Instagram + Facebook six times a week for clients and three for
   careers, each Instagram/Facebook post copied to the LinkedIn pages. "A lot to
   track each week and a lot to create, so I need it automated."
   How it runs: every Thursday Claude drafts the whole next week and emails the
   team a preview. Everything posts on schedule unless held, except Sage's
   own posts (they wait for the picture she chooses) and what no tool can post
   for us (the groups; the LinkedIn pages until LinkedIn grants page access),
   which arrives in the team's 7:00 AM email with everything ready to paste.
   Relative imports only: the background worker bundles this file. */

const APP = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.relevestaffing.com').replace(/\/+$/, '');
const sb = () => adminClient();
export const contentReady = () => hasServiceKey();

/* ---------- settings and connections ---------- */

export async function getSetting<T = any>(key: string): Promise<T | null> {
  const { data } = await sb().from('content_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? null;
}
export async function putSetting(key: string, value: unknown) {
  const { error } = await sb().from('content_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export type Group = { name: string; url: string };
export async function getGroups(): Promise<Group[]> {
  const g = await getSetting<{ list: Group[] }>('groups');
  const list = g?.list ?? [];
  return [0, 1, 2, 3].map(i => list[i] ?? { name: '', url: '' });
}

/* ---------- links ---------- */

export function sign(id: string, n: number | string) {
  return createHmac('sha256', process.env.CRON_SECRET || 'releve').update(`${id}:${n}`).digest('hex').slice(0, 24);
}
export function imageUrl(id: string, n: number, fmt: 'jpg' | 'png' = 'jpg') {
  return `${APP()}/api/content/render?id=${id}&n=${n}&fmt=${fmt}&t=${sign(id, n)}`;
}
export function pdfUrl(id: string) { return `${APP()}/api/content/pdf?id=${id}&t=${sign(id, 'pdf')}`; }
export function mediaUrl(path: string) {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')}/storage/v1/object/public/content/${path}`;
}
export function imageCount(p: Pick<ContentPost, 'format' | 'card' | 'slides'>) {
  return p.format === 'card' ? (p.card ? 1 : 0) : p.format === 'carousel' ? (p.slides ?? []).length : 0;
}

/* ---------- data ---------- */

export async function listWeek(monday: string): Promise<ContentPost[]> {
  if (!hasServiceKey()) return [];
  const { data, error } = await sb().from('content_posts').select('*').eq('week_start', monday).order('publish_at');
  if (error) return [];
  return (data ?? []) as ContentPost[];
}
export async function getPost(id: string): Promise<ContentPost | null> {
  const { data } = await sb().from('content_posts').select('*').eq('id', id).maybeSingle();
  return (data as ContentPost) ?? null;
}
export async function updatePost(id: string, patch: Partial<ContentPost>) {
  const { error } = await sb().from('content_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function tablesReady() {
  if (!hasServiceKey()) return false;
  const { error } = await sb().from('content_posts').select('id', { head: true, count: 'exact' }).limit(1);
  return !error;
}

/* ---------- writing: Claude drafts in Relève's voice ---------- */

const FACTS = `About Relève: a premium virtual executive staffing agency. It places a vetted, fully supported virtual professional (executive assistants and other remote staff, from the Philippines and Latin America) with founders and business owners, and stays with them for the life of the relationship through a Client Success Manager and a Talent Success Manager. Every candidate is vetted on six fronts: the business is studied first and the role built around it; tested for the role; matched to how the owner works through the Relève Signature working-style and personality assessment; background checked and verified; "we interview many, you meet one"; and a named approval before anyone is presented. Prepared for the role before day one. First candidate within 14 days. Up to two replacements. Talent at 30% of the cost of a local hire. Relève takes ten new clients a year, deliberately. Relève professionals already use AI in their daily work and can help owners map and build automations. The founder is Sage Jackson.

Positioning: trust and relief, the feeling of "Consider it handled." The real fears are "can I trust someone with this?" and "will they add work instead of removing it?" Hires rarely fail on skill; they fail on fit: the right resume, the wrong working style. Owners get their time back for the work that grows the business. Never lead with cost, cheapness, offshore savings or "fix your inbox"; 14 days and 30% are supporting facts only.

Hard rules for every word: no em dashes or en dashes (use commas, periods or colons). No prices or plan names. No invented clients, testimonials, quotes, names or statistics; composite situations are framed as typical, never as a real client. Always make clear the staff are virtual. Say "prepared" rather than "trained", "supported" rather than "managed" when describing talent. American English. No emojis except at most one in an Instagram caption. Never name anyone other than Sage. Never threaten or shame the reader; point toward the better outcome. Every post must be different from the others in the week and from the recent hooks listed.`;

const SAGE = `You are writing as Sage Jackson, founder of Relève, on her personal LinkedIn. Her story: seven years as an executive personal assistant and house manager to CEOs and ultra-high-net-worth entrepreneurs, anticipating needs before they were spoken; then carrying that instinct into scaling businesses: she has helped scale four businesses past seven figures, built out their operations, and hand built the CRM and recruiting system for a $50M company; she helps run a multi-seven-figure mastermind of 49+ business owners; she saw the same failure again and again (the resume matched, the working style did not) and built Relève to fix it. She runs every discovery call herself and gives a free live VA business audit on the call. Voice: first person, calm, sharp, specific, a little contrarian, generous with real lessons. Short lines and white space, the way strong LinkedIn posts read. A scroll-stopping first line. No hashtags except up to three at the very end. No links in the text. End with a question that invites comments, or a quiet invitation to message her.`;

const PILLARS = `The job of every post: make an established owner (1 to 10 people, at least $30k a month, still doing too much themselves; coaches and consultants, agency owners, real estate, e-commerce, professional services, health and wellness practices) think "these people know exactly how my week works", and move them one step closer to booking a discovery call with Sage, where she gives a free live audit of what to delegate.

The quality bar, which every post must clear (Nona rejected a whole week of generic posts, so this is the most important instruction):
- High end and modern: the voice of a top operator who has run founders' lives, not a marketer. Calm, exact, confident. Never cute, never motivational, never a fortune-cookie line.
- Real-world applicable: every post hands the reader something they can use today: a rule they can copy, a script word for word, a checklist, a decision test, a template, the exact handoff steps, the numbers. Name real tools where natural (Gmail, Google Calendar, Calendly, Slack, Notion, Asana, Loom, HubSpot, QuickBooks, Shopify, ChatGPT and other AI tools).
- Specific beats general: real situations (the 11 pm inbox, the Sunday calendar shuffle, the client onboarding that stalls, the invoice nobody sent, the lead that went cold in 48 hours), real times, real numbers. Math is welcome when it is plain arithmetic the reader can check (for example, "10 hours a week of admin at a $250 hourly value is $2,500 a week"). Never invent statistics, studies, clients, results or testimonials.
- One idea per post, fully delivered. No filler, no throat clearing, no "In today's fast-paced world", no "Here's the thing", no "Let that sink in", no "game changer", no rhetorical question openers, no "Picture a founder who".

Directions that pull clients (mix them across the week, never two of the same kind in a row): the exact first 5 tasks to hand off at your revenue level; a before and after of one real working week; the handoff playbook for one area (inbox, calendar, client onboarding, lead follow-up, invoicing, social, CRM hygiene, travel, life admin) with the steps; the scripts (what to say to your assistant, the rules doc, the weekly sync agenda); the hidden cost math of doing it yourself; the hiring mistake that makes owners say "VAs don't work" and how to avoid it (the resume matched, the working style did not); objections answered straight (trust, time zones, quality, security and access, "I tried it before"); behind the scenes of how Relève vets, matches with the Signature assessment and prepares someone before day one; what a prepared executive assistant does in the first 30, 60, 90 days; AI plus a person (what to automate, what still needs a human); decision tests (should you hire, who first, part time or full time); the mission, told with dignity: real careers for skilled professionals in the Philippines and Latin America.

The purpose of every post on Instagram, Facebook and LinkedIn (Nona, 31 October): get attention, then move owners into Relève's system so they become clients. Every post has exactly one next step, and across the week mix them:
- About 4 in 10: the free training, Handled Business, at relevestaffing.com/training (it captures their email, so this is how strangers enter the system).
- About 3 in 10: book a discovery call at relevestaffing.com/discovery, where Sage gives a free live audit of what to delegate.
- About 2 in 10: "comment HANDLED" to be sent the free training (comments build reach and start a conversation in messages).
- About 1 in 10: explore relevestaffing.com (how matching works, the Signature assessment).
On Instagram the link lives in the bio, so write "link in bio" plus the page name; on Facebook and LinkedIn write the full address. Always Relève branded, always worth stopping for, never a hard sell. Scarcity is true and quiet: Relève opens only ten new client spots a year.`;

const DESIGN = `You also design each graphic. The house look is a clean, modern "ledger": Marcellus headlines, figures and text in a modern sans, fine rules, the real working artifact on the page. You choose a layout for every single graphic and every carousel slide, and you fill its fields. Layouts:
- "statement": a headline that lands on its own, plus a short line under it. Use sparingly, at most once a week per account.
- "number": one big figure the reader can check ("number":"$2,500"), the headline is its label, "facts":[{"value":"10 h","label":"admin a week"},...] up to 3 showing the arithmetic.
- "rules": a headline plus "rows":[3 to 5 short lines] that the reader can copy as is (rules, a checklist, the steps, the settings).
- "compare": a headline plus "left":{"label":"Before","items":[3 to 4]} and "right":{"label":"After","items":[3 to 4]} (before and after, myth and reality, doing it yourself and handing it off).
- "chart": a headline plus "bars":[{"label":"Your week now","parts":[{"pct":38,"label":"Admin"},{"pct":37,"label":"Client work"},{"pct":25,"label":"Growth"}]},{"label":"After the handoff","parts":[...]}] and a "note" that marks it illustrative.
- "message": a headline plus "messages":[{"from":"you","text":"..."},{"from":"assistant","text":"..."}], the exact words to send or the reply a prepared assistant gives (2 or 3 messages).
- "notes": looks like an iPhone Notes page. The headline is the note's title in Sage's voice ("What I would hand off first at $40k a month"), "rows":[4 to 7 short lines], optional "note" for the date line.
- "search": looks like a search box. The headline is the owner's real question typed in, in lower case ("how to stop answering every email myself"), "rows":[2 or 3 related searches]; the body answers it in one line. Great as a carousel cover.
- "flags": hiring and working with an assistant, "left":{"label":"Red flags","items":[3 or 4]} and "right":{"label":"Green flags","items":[3 or 4]}. The green flags quietly describe how Relève works, without naming it.
- "quiz": a self-score. The headline asks the question ("Are you ready for an executive assistant?"), "rows":[5 to 7 honest yes/no situations], "note": what the score means and the next step ("3 or more: book the free delegation audit").
- "comment": the comment-to-get post. "keyword":"HANDLED", headline is the promise, body says "Comment HANDLED and we will send you Handled Business, the free training ..." Every caption for it repeats: comment HANDLED and we will send it.
- Carousels only: "cover" for slide 1 (a concrete promise as title, the subtitle as body, optional "chips":[2 to 4 one-word labels]), "step" for a teaching slide (title plus a body under 45 words), "cta" for the last slide.
Every slide in a carousel can use a different layout: mix step with rules, number, compare, chart and message so the reader sees the real thing. Across the week use at least five different layouts and never the same layout on two posts in a row. Each week, every client-facing account (Instagram + Facebook, the groups) includes at least: one "quiz" or "flags" post, one "notes" or "search" post, and one "comment" post (a card, or a carousel whose last slide is the comment layout) offering Handled Business, the free training at relevestaffing.com/training. Keep every figure honest arithmetic or clearly illustrative. Headlines under 70 characters, rows under 70, no em dashes.`;

const FORMAT_RULES: Record<string, string> = {
  li_personal: `Return JSON: {"posts":[{"topic":"...","hook":"first line","text":"the full post, 900 to 1500 characters, line breaks as \\n","image_idea":"one sentence: the kind of photo Sage could pair with it (her own photo, a workspace, a moment)"}]}`,
  li_group: `These go to four LinkedIn groups of business owners as free training. Pure value, no sales pitch; the only invitation is a soft line at the end of the caption pointing to the free training at relevestaffing.com/training. Each teaches one concrete thing a founder can do this week, usually how to hand a specific area of the business to a virtual professional and what changes. Return JSON: {"posts":[{"topic":"...","hook":"...","format":"carousel","caption":"LinkedIn caption, 500 to 1100 characters, \\n for breaks","slides":[{"title":"...","body":"..."}]} ...]}. A carousel has 7 or 8 slides, each {"layout","title","body", plus the layout's own fields}: slide 1 is a "cover" (a specific, concrete promise as title, for example the outcome and the time it takes; a short subtitle as body), the middle slides each teach one step and show the real thing (mix step, rules, number, compare, chart and message), the last slide is a "cta" that sums up and invites them to the free training (body mentions relevestaffing.com/training). For the one post marked video, return instead {"topic","hook","format":"video","caption","script":{"hook":"the first sentence said to camera","beats":["4 to 6 short spoken beats"],"close":"the closing line and invitation","onscreen":["3 to 5 short on-screen text lines"]}}; it should run 60 to 90 seconds spoken, in Sage's first person voice.`,
  ig_client: `For the Relève Instagram and Facebook. Return JSON: {"posts":[...]} where each post is {"topic","hook","format":"card"|"carousel","caption_ig":"Instagram caption: a contrarian hook first line, then three short actionable steps, then why it matters, then the post's one next step (training, discovery call, comment HANDLED or the website, link in bio). 500 to 1200 characters, \\n for breaks, up to 5 relevant hashtags at the end","caption_fb":"Facebook version: casual and conversational, speaking straight to the reader, 300 to 700 characters, ends with the post's next step and its full address","caption_li":"LinkedIn page version: professional, 400 to 900 characters, ends with the post's next step and its full address","card":{"layout":"one of the layouts","kicker":"2 to 4 word label naming what it is, e.g. THE INBOX RULE, HANDOFF SCRIPT, THE MATH","quote":"the headline, under 70 characters","sub":"one short line that makes it concrete (the tool, the time, the result), plus the layout's own fields"} for a card, or "slides":[{"layout","title","body", plus the layout's own fields}] with 6 to 8 slides for a carousel (cover first, last slide a cta or comment layout carrying the post's next step)}.`,
  ig_careers: `For the Relève Careers Instagram and Facebook, talking to experienced remote professionals in the Philippines and Latin America who want a real career with a US executive. Tagline "Take the watch." but always say plainly what Relève Careers is: remote careers supporting US founders and executives, matched to how they work, prepared for the role before day one, supported by a Talent Success Manager. Respect and aspiration, never pity. Calls to action point to applying on relevestaffing.com (Careers). Return JSON: {"posts":[...]} each {"topic","hook","format":"card"|"carousel","caption_ig":"300 to 900 characters, up to 5 hashtags","caption_fb":"conversational, 200 to 600 characters","caption_li":"professional, 300 to 700 characters","card":{"layout","kicker","quote","sub", plus the layout's fields} or "slides":[{"layout","title","body", plus the layout's fields}] with 5 to 7 slides}.`
};

function clean(s: unknown, max: number) {
  return String(s ?? '').replace(/[–—]/g, ', ').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}

async function askClaude(system: string, brief: string, maxTokens = 16000): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Add ANTHROPIC_API_KEY in Netlify so Claude can write the posts.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 600000);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_CONTENT_MODEL || 'claude-opus-5-5',
      max_tokens: maxTokens, system, messages: [{ role: 'user', content: brief }]
    }),
    signal: ctl.signal
  }).catch(() => null).finally(() => clearTimeout(timer));
  if (!res) throw new Error('Could not reach the AI service.');
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json())?.error?.message ?? ''; } catch { /* */ }
    throw new Error(`The AI service refused the request (${res.status})${detail ? `: ${detail}` : ''}.`);
  }
  const data: any = await res.json();
  const text = (data?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI sent back something that was not a set of posts.');
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch { throw new Error(data?.stop_reason === 'max_tokens' ? 'The AI ran out of room before finishing the posts.' : 'The AI sent back posts that could not be read.'); }
}

type Drafted = {
  topic: string; hook: string; format: Format; caption: string; caption_fb?: string; caption_li?: string;
  card?: Card | null; slides?: Slide[]; script?: Script | null; image_idea?: string;
};

const LAYOUTS = ['statement', 'number', 'rules', 'compare', 'chart', 'message', 'cover', 'step', 'cta', 'notes', 'search', 'flags', 'quiz', 'comment'];
/* The design half of a card or slide, cleaned: only known layouts and
   fields, every string trimmed, nothing that could break a graphic. */
function design(x: any) {
  const out: any = {};
  if (LAYOUTS.includes(x?.layout)) out.layout = x.layout;
  if (x?.kicker) out.kicker = clean(x.kicker, 40);
  if (x?.number) out.number = clean(x.number, 12);
  const arr = (a: any, n: number) => (Array.isArray(a) ? a : []).slice(0, n);
  if (Array.isArray(x?.facts)) out.facts = arr(x.facts, 3).map((f: any) => ({ value: clean(f?.value, 14), label: clean(f?.label, 50) })).filter((f: any) => f.value);
  if (Array.isArray(x?.rows)) out.rows = arr(x.rows, 7).map((r: any) => clean(r, 110)).filter(Boolean);
  for (const k of ['left', 'right']) if (x?.[k]?.label) out[k] = { label: clean(x[k].label, 30), items: arr(x[k].items, 5).map((i: any) => clean(i, 90)).filter(Boolean) };
  if (Array.isArray(x?.bars)) out.bars = arr(x.bars, 3).map((b: any) => ({ label: clean(b?.label, 40), parts: arr(b?.parts, 3).map((p: any) => ({ pct: Math.max(0, Math.min(100, Number(p?.pct) || 0)), label: clean(p?.label, 24) })) })).filter((b: any) => b.parts.length);
  if (x?.note) out.note = clean(x.note, 90);
  if (Array.isArray(x?.messages)) out.messages = arr(x.messages, 3).map((m: any) => ({ from: m?.from === 'you' ? 'you' : 'assistant', text: clean(m?.text, 260) })).filter((m: any) => m.text);
  if (Array.isArray(x?.chips)) out.chips = arr(x.chips, 4).map((c: any) => clean(c, 24)).filter(Boolean);
  if (x?.keyword) out.keyword = clean(x.keyword, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return out;
}

function normalize(channel: Channel, raw: any, wanted: Format): Drafted {
  const slides = (Array.isArray(raw?.slides) ? raw.slides : []).map((s: any) => ({ ...design(s), title: clean(s?.title, 140), body: clean(s?.body, 420) }))
    .filter((s: Slide) => s.title).slice(0, 10);
  const card = raw?.card?.quote ? { ...design(raw.card), kicker: clean(raw.card.kicker, 40), quote: clean(raw.card.quote, 200), sub: clean(raw.card.sub, 200) || undefined } : null;
  const script = raw?.script?.hook ? {
    hook: clean(raw.script.hook, 300), close: clean(raw.script.close, 400),
    beats: (raw.script.beats ?? []).map((b: unknown) => clean(b, 500)).filter(Boolean).slice(0, 8),
    onscreen: (raw.script.onscreen ?? []).map((b: unknown) => clean(b, 120)).filter(Boolean).slice(0, 6)
  } : null;
  let format: Format = wanted;
  if (wanted === 'card' && !card && slides.length) format = 'carousel';
  if (wanted === 'carousel' && !slides.length && card) format = 'card';
  const caption = clean(raw?.text ?? raw?.caption ?? raw?.caption_ig, 3000);
  return {
    topic: clean(raw?.topic, 200), hook: clean(raw?.hook, 300), format, caption,
    caption_fb: raw?.caption_fb ? clean(raw.caption_fb, 2000) : undefined,
    caption_li: raw?.caption_li ? clean(raw.caption_li, 3000) : undefined,
    card, slides, script, image_idea: raw?.image_idea ? clean(raw.image_idea, 300) : undefined
  };
}

async function recentHooks(): Promise<string[]> {
  const { data } = await sb().from('content_posts').select('hook').not('hook', 'is', null).order('publish_at', { ascending: false }).limit(60);
  return (data ?? []).map((r: any) => r.hook).filter(Boolean);
}

/* What is going on in a US owner's year that week, so the posts stay
   current: the season, the money calendar, the holidays. */
function seasonFor(monday: string) {
  const d = new Date(`${monday}T12:00:00Z`);
  const m = d.getUTCMonth(), day = d.getUTCDate();
  const notes: Record<number, string> = {
    0: 'January: new-year planning, owners deciding what they will stop doing themselves this year, Q1 hiring.',
    1: 'February: Q1 is underway, tax documents are arriving, Valentine\'s week for consumer brands.',
    2: 'March: end of Q1, tax season pressure, spring launches.',
    3: 'April: US tax deadline mid month, Q2 planning, spring busy season.',
    4: 'May: Mother\'s Day for consumer brands, Memorial Day, summer planning.',
    5: 'June: half-year review, summer schedules and owner vacations.',
    6: 'July: Fourth of July, owners trying to take real time off, Q3 starts.',
    7: 'August: back to school, Q4 planning starts, end of summer.',
    8: 'September: Labor Day, Q4 push, budgets for next year.',
    9: 'October: Q4 in full swing, holiday season preparation, next-year planning begins.',
    10: 'November: Thanksgiving week, Black Friday and Cyber Monday for e-commerce, year-end client gifts, planning 2027 and who to hire before January.',
    11: 'December: year-end close, holidays, owners wanting a real break, January hiring and the 2027 plan.'
  };
  const week = `This is the week of ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.`;
  return `${week} ${notes[m] ?? ''} Use it where it fits naturally; never force it. Use the AI tools owners are actually talking about now when relevant (assistants that work alongside AI, not instead of it).`;
}

/* Draft one channel's posts for a week, in one request. */
async function draftChannel(channel: 'li_personal' | 'li_group' | 'ig_client' | 'ig_careers', formats: Format[], hooks: string[], extra = '', season = '') {
  const system = channel === 'li_personal' ? `${SAGE}\n\n${FACTS}` : `You write Relève's social content.\n\n${FACTS}`;
  /* The team's own notes on how this account's posts should be built (a
     reference post or reel, a structure to follow), set in the Content tab. */
  const style = (await getSetting<{ text: string }>(`style:${channel}`))?.text?.trim();
  const brief = [
    style ? `How these posts should be built (the team's reference, follow it closely for structure, pacing and tone, but keep every fact and rule above):\n${style}` : '',
    `Write ${formats.length} posts, in this order of format: ${formats.join(', ')}.`,
    PILLARS,
    channel === 'li_personal' ? '' : DESIGN,
    FORMAT_RULES[channel],
    season ? `Keep Relève current. ${season}` : '',
    extra,
    hooks.length ? `Recent hooks. Do not repeat their angle, wording or shape:\n- ${hooks.slice(0, 40).join('\n- ')}` : ''
  ].filter(Boolean).join('\n\n');
  /* Opus designs every slide, so a full week in one answer runs long. The
     week is written in parts of up to three posts; each later part is told
     what the earlier ones already covered, so the week still varies. */
  const out: Drafted[] = [];
  for (let at = 0; at < formats.length; at += 3) {
    const part = formats.slice(at, at + 3);
    const done = out.length
      ? `\n\nYou are writing posts ${at + 1} to ${at + part.length} of ${formats.length} for this week. Already written this week (use different topics, layouts and next steps, and cover the weekly minimums the earlier posts did not):\n- ${out.map(d => `${d.topic} | layouts: ${[d.card?.layout, ...(d.slides ?? []).map((x: any) => x.layout)].filter(Boolean).join(', ') || d.format}`).join('\n- ')}`
      : formats.length > 3 ? `\n\nYou are writing posts 1 to ${part.length} of ${formats.length} for this week; the rest are written next.` : '';
    const partBrief = brief.replace(`Write ${formats.length} posts, in this order of format: ${formats.join(', ')}.`, `Write ${part.length} posts, in this order of format: ${part.join(', ')}.`) + done;
    const j = await askClaude(system, partBrief);
    const posts: any[] = Array.isArray(j?.posts) ? j.posts : [];
    if (posts.length < part.length) throw new Error(`The AI wrote ${posts.length} of ${part.length} ${CHANNELS[channel].label} posts.`);
    part.forEach((f, i) => out.push(normalize(channel, posts[i], f)));
  }
  return out;
}

function statusFor(channel: Channel, format: Format) {
  if (channel === 'li_personal') return 'needs_image';
  if (channel === 'li_group') return 'manual';
  if (channel === 'li_page_client' || channel === 'li_page_careers') return pageAccess() ? 'scheduled' : 'manual';
  if (format === 'video') return 'needs_video';
  return 'scheduled';
}

/* Draft the whole week that starts on `monday`. Re-running fills only the
   slots still empty, so an interrupted run simply carries on. */
export async function draftWeek(monday: string) {
  const existing = new Set((await listWeek(monday)).map(r => r.slot));
  const hooks = await recentHooks();
  const made: string[] = [];
  /* Careers posts are paused until a careers Facebook page is chosen in the
     Content tab (31 Oct 2026: the careers page did not come through Meta). */
  const careersOn = Boolean((await getSetting<MetaConn>('conn:meta'))?.careers);
  const families: ('li_personal' | 'li_group' | 'ig_client' | 'ig_careers')[] =
    careersOn ? ['li_personal', 'li_group', 'ig_client', 'ig_careers'] : ['li_personal', 'li_group', 'ig_client'];

  /* All four accounts are written at once (Opus is slower than Sonnet, and
     the worker has 15 minutes), then saved in order. */
  const plans = families.map(ch => WEEK_PLAN.filter(s => s.channel === ch && !existing.has(`${monday}-${ch}-${DAY_KEYS[s.day]}`)));
  const written = await Promise.all(families.map((ch, k) => plans[k].length
    ? draftChannel(ch, plans[k].map(s => s.format), hooks,
        ch === 'li_group' ? 'One of these is the week\'s face-to-camera video (the one marked video). The rest are carousels.' : '', seasonFor(monday))
    : Promise.resolve([])));
  for (const [k, ch] of families.entries()) {
    const plan = plans[k];
    if (!plan.length) continue;
    const drafts = written[k];
    for (let i = 0; i < plan.length; i++) {
      const s = plan[i], d = drafts[i];
      const slot = `${monday}-${ch}-${DAY_KEYS[s.day]}`;
      const at = slotTime(monday, s.day, s.hour, s.minute).toISOString();
      const { data: row, error } = await sb().from('content_posts').insert({
        slot, week_start: monday, channel: ch, format: d.format, publish_at: at, status: statusFor(ch, d.format),
        topic: d.topic, hook: d.hook, caption: d.caption, caption_fb: d.caption_fb ?? null,
        card: d.card ?? null, slides: d.slides ?? [], script: d.script ?? null, image_idea: d.image_idea ?? null
      }).select('id').single();
      if (error) { if (/duplicate/i.test(error.message)) continue; throw new Error(error.message); }
      made.push(slot);
      hooks.unshift(d.hook);

      /* The copies: Instagram/Facebook posts go to the matching LinkedIn page,
         and the group video also goes to Instagram as a Reel and to the page. */
      const page = pageFor(ch);
      const copies: { channel: Channel; format: Format; caption: string; caption_fb?: string | null; status: string; offset: number }[] = [];
      if (page) copies.push({ channel: page, format: d.format, caption: d.caption_li || d.caption, status: statusFor(page, d.format), offset: 0 });
      if (ch === 'li_group' && d.format === 'video') {
        copies.push({ channel: 'ig_client', format: 'video', caption: d.caption, status: 'needs_video', offset: 7.5 * 3600000 });
        copies.push({ channel: 'li_page_client', format: 'video', caption: d.caption, status: 'needs_video', offset: 7.5 * 3600000 });
      }
      for (const c of copies) {
        await sb().from('content_posts').insert({
          slot: `${slot}-${c.channel}${c.format === 'video' ? '-video' : ''}`, week_start: monday, channel: c.channel, format: c.format,
          publish_at: new Date(new Date(at).getTime() + c.offset).toISOString(), status: c.status,
          topic: d.topic, hook: d.hook, caption: c.caption, caption_fb: c.channel.startsWith('ig_') ? (d.caption_fb ?? null) : null,
          card: d.card ?? null, slides: d.slides ?? [], script: d.script ?? null, parent_id: row.id
        });
      }
    }
  }
  return made;
}

/* Rewrite one post in place (same channel, format and slot). */
export async function redraftPost(post: ContentPost) {
  const family = (post.channel === 'li_page_client' ? 'ig_client' : post.channel === 'li_page_careers' ? 'ig_careers' : post.channel) as 'li_personal' | 'li_group' | 'ig_client' | 'ig_careers';
  const [d] = await draftChannel(family, [post.format], [post.hook ?? '', ...(await recentHooks())].filter(Boolean),
    post.format === 'video' ? 'This one is the face-to-camera video.' : '');
  const caption = post.channel.startsWith('li_page') ? (d.caption_li || d.caption) : d.caption;
  await updatePost(post.id, {
    topic: d.topic, hook: d.hook, caption, caption_fb: post.channel.startsWith('ig_') ? (d.caption_fb ?? null) : null,
    card: d.card ?? null, slides: d.slides ?? [], script: d.script ?? null, image_idea: d.image_idea ?? post.image_idea,
    written_by: 'claude'
  } as any);
}

/* ---------- publishing ---------- */

async function imagesFor(post: ContentPost): Promise<string[]> {
  const n = imageCount(post);
  return Array.from({ length: n }, (_, i) => imageUrl(post.id, i, 'jpg'));
}

async function fetchBytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load the image (${r.status}).`);
  return { bytes: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/jpeg' };
}

/* Publishes one post to every place it belongs. Each place is recorded as it
   succeeds, so a retry never posts twice to the same place. */
export async function publishOne(post: ContentPost): Promise<'posted' | 'pending'> {
  const results = { ...(post.results ?? {}) };
  const save = async () => updatePost(post.id, { results } as any);

  if (post.channel === 'ig_client' || post.channel === 'ig_careers') {
    const meta = await getSetting<MetaConn>('conn:meta');
    const pageId = post.channel === 'ig_client' ? meta?.client : meta?.careers;
    const page = meta?.pages.find(p => p.id === pageId);
    if (!page) throw new Error('Connect Instagram and Facebook in the Content tab, and choose which page this account is.');
    const igCaption = post.caption, fbCaption = post.caption_fb || post.caption;
    if (post.format === 'video') {
      if (!post.video_path) throw new Error('The video has not been uploaded yet.');
      const url = mediaUrl(post.video_path);
      if (page.ig && !results.instagram) {
        if (!results.ig_container) { results.ig_container = await igStartReel(page.ig.id, page.token, url, igCaption); await save(); }
        const id = await igFinishReel(page.ig.id, page.token, results.ig_container);
        if (!id) return 'pending';
        results.instagram = { id, at: new Date().toISOString() }; await save();
      }
      if (!results.facebook) { results.facebook = { id: await fbPublishVideo(page.id, page.token, url, fbCaption), at: new Date().toISOString() }; await save(); }
      return 'posted';
    }
    const imgs = await imagesFor(post);
    if (!imgs.length) throw new Error('This post has no graphic.');
    if (page.ig && !results.instagram) { results.instagram = { id: await igPublishImages(page.ig.id, page.token, imgs, igCaption), at: new Date().toISOString() }; await save(); }
    if (!results.facebook) { results.facebook = { id: await fbPublishImages(page.id, page.token, imgs, fbCaption), at: new Date().toISOString() }; await save(); }
    return 'posted';
  }

  if (post.channel === 'li_personal' || post.channel === 'li_page_client' || post.channel === 'li_page_careers') {
    const li = await getSetting<LinkedInConn>('conn:linkedin');
    if (!li || new Date(li.expires_at).getTime() < Date.now()) throw new Error('Connect LinkedIn in the Content tab (it needs reconnecting every 60 days).');
    let author = li.person_urn;
    if (post.channel !== 'li_personal') {
      const org = orgFor(post.channel === 'li_page_client' ? 'client' : 'careers');
      if (!pageAccess() || !org || !li.scopes.includes('w_organization_social')) throw new Error('LinkedIn page posting is not approved yet. Schedule this one in LinkedIn.');
      author = `urn:li:organization:${org}`;
    }
    const images = post.channel === 'li_personal'
      ? (post.image_path ? [await fetchBytes(mediaUrl(post.image_path))] : [])
      : await Promise.all((await imagesFor(post)).map(fetchBytes));
    if (post.channel === 'li_personal' && !images.length) throw new Error('Add your picture first.');
    if (!results.linkedin) { results.linkedin = { id: await linkedinPost(li, author, post.caption, images), at: new Date().toISOString() }; await save(); }
    return 'posted';
  }
  throw new Error('This one is posted by hand.');
}

const STALE_MS = 36 * 3600000;

/* Everything due, not held, posted now. Claimed first, so two runs never
   post the same thing. A post more than 36 hours late is not posted at all:
   stale content is worse than none. */
export async function publishDue(now = new Date(), deadline = Date.now() + 10 * 60000) {
  const out: { slot: string; result: string }[] = [];
  const { data } = await sb().from('content_posts').select('*')
    .in('status', ['scheduled', 'publishing']).lte('publish_at', now.toISOString()).order('publish_at').limit(30);
  for (const post of (data ?? []) as ContentPost[]) {
    if (Date.now() > deadline) break;
    if (post.status === 'publishing' && !post.results?.ig_container) {
      /* Left mid-way by a run that stopped: only carry on if it has been a while. */
      if (Date.now() - new Date(post.updated_at).getTime() < 15 * 60000) continue;
    }
    if (post.status === 'scheduled') {
      if (now.getTime() - new Date(post.publish_at).getTime() > STALE_MS) {
        await updatePost(post.id, { status: 'failed', error: 'It missed its time by more than a day and a half, so it was not posted.' } as any);
        out.push({ slot: post.slot, result: 'missed' }); continue;
      }
      const { data: claimed } = await sb().from('content_posts').update({ status: 'publishing', updated_at: new Date().toISOString() })
        .eq('id', post.id).eq('status', 'scheduled').select('id');
      if (!claimed?.length) continue;
    }
    try {
      const r = await publishOne(post);
      if (r === 'posted') await updatePost(post.id, { status: 'posted', posted_at: new Date().toISOString(), error: null } as any);
      else await updatePost(post.id, { status: 'publishing' } as any);
      out.push({ slot: post.slot, result: r });
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 400);
      /* No connection yet: hand it to the team instead of failing it. */
      const manual = /Connect |not approved yet|posted by hand/.test(msg);
      await updatePost(post.id, { status: manual ? 'manual' : 'failed', error: msg } as any);
      out.push({ slot: post.slot, result: manual ? 'manual' : 'failed' });
    }
  }
  return out;
}

/* ---------- the team's emails ---------- */

const pre = (s: string) => `<div style="white-space:pre-wrap;border-left:2px solid #DDE5DC;padding:2px 0 2px 14px;margin:0 0 14px;color:#35443A;">${esc(s)}</div>`;

async function toTeam(subject: string, headline: string, inner: string, text: string) {
  const team = await teamEmailsAdmin().catch(() => [] as string[]);
  for (const to of team) {
    await send(to, { kind: 'contentDigest', subject, text, html: shell(headline, inner, { label: 'Open the Content tab', href: `${APP()}/console/content` }) } as any);
  }
}

export async function previewWeek(monday: string) {
  const posts = await listWeek(monday);
  if (!posts.length) return;
  const count = (f: (p: ContentPost) => boolean) => posts.filter(f).length;
  const needImg = count(p => p.status === 'needs_image');
  const needVid = count(p => p.status === 'needs_video' && !p.parent_id);
  const manual = count(p => p.status === 'manual');
  const auto = count(p => p.status === 'scheduled');
  const firstDay = dayLabel(posts[0].publish_at);
  const lines = posts.filter(p => !p.parent_id).map(p => `<li style="margin:0 0 6px;"><b>${esc(whenLabel(p.publish_at))}</b> · ${esc(CHANNELS[p.channel].label)} · ${esc(p.hook || p.topic || '')}</li>`).join('');
  await toTeam(
    `Next week's content is ready: ${posts.length} posts`,
    'Next week is written.',
    p(`Claude has drafted the week starting ${esc(firstDay)}: ${posts.length} posts across every account.`) +
    p(`<b>${auto}</b> post on schedule unless you hold them. <b>${needImg}</b> of Sage's LinkedIn posts are waiting for her picture. <b>${manual}</b> are posted by hand (the groups, and the LinkedIn pages until page access is approved); those arrive in the 7:00 AM email on their day.${needVid ? ` One video script is ready to record.` : ''}`) +
    `<ul style="padding-left:18px;margin:0 0 15px;">${lines}</ul>`,
    `Next week's content is drafted: ${posts.length} posts. ${auto} post on schedule unless held, ${needImg} need Sage's picture, ${manual} are posted by hand. ${APP()}/console/content`
  );
}

/* 7:00 AM Pacific, Monday to Saturday: what needs a person today. */
export async function dailyDigest(now = new Date()) {
  const p0 = pacificParts(now);
  const today = `${p0.y}-${String(p0.m).padStart(2, '0')}-${String(p0.d).padStart(2, '0')}`;
  const key = `digest:${today}`;
  if (await getSetting(key)) return false;
  const from = new Date(now.getTime() - 2 * 3600000).toISOString();
  const to = new Date(now.getTime() + 22 * 3600000).toISOString();
  const soon = new Date(now.getTime() + 48 * 3600000).toISOString();
  const { data: todays } = await sb().from('content_posts').select('*').gte('publish_at', from).lte('publish_at', to).order('publish_at');
  const { data: waiting } = await sb().from('content_posts').select('*').in('status', ['needs_image', 'needs_video', 'failed']).lte('publish_at', soon).order('publish_at');
  const groups = (await getGroups()).filter(g => g.name || g.url);
  const li = await getSetting<LinkedInConn>('conn:linkedin');
  const liDays = li ? Math.floor((new Date(li.expires_at).getTime() - now.getTime()) / 86400000) : null;

  const manual = ((todays ?? []) as ContentPost[]).filter(x => x.status === 'manual');
  const blocks: string[] = [];
  for (const m of manual) {
    const files = m.format === 'carousel'
      ? `<a href="${pdfUrl(m.id)}" style="color:#35443A;">Download the carousel (PDF for LinkedIn)</a>`
      : m.format === 'card' ? `<a href="${imageUrl(m.id, 0)}" style="color:#35443A;">Download the graphic</a>`
      : m.video_path ? `<a href="${mediaUrl(m.video_path)}" style="color:#35443A;">Download your video</a>` : 'Record the video from the script in the Content tab.';
    const where = m.channel === 'li_group'
      ? (groups.length ? groups.map(g => g.url ? `<a href="${esc(g.url)}" style="color:#35443A;">${esc(g.name || g.url)}</a>` : esc(g.name)).join(' · ') : 'Add your four groups in the Content tab.')
      : `${esc(CHANNELS[m.channel].label)}: post it, or schedule it in LinkedIn.`;
    blocks.push(`<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:18px;color:#35443A;margin:22px 0 8px;">${esc(CHANNELS[m.channel].label)} · ${esc(whenLabel(m.publish_at))}</h2>` +
      p(where) + p(files) + pre(m.caption));
  }
  const notes: string[] = [];
  for (const w of (waiting ?? []) as ContentPost[]) {
    if (w.status === 'needs_image') notes.push(`Sage's LinkedIn post for ${esc(whenLabel(w.publish_at))} is waiting for her picture.`);
    else if (w.status === 'needs_video' && !w.parent_id) notes.push(`The video for ${esc(whenLabel(w.publish_at))} is ready to record. Upload it in the Content tab and it goes to Instagram and the LinkedIn page too.`);
    else if (w.status === 'failed') notes.push(`${esc(CHANNELS[w.channel].label)}, ${esc(whenLabel(w.publish_at))}: ${esc(w.error || 'did not post')}.`);
  }
  if (liDays !== null && liDays <= 7) notes.push(`LinkedIn needs reconnecting ${liDays <= 0 ? 'now' : `within ${liDays} day${liDays === 1 ? '' : 's'}`}: one click in the Content tab.`);

  await putSetting(key, { at: now.toISOString(), manual: manual.length, notes: notes.length });
  if (!manual.length && !notes.length) return false;
  await toTeam(
    manual.length ? `Today's posts to share: ${manual.length}` : 'Content: a few things need you',
    manual.length ? 'Today, ready to post.' : 'A few things need you.',
    (notes.length ? `<ul style="padding-left:18px;margin:0 0 15px;">${notes.map(n => `<li style="margin:0 0 6px;">${n}</li>`).join('')}</ul>` : '') + blocks.join(''),
    [...notes.map(n => n.replace(/<[^>]+>/g, '')), ...manual.map(m => `${CHANNELS[m.channel].label} ${whenLabel(m.publish_at)}\n${m.caption}`)].join('\n\n')
  );
  return true;
}

/* ---------- the hourly tick ---------- */

export async function tick(now = new Date()) {
  const out: Record<string, unknown> = {};
  try { out.published = await publishDue(now); } catch (e: any) { out.publishError = e?.message ?? String(e); }

  const pt = pacificParts(now);
  if (pt.wd >= 1 && pt.wd <= 6 && pt.h >= 7) {
    try { out.digest = await dailyDigest(now); } catch (e: any) { out.digestError = e?.message ?? String(e); }
  }

  /* Thursday from 9:00 AM Pacific (or any later day of the week if Thursday
     was missed): draft next week once. */
  const late = (pt.wd === 4 && pt.h >= 9) || pt.wd === 5 || pt.wd === 6 || pt.wd === 0;
  if (late) {
    const next = weekStart(now, 1);
    const lock = await getSetting<{ status: string; at: string }>(`draft:${next}`);
    const stuck = lock?.status === 'drafting' && Date.now() - new Date(lock.at).getTime() > 30 * 60000;
    const retry = lock?.status === 'failed' && Date.now() - new Date(lock.at).getTime() > 3 * 3600000;
    if (!lock || stuck || retry) {
      await putSetting(`draft:${next}`, { status: 'drafting', at: now.toISOString() });
      try {
        out.drafted = await draftWeek(next);
        await putSetting(`draft:${next}`, { status: 'done', at: new Date().toISOString() });
        await previewWeek(next);
      } catch (e: any) {
        out.draftError = e?.message ?? String(e);
        await putSetting(`draft:${next}`, { status: 'failed', at: new Date().toISOString(), error: out.draftError });
      }
    }
  }
  /* The VA (on US hours) gets the coming week on Sunday from 8:00 AM
     Pacific, so any edits made after Thursday's draft are in what she
     receives. Once per week. */
  if (pt.wd === 0 && pt.h >= 8) {
    try { out.va = await exportForVA(weekStart(now, 1)); } catch (e: any) { out.vaError = e?.message ?? String(e); }
  }
  return out;
}

/* Hand a job to the background worker. Answers at once (202). Returns false
   when there is no worker to call (local dev, or CRON_SECRET missing). */
/* ---------- the VA's Doc and Drive folder (31 October 2026) ----------
   Sage's VA posts what no tool can: the four LinkedIn groups, and the Relève
   LinkedIn page until LinkedIn grants page access. Once a week is written,
   its captions go into the VA's Google Doc and its files (carousel PDFs,
   graphics) into a "Week of ..." folder in the VA's Google Drive. */

export const VA_DEFAULT = {
  doc: '1jLmnBqWyFTVg1WboxdOBUHkBg1bJLyFWaOYNP76ITf8', tab: 't.o4lut0ptt95r',
  folder: '1EYqjU7ECpEcm2KvtqeZswxXkAgr_EBvl'
};
type VaPlace = typeof VA_DEFAULT;
export const vaPlace = async (): Promise<VaPlace> => ({ ...VA_DEFAULT, ...((await getSetting<Partial<VaPlace>>('va')) ?? {}) });

const forVA = (p: ContentPost) => p.status !== 'skipped' && p.status !== 'posted' && (
  p.channel === 'li_group' || ((p.channel === 'li_page_client' || p.channel === 'li_page_careers') && !pageAccess()));

export async function exportForVA(monday: string, force = false) {
  const key = `va:${monday}`;
  const prev = await getSetting<{ status: string; at: string }>(key);
  if (prev?.status === 'done' && !force) return { skipped: true };
  if (!vaConfigured()) throw new Error('The Google service account is not set up.');
  const posts = (await listWeek(monday)).filter(forVA).sort((a, b) => a.publish_at.localeCompare(b.publish_at));
  if (!posts.length) { await putSetting(key, { status: 'done', at: new Date().toISOString(), files: 0 }); return { files: 0 }; }
  await putSetting(key, { status: 'sending', at: new Date().toISOString() });
  try {
    const place = await vaPlace();
    const weekName = `Week of ${new Date(`${monday}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
    const folder = await folderIn(place.folder, weekName);
    const groups = (await getGroups()).filter(g => g.name || g.url);
    const short = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: '2-digit', weekday: 'short' });

    const parts: string[] = [`\n\n${weekName.toUpperCase()}\nFiles: Google Drive folder "${weekName}"\n`];
    if (groups.length) parts.push(`The four groups:\n${groups.map((g, i) => `${i + 1}. ${g.name || 'Group'}${g.url ? ` ${g.url}` : ''}`).join('\n')}\n`);
    let files = 0;
    for (const p of posts) {
      const where = p.channel === 'li_group' ? 'LinkedIn groups (post in all four)' : CHANNELS[p.channel].label;
      const base = `${short(p.publish_at)} - ${p.channel === 'li_group' ? 'Groups' : 'LinkedIn page'} - ${p.format}`.replace(/[,/]/g, '');
      let file = '';
      if (p.format === 'carousel' && imageCount(p)) {
        const { bytes } = await fetchBytes(pdfUrl(p.id));
        await upload(folder, `${base}.pdf`, 'application/pdf', bytes); file = `${base}.pdf`; files++;
      } else if (p.format === 'card' && imageCount(p)) {
        const { bytes } = await fetchBytes(imageUrl(p.id, 0, 'jpg'));
        await upload(folder, `${base}.jpg`, 'image/jpeg', bytes); file = `${base}.jpg`; files++;
      } else if (p.format === 'video' && p.video_path) {
        const { bytes, type } = await fetchBytes(mediaUrl(p.video_path));
        const ext = /quicktime/.test(type) ? 'mov' : 'mp4';
        await upload(folder, `${base}.${ext}`, type, bytes); file = `${base}.${ext}`; files++;
      }
      const lines = [`\n${whenLabel(p.publish_at).toUpperCase()} · ${where}`];
      lines.push(file ? `File: ${file}` : p.format === 'video' ? 'Video: Sage records it from the script below; it goes in this folder when it is uploaded.' : 'Text only.');
      if (p.format === 'carousel' && p.channel === 'li_group') lines.push('Post the PDF as a document (carousel) and give it the title of the first slide.');
      lines.push('', 'Caption:', p.caption.trim());
      if (p.script) {
        const sc = p.script;
        lines.push('', 'Video script:', `Hook: ${sc.hook}`, ...sc.beats.map((b, i) => `${i + 1}. ${b}`), `Close: ${sc.close}`);
        if (sc.onscreen?.length) lines.push(`On screen: ${sc.onscreen.join(' / ')}`);
      }
      lines.push('', '────────');
      parts.push(lines.join('\n'));
    }
    /* Comment-to-get posts on any account: the VA answers each comment. */
    const all = await listWeek(monday);
    const asks = all.filter(p => p.status !== 'skipped' && (p.card?.layout === 'comment' || (p.slides ?? []).some((x: any) => x?.layout === 'comment')));
    if (asks.length) {
      parts.push(['', 'COMMENT REPLIES THIS WEEK', 'When someone comments the keyword, reply to the comment ("Sent, check your messages") and send them a direct message within a few hours:',
        '"Here is Handled Business, our free training on what to hand off, how, and in what order: relevestaffing.com/training. When you want help applying it, Sage does a free delegation audit: relevestaffing.com/discovery"', '',
        ...asks.map(p => `- ${whenLabel(p.publish_at)} · ${CHANNELS[p.channel].label} · keyword ${(p.card?.keyword || (p.slides ?? []).find((x: any) => x?.keyword)?.keyword || 'HANDLED')}`), '', '────────'].join('\n'));
    }
    await appendToDoc(place.doc, place.tab, parts.join('\n') + '\n');
    await putSetting(key, { status: 'done', at: new Date().toISOString(), files, posts: posts.length });
    return { files, posts: posts.length };
  } catch (e: any) {
    await putSetting(key, { status: 'failed', at: new Date().toISOString(), error: String(e?.message ?? e).slice(0, 300) });
    throw e;
  }
}

export async function kick(job: string, extra: Record<string, unknown> = {}) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const base = (process.env.URL ?? APP()).replace(/\/+$/, '');
  const r = await fetch(`${base}/.netlify/functions/content-worker-background`, {
    method: 'POST', headers: { 'x-cron-key': secret, 'content-type': 'application/json' }, body: JSON.stringify({ job, ...extra })
  }).catch(() => null);
  return Boolean(r && r.status < 300);
}

export { weekStart, whenLabel, DAY_NAMES };
