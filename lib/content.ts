import { createHmac } from 'crypto';
import { hasServiceKey, adminClient, teamEmailsAdmin } from './supabase/admin';
import { send, shell, p, esc } from './email';
import {
  WEEK_PLAN, DAY_KEYS, DAY_NAMES, slotTime, weekStart, whenLabel, dayLabel, pacificParts, pageFor, CHANNELS, COPY_PLAN, COPY_CHANNELS,
  type Channel, type ContentPost, type Format, type Slide, type Card, type Script
} from './content-model';
import { DEFAULT_RULES, hardChecks, modelReview } from './content-rules';
import { DEFAULT_DESIGN, designChecks } from './design-standard';
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
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('No signing secret is configured for content links.');
  return createHmac('sha256', secret).update(`${id}:${n}`).digest('hex').slice(0, 24);
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

const FACTS = `About Relève: a premium virtual executive staffing agency. It places a vetted, fully supported virtual professional (executive assistants and other remote staff: offshore on Starter and Essential, and hired locally in the US or Europe on Specialist) with founders and business owners, and stays with them for the life of the relationship through a Client Success Manager and a Talent Success Manager. Every candidate is vetted on six fronts: the business is studied first and the role built around it; tested for the role; matched to how the owner works through the Relève Signature working-style and personality assessment; identity verified; "we interview many, you meet one"; and a named approval before anyone is presented. Prepared for the role before day one. First candidate within 14 days. Up to two replacements. Relève professionals already use AI in their daily work and can help owners map and build automations. The founder is Sage Jackson.

Positioning: trust and relief, the feeling of "Consider it handled." The real fears are "can I trust someone with this?" and "will they add work instead of removing it?" Hires rarely fail on skill; they fail on fit: the right resume, the wrong working style. Owners get their time back for the work that grows the business. Never lead with cost, cheapness, offshore savings or "fix your inbox"; 14 days and 30% are supporting facts only.

Hard rules for every word: no em dashes or en dashes (use commas, periods or colons). No prices or plan names. No invented clients, testimonials, quotes, names or statistics; composite situations are framed as typical, never as a real client. Always make clear the staff are virtual. Say "prepared" rather than "trained", "supported" rather than "managed" when describing talent. American English. No emojis except at most one in an Instagram caption. Never name anyone other than Sage. Never threaten or shame the reader; point toward the better outcome. Every post must be different from the others in the week and from the recent hooks listed.`;

const SAGE = `You are writing as Sage Jackson, founder of Relève, on her personal LinkedIn. Her story: seven years as an executive personal assistant and house manager to CEOs and ultra-high-net-worth entrepreneurs, anticipating needs before they were spoken; then carrying that instinct into scaling businesses: she has helped scale four businesses past seven figures, built out their operations, and hand built the CRM and recruiting system for a $50M company; she helps run a multi-seven-figure mastermind of 49+ business owners; she saw the same failure again and again (the resume matched, the working style did not) and built Relève to fix it. She runs every discovery call herself and gives a free live VA business audit on the call. Voice: first person, calm, sharp, specific, a little contrarian, generous with real lessons. Short lines and white space, the way strong LinkedIn posts read. A scroll-stopping first line. No hashtags except up to three at the very end. No links in the text. End with a question that invites comments, or a quiet invitation to message her. 

HOW SAGE ACTUALLY WRITES. These are her real posts. Match this cadence and nothing else:

SAMPLE 1 (her most-read post, 9,400 impressions): "I didn't blindly start recruiting talent from the Philippines. I lived there.\n\nI wanted to understand the culture I was building a business around before I ever asked a client to trust it. The biggest misconception about offshore talent isn't about skill, it's about assumption. People assume remote means distant, less invested, less capable.\n\nWhat I found was the opposite. Sharp, driven, detail-oriented professionals who take the work seriously because the opportunity means something. The stereotype doesn't survive contact with reality."

SAMPLE 2: "Most assistants don't get fired for lacking skills.\n\nThey get fired because of how they work.\n\nThe resume said 'executive assistant, 5 years.' Nobody checked how they handle ambiguity. Whether they need direction or run on their own. Whether they match the pace of the person they support.\n\nThree weeks later, you're retraining someone, or starting over.\n\nThat is the real cost of a bad hire. Not the salary. The time you never get back."

SAMPLE 3: "There is a specific feeling after you hire help.\n\nYou hand something over, and you don't quite let go.\n\nYou check it. You re-read it. You tell yourself it's fine. Underneath, a quiet question: is this person actually going to take this off my plate, or have I just added a new thing to manage?"

SAMPLE 4: "Before I founded Relève, I spent seven years as an executive assistant. I sat behind the chair. I managed calendars that changed by the hour, inboxes that never emptied, and the hundred small decisions that never make it into anyone's job description.\n\nI watched brilliant, driven people carry the weight of things that had nothing to do with why they started their business in the first place."

SAMPLE 5: "What do you want your time back for?\n\nThat is the real reason founders hire. Not to delegate tasks, but to be present for the work, and the life, that only they can do."

WHAT MAKES THEM HERS:
- One idea per line. Short, plain, declarative sentences. White space between every thought.
- The first line is a belief, a lived fact, or a plain observation. Never a scene description.
- Concrete nouns from her real work (calendars that changed by the hour, inboxes that never emptied, the chair, the resume, the retraining). Specific beats clever.
- A belief gets reframed in a sentence: "isn't about skill, it's about assumption". Never explained afterwards.
- Calm and warm. Never hype, never a lecture, never a framework with a name.
- No pitch in the body. Relève appears late and lightly, or not at all.
- It ends quietly: a short invitation to message her (comment-to-DM with a keyword, Zoom coffee delegation audit) or "Consider it handled." No link in the post.

THE PHOTO: every personal post goes with ONE real, candid photo from her life. The photo is only the mood. NEVER describe it. Do not list what is in the picture (no drinks, windows, palm trees, laptops, tables, scenery). Her boat post never mentions the boat; her umbrella post never mentions the umbrella. At most one short, plain phrase about where she is, only if it is the point of the post. The text stands completely on its own and would make sense with any photo.

BANNED, because it reads as AI: describing or inventorying the image; explaining why the post works ("it works because it answers three things"); "here's what I learned"; "let that sink in"; rhetorical openers; "it's not X, it's Y" stacked more than once; lists of three used as a template; quoting a sentence she typed as a lesson; hashtags beyond three at the very end; em dashes; invented details. If a real number, event, or story is needed and not given, write [Sage: add real detail] instead of inventing it. Never claim she did something (hours alone, a trip, a tool) that the photo or her facts do not establish.
It has to read like a real person who is calm, experienced and a little tired of how complicated everyone makes this.
`;

const PILLARS = `WHO READS THIS AND WHAT THEY SAID (audience research, November 2026; use it to choose angles and language, never quote it as statistics in a post):
- Owners of 1 to 10 person businesses lose about 30% of their week to work that is not theirs (admin, customer replies, scheduling, bookkeeping, social); most already know what they would hand off first, and say what they lack is a person they can trust with it.
- The pattern they describe, in their words: "the first time I tried to offload admin I spent more time double checking it than if I just did it myself"; "every few hours I'd get another message: can you check this?"; "how do I keep the standard without delegation becoming another full-time job"; "I just want someone reliable who shows up"; "most people miss the 10 to 20 hours they spent just getting to the hire"; "every bad VA hire I've seen, the owner handed over a role, not a system"; "the agency charged $1,500 and paid the VA $550"; "I replaced my assistant's tasks with an AI agent and it screws up 20% of the time".
- Their objections to a remote assistant, in order: burned once before; agency markup; the time to find and vet; keeping quality without micromanaging; data and supplier security; language and judgment; "AI will do it".
- What moves them to a vendor: proof you understand their specific week (85%), a perspective that challenges an assumption they hold (86%), a risk or opportunity they had not seen (91%).
- The moment: AI is in most of their businesses and trusted in none of them unsupervised; costs are up; half want to grow without adding payroll; founder voices beat brand voices on every platform; saves and 60-second reads beat likes; external links in a LinkedIn post cost most of its reach.

THE ANGLES THAT COME OUT OF THAT (rotate; never two of the same kind in a row; each gives one usable thing): the handoff playbook for one area (inbox, calendar, lead follow-up, client onboarding, invoicing, social, CRM, travel, life admin) with the exact steps and the rules doc; the script for the first week with an assistant; the arithmetic of doing it yourself (hours, hourly value, the year); the hidden hours of hiring your own VA; hand over a system, not a role; why double-checking never ends and the handoff that ends it; what an assistant who runs your AI tools does with the 20% AI gets wrong; grow without adding payroll; access and security in plain English (levels, password manager, NDA, what an assistant never touches); the resume matched, the working style did not; burned by a VA once: what actually went wrong; the lead that waited two days; the self-score (are you ready for an executive assistant); red flags and green flags when hiring one; the assumption to drop ("stop hiring VAs; hire someone matched to how you work"); the talent's side (real people, real careers, with consent, never pity).

Keep every example universal: the inbox, the calendar, the lead, the invoice, the proposal, the client follow-up, the Sunday planning hour. Name only cross-industry tools (Gmail, Google Calendar, Calendly, Slack, Notion, Asana, Loom, QuickBooks, Zoom, ChatGPT and other AI tools). Never build a post around one industry, one platform or one vertical's calendar moment.

The purpose of every post on Instagram, Facebook and LinkedIn: get attention with something true and useful, then move owners into Relève's system so they become clients. Exactly one next step per post, and across the week: about 4 in 10 the free training, Handled Business, at relevestaffing.com/training; about 3 in 10 book a discovery call at relevestaffing.com/discovery, where Sage gives a free live audit of what to delegate; about 2 in 10 "comment HANDLED" to be sent the free training; about 1 in 10 explore relevestaffing.com. On Instagram the link lives in the bio, so write "link in bio" plus the page name; on Facebook and LinkedIn write the full address. Always Relève branded, always worth stopping for, never a hard sell.`;

const DESIGN = `You also design each graphic. The house look is a clean, modern "ledger": Lora headlines, figures and text in a modern sans, fine rules, the real working artifact on the page. You choose a layout for every single graphic and every carousel slide, and you fill its fields. Layouts:
- "statement": a headline that lands on its own, plus a short line under it. Use sparingly, at most once a week per account.
- "number": one big figure the reader can check ("number":"$2,500"), the headline is its label, "facts":[{"value":"10 h","label":"admin a week"},...] up to 3 showing the arithmetic.
- "rules": a headline plus "rows":[3 to 5 short lines] that the reader can copy as is (rules, a checklist, the steps, the settings).
- "compare": a headline plus "left":{"label":"Before","items":[3 to 4]} and "right":{"label":"After","items":[3 to 4]} (before and after, myth and reality, doing it yourself and handing it off).
- (The "chart" and "message" layouts are retired, 3 November 2026: fake charts and chat-bubble mock-ups read as templates. Put a script in a "rules" layout as the exact lines to send, and arithmetic in a "number" layout.)
- "notes": looks like an iPhone Notes page. The headline is the note's title in Sage's voice ("What I would hand off first at $40k a month"), "rows":[4 to 7 short lines], optional "note" for the date line.
- "search": looks like a search box. The headline is the owner's real question typed in, in lower case ("how to stop answering every email myself"), "rows":[2 or 3 related searches]; the body answers it in one line. Great as a carousel cover.
- "flags": hiring and working with an assistant, "left":{"label":"Red flags","items":[3 or 4]} and "right":{"label":"Green flags","items":[3 or 4]}. The green flags quietly describe how Relève works, without naming it.
- "quiz": a self-score. The headline asks the question ("Are you ready for an executive assistant?"), "rows":[5 to 7 honest yes/no situations], "note": what the score means and the next step ("3 or more: book the free delegation audit").
- "comment": the comment-to-get post. "keyword":"HANDLED", headline is the promise, body says "Comment HANDLED and we will send you Handled Business, the free training ..." Every caption for it repeats: comment HANDLED and we will send it.
- Carousels only: "cover" for slide 1 (a concrete promise as title, the subtitle as body, optional "chips":[2 to 4 one-word labels]), "step" for a teaching slide (title plus a body under 45 words), "cta" for the last slide.
Every slide in a carousel can use a different layout: mix step with rules, number, compare, notes and search so the reader sees the real thing. Across the week use at least five different layouts and never the same layout on two posts in a row. Each week, every client-facing account (Instagram + Facebook, the groups) includes at least: one "quiz" or "flags" post, one "notes" or "search" post, and one "comment" post (a card, or a carousel whose last slide is the comment layout) offering Handled Business, the free training at relevestaffing.com/training. Keep every figure honest arithmetic or clearly illustrative. Headlines under 70 characters, rows under 70, no em dashes.`;

const FORMAT_RULES: Record<string, string> = {
  ig_client: `For the Relève Instagram and Facebook page, talking to founders and business owners. The same post is copied to the Relève LinkedIn page and the LinkedIn groups, so the LinkedIn caption must stand on its own. Return JSON: {"posts":[{"topic":"...","hook":"first line","format":"card" or "carousel","caption_ig":"Instagram caption, 600 to 1200 characters, \\n for breaks, hashtags at the end","caption_fb":"Facebook caption, 400 to 900 characters, conversational","caption_li":"LinkedIn caption, 500 to 1100 characters","card":{"layout":"...","title":"...","body":"..."} for a card, or "slides":[{"layout":"...","title":"...","body":"..."}] for a carousel}]}. A carousel has 5 to 8 slides (never fewer than 3): slide 1 is a "cover", the middle slides each show one real thing, the last is a "cta". Use the layouts and their own fields exactly as named above; a card is one layout with its fields.`,
  li_personal: `Return JSON: {"posts":[{"topic":"...","hook":"first line","text":"the full post, 900 to 1500 characters, line breaks as \\n","image_idea":"one sentence naming ONE real, candid photo-moment from Sage's own life that would suit the post (a boat, a window seat, the car between meetings, a walk); the post itself must never describe it"}]}`,
  li_group: `These go to four LinkedIn groups of business owners as free training. Pure value, no sales pitch; the only invitation is a soft line at the end of the caption pointing to the free training at relevestaffing.com/training. Each teaches one concrete thing a founder can do this week, usually how to hand a specific area of the business to a virtual professional and what changes. Return JSON: {"posts":[{"topic":"...","hook":"...","format":"carousel","caption":"LinkedIn caption, 500 to 1100 characters, \\n for breaks","slides":[{"title":"...","body":"..."}]} ...]}. A carousel has 7 or 8 slides, each {"layout","title","body", plus the layout's own fields}: slide 1 is a "cover" (a specific, concrete promise as title, for example the outcome and the time it takes; a short subtitle as body), the middle slides each teach one step and show the real thing (mix step, rules, number, compare, chart and message), the last slide is a "cta" that sums up and invites them to the free training (body mentions relevestaffing.com/training).`,
  ig_careers: `For the Relève Careers Instagram and Facebook, talking to experienced remote professionals in the Philippines and Latin America who want a real career with a US executive. Tagline "Take the watch." but always say plainly what Relève Careers is: remote careers supporting US founders and executives, matched to how they work, prepared for the role before day one, supported by a Talent Success Manager. Respect and aspiration, never pity. Calls to action point to applying on relevestaffing.com (Careers). Return JSON: {"posts":[...]} each {"topic","hook","format":"card"|"carousel","caption_ig":"300 to 900 characters, up to 5 hashtags","caption_fb":"conversational, 200 to 600 characters","caption_li":"professional, 300 to 700 characters","card":{"layout","kicker","quote","sub", plus the layout's fields} or "slides":[{"layout","title","body", plus the layout's fields}] with 5 to 7 slides}.`
};

function clean(s: unknown, max: number) {
  return String(s ?? '').replace(/[–—]/g, ', ').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}

/* Read the JSON out of a model answer, forgiving the usual slips: code
   fences, raw line breaks inside strings, trailing commas, text around it. */
function parseLoose(text: string): any {
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no json');
  const raw = text.slice(a, b + 1);
  try { return JSON.parse(raw); } catch { /* repair below */ }
  let out = ''; let inStr = false; let esc = false;
  for (const ch of raw) {
    if (inStr) {
      if (esc) { out += ch; esc = false; }
      else if (ch === '\\') { out += ch; esc = true; }
      else if (ch === '"') { out += ch; inStr = false; }
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '';
      else if (ch === '\t') out += '\\t';
      else out += ch;
    } else { if (ch === '"') inStr = true; out += ch; }
  }
  out = out.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(out);
}

function extractPosts(j: any): any[] {
  if (Array.isArray(j)) return j.filter(x => x && typeof x === 'object');
  if (!j || typeof j !== 'object') return [];
  if (Array.isArray(j.posts)) return j.posts.filter((x: any) => x && typeof x === 'object');
  if (j.post && typeof j.post === 'object') return [j.post];
  if (j.hook || j.topic || j.card || j.slides || j.caption || j.caption_ig) return [j];
  const arr = Object.values(j).find(v => Array.isArray(v) && v.length && typeof v[0] === 'object') as any[] | undefined;
  return arr ?? [];
}

const FALLBACK_MODEL = 'claude-sonnet-5-5';

/* Ask Claude for JSON. It does not give up on the first hiccup: a busy
   service, a timeout or an unreadable answer is retried (twice on Opus, then
   once on Sonnet) before it counts as a failure (2 Nov 2026). */
let hardDeadline = 0;            /* set by draftWeek: the worker's own time limit */
let lastDraftError = '';         /* the last per-post failure, so the alert can name it */
async function askClaude(system: string, brief: string, maxTokens = 16000): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Add ANTHROPIC_API_KEY in Netlify so Claude can write the posts.');
  const primary = process.env.ANTHROPIC_CONTENT_MODEL || 'claude-opus-5-5';
  const models = [primary, primary, FALLBACK_MODEL];
  let last = 'The AI did not answer.';
  for (let i = 0; i < models.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, i * 4000));
    const left = hardDeadline ? hardDeadline - Date.now() : Infinity;
    if (left < 30000) throw new Error('Out of time before the worker is stopped; the next round continues.');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.min(270000, left - 5000));
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: models[i],
        max_tokens: maxTokens, system, messages: [{ role: 'user', content: brief }]
      }),
      signal: ctl.signal
    }).catch(() => null).finally(() => clearTimeout(timer));
    if (!res) { last = 'Could not reach the AI service.'; continue; }
    if (!res.ok) {
      let detail = ''; try { detail = (await res.json())?.error?.message ?? ''; } catch { /* */ }
      last = `The AI service refused the request (${res.status})${detail ? `: ${detail}` : ''}.`;
      if (res.status === 401 || res.status === 403) throw new Error(last);
      continue;
    }
    const data: any = await res.json().catch(() => null);
    const text = (data?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
    try { return parseLoose(text); }
    catch { last = data?.stop_reason === 'max_tokens' ? 'The AI ran out of room before finishing the posts.' : 'The AI sent back posts that could not be read.'; }
  }
  throw new Error(`${last} (tried three times)`);
}

/* Phone photos can be huge (the AI takes at most about 5 MB). Shrink a big
   JPEG to 1600 px on its longest side before it is sent. */
async function fitForVision(img: { bytes: Buffer; type: string }): Promise<{ bytes: Buffer; type: string }> {
  const okType = /jpe?g|png|webp/i.test(img.type);
  if (okType && img.bytes.length < 3500000) return img;
  if (/jpe?g/i.test(img.type) || !okType) {
    try {
      const mod: any = await import('jpeg-js'); const J = mod.default ?? mod;
      const d = J.decode(img.bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 600 });
      const k = Math.max(1, Math.ceil(Math.max(d.width, d.height) / 1600));
      const w = Math.floor(d.width / k), h = Math.floor(d.height / k);
      const out = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const si = ((y * k) * d.width + (x * k)) * 4, di = (y * w + x) * 4;
        out[di] = d.data[si]; out[di + 1] = d.data[si + 1]; out[di + 2] = d.data[si + 2]; out[di + 3] = 255;
      }
      return { bytes: Buffer.from(J.encode({ data: out, width: w, height: h }, 82).data), type: 'image/jpeg' };
    } catch { /* send it as it is */ }
  }
  return img;
}

async function askClaudeVision(system: string, brief: string, image: { bytes: Buffer; type: string }, maxTokens = 4000): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Add ANTHROPIC_API_KEY in Netlify so Claude can write the posts.');
  const img = await fitForVision(image);
  const media = /png/i.test(img.type) ? 'image/png' : /webp/i.test(img.type) ? 'image/webp' : 'image/jpeg';
  const primary = process.env.ANTHROPIC_CONTENT_MODEL || 'claude-opus-5-5';
  const models = [primary, primary, FALLBACK_MODEL];
  let last = 'The AI did not answer.';
  for (let i = 0; i < models.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, i * 3000));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 150000);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: models[i],
        max_tokens: maxTokens, system,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: img.bytes.toString('base64') } },
          { type: 'text', text: brief }
        ] }]
      }),
      signal: ctl.signal
    }).catch(() => null).finally(() => clearTimeout(timer));
    if (!res) { last = 'Could not reach the AI service.'; continue; }
    if (!res.ok) {
      let detail = ''; try { detail = (await res.json())?.error?.message ?? ''; } catch { /* */ }
      last = `The AI service refused the request (${res.status})${detail ? `: ${detail}` : ''}.`;
      if (res.status === 401 || res.status === 403) throw new Error(last);
      continue;
    }
    const data: any = await res.json().catch(() => null);
    const text = (data?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
    try { return parseLoose(text); }
    catch {
      /* A plain-prose answer is still a post: use it as the text. */
      const t = text.replace(/```[a-z]*/g, '').trim();
      if (t.length > 300) return { text: t };
      last = 'The AI sent back something unreadable.';
    }
  }
  throw new Error(`${last} (tried three times)`);
}

type Drafted = {
  topic: string; hook: string; format: Format; caption: string; caption_fb?: string; caption_li?: string;
  card?: Card | null; slides?: Slide[]; script?: Script | null; image_idea?: string;
};

const LAYOUTS = ['statement', 'number', 'rules', 'compare', 'chart', 'message', 'cover', 'step', 'cta', 'notes', 'search', 'flags', 'quiz', 'comment',
  /* The Relève Brief, LinkedIn's own look (7 Nov 2026) */
  'masthead', 'thesis', 'figure', 'table', 'framework', 'method', 'contrast', 'takeaway', 'close'];
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
  /* The Brief's own fields: a ruled table, a 2 by 2. */
  if (Array.isArray(x?.cols)) out.cols = arr(x.cols, 3).map((c: any) => clean(c, 24)).filter(Boolean);
  if (Array.isArray(x?.table)) out.table = arr(x.table, 6).map((r: any) => arr(r, 3).map((c: any) => clean(c, 34)));
  if (x?.x) out.x = clean(x.x, 34);
  if (x?.y) out.y = clean(x.y, 34);
  if (Array.isArray(x?.quads)) out.quads = arr(x.quads, 4).map((q: any) => ({ label: clean(q?.label, 28), text: clean(q?.text, 90) }));
  /* Retired looks (3 Nov 2026): a chat-bubble mock-up becomes the lines to
     send, set as rules; a fake chart becomes a statement. */
  if (out.layout === 'message') { out.layout = 'rules'; if (!out.rows?.length && out.messages?.length) out.rows = out.messages.map((m: any) => m.text).slice(0, 5); delete out.messages; }
  if (out.layout === 'chart') { out.layout = 'statement'; delete out.bars; }
  return out;
}

function normalize(channel: Channel, raw: any, wanted: Format): Drafted {
  const rawSlides = Array.isArray(raw?.slides) ? raw.slides : Array.isArray(raw?.graphic?.slides) ? raw.graphic.slides : Array.isArray(raw?.carousel?.slides) ? raw.carousel.slides : Array.isArray(raw?.graphic) ? raw.graphic : [];
  const slides = rawSlides.map((s: any) => ({ ...design(s), title: clean(s?.title ?? s?.headline ?? s?.heading ?? s?.quote, 140), body: clean(s?.body ?? s?.sub ?? s?.subtitle ?? s?.text ?? s?.note, 420) }))
    .filter((s: Slide) => s.title).slice(0, 10);
  const rc = raw?.card ?? (raw?.graphic && !Array.isArray(raw.graphic) ? raw.graphic : null) ?? raw?.image ?? null;
  const cq = rc?.quote ?? rc?.headline ?? rc?.title;
  const card = cq ? { ...design(rc), kicker: clean(rc.kicker, 40), quote: clean(cq, 200), sub: clean(rc.sub ?? rc.body ?? rc.subtitle, 200) || undefined } : null;
  const script = raw?.script?.hook ? {
    hook: clean(raw.script.hook, 300), close: clean(raw.script.close, 400),
    beats: (raw.script.beats ?? []).map((b: unknown) => clean(b, 500)).filter(Boolean).slice(0, 8),
    onscreen: (raw.script.onscreen ?? []).map((b: unknown) => clean(b, 120)).filter(Boolean).slice(0, 6)
  } : null;
  let format: Format = wanted;
  if (wanted === 'card' && !card && slides.length) format = 'carousel';
  if (wanted === 'carousel' && !slides.length && card) format = 'card';
  const caps = raw?.captions ?? {};
  const caption = clean(raw?.text ?? raw?.caption ?? raw?.caption_ig ?? caps.instagram ?? caps.ig ?? caps.linkedin, 3000);
  return {
    topic: clean(raw?.topic ?? raw?.point ?? raw?.direction ?? raw?.hook, 200), hook: clean(raw?.hook, 300), format, caption,
    caption_fb: (raw?.caption_fb ?? caps.facebook ?? caps.fb) ? clean(raw?.caption_fb ?? caps.facebook ?? caps.fb, 2000) : undefined,
    caption_li: (raw?.caption_li ?? caps.linkedin) ? clean(raw?.caption_li ?? caps.linkedin, 3000) : undefined,
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
/* A reference for LinkedIn (31 Oct 2026, Nona): Christian Di Bratto's public
   Hat Tip LinkedIn playbook (github.com/ChristianDiBratto25/hattip-linkedin-os,
   MIT). Added as one source among the rest, to widen the range, not replace it. */
const LI_REFERENCE = `One reference among several (use it to widen the range of posts, never to make them all alike): a LinkedIn ghostwriter's playbook (6,000+ founder posts).
Extra post types that are landing on LinkedIn now, to mix in with everything else:
- Strategic tag: a process or idea written for one named, real person or company, tagged naturally. Only tag real people and leave the tag as [Sage: tag] for her to fill in.
- Industry prediction: a non-obvious, plausible prediction about hiring, assistants, AI at work or small business, justified.
- Borrowed authority teardown: break down how a well-known founder or brand delegates or runs operations, then show what an owner can copy. Only use facts that are public and certain.
- Tech stack: the tools a great assistant runs a founder's week on, with each company tagged (cross-industry tools only, so any owner sees their own stack).
- Unique mechanism: a named process with the outcome promised in the first line. Only name processes Relève really uses.
- Tweet screenshot or news headline: react to a real post or headline the audience cares about, agreeing or disagreeing, with useful commentary. Leave [Sage: screenshot] for the image.
- Bad tactic callout: call out a bad hiring or delegation tactic going around, and why it fails.
- "If I were": walk through exactly what Sage would do, step by step, in a specific owner's shoes.
HOOK TEMPLATES (from a saved list of hooks that travel well on LinkedIn; use as openers for some posts, fill every bracket with a real Relève detail, vary them week to week, and never reuse the same one twice in a week):
1. "Underrated benefit of [topic/thing]: [hack]" (e.g. an underrated benefit of handing off your calendar first).
2. "[Topic] [skill] tip I use to [do desired/hard thing]" (a tip Sage really uses to get something hard done).
3. "[Timeframe] ago I made [income an hour] [doing job]" (only with true figures and a true job from Sage's own history; otherwise leave [Sage: add real figure]).
4. "If you read any [topic] posts today, read this one." (use sparingly, only for a post with a concrete, specific payoff).
Before writing each post, settle four things: the one point it makes, the best package for that point, only the information that supports it, and the order (hook, setup, development, support, ending). The hook names something specific and leaves useful information for later, without false suspense.
Across a week, aim for roughly 40% posts that reach the right audience, 40% that teach, 20% that prove and invite (only these carry an offer).
Writing habits from this playbook: plain words, complete connected sentences, mobile-friendly paragraphs, no bold, no em dashes. Avoid "It's not X, it's Y" reversals, stacked one-word fragments, repeated sentence openings, rhetorical questions (a question must expect a real answer), sentences that open with "Most", and the phrases "Here's the thing", "Here's why", "The secret?", "The best part?", "Let me explain". Never invent numbers, results, stories or quotes; if a real detail is needed, leave [Sage: add real example].`;

/* The house rules the team keeps in the Content tab. They start from the
   Content Standard in lib/content-rules.ts and can be edited without a deploy. */
export async function houseRules(): Promise<string> {
  const saved = (await getSetting<{ text: string }>('rules:house'))?.text?.trim();
  return saved || DEFAULT_RULES;
}

/* The Design Standard (3 November 2026), kept the same way. */
export async function houseDesign(): Promise<string> {
  const saved = (await getSetting<{ text: string }>('rules:design'))?.text?.trim();
  if (!saved) return DEFAULT_DESIGN;
  /* Nona's creative direction (7 Nov 2026) is permanent: a copy saved in the
     Content tab before it existed still gets it. */
  const r13 = DEFAULT_DESIGN.slice(DEFAULT_DESIGN.indexOf('13. CREATIVE DIRECTION'));
  return saved.includes('13. CREATIVE DIRECTION') ? saved : `${saved}\n\n${r13}`;
}

/* The editor's pass (3 November 2026). Every post is checked against the
   house rules before it is saved: first the mechanical checks, then a fast
   model read for the things a regex cannot see (one usable thing, universal,
   one next step, the voice). Returns the problems, empty when it passes. */
async function reviewPost(channel: Channel, d: Drafted, rules: string): Promise<string[]> {
  const graphic = [
    d.card ? [d.card.kicker, d.card.quote, d.card.sub, ...(d.card as any).rows ?? [], (d.card as any).note].filter(Boolean).join('\n') : '',
    ...(d.slides ?? []).map((x: any) => [x.title, x.body, ...(x.rows ?? []), x.note].filter(Boolean).join('\n'))
  ].filter(Boolean).join('\n');
  const text = channel === 'li_personal' ? d.caption : [d.caption, d.caption_fb, d.caption_li].filter(Boolean).join('\n\n');
  const hard = hardChecks({ hook: d.hook, text, graphic, channel });
  const problems = [...hard.problems, ...(channel === 'li_personal' ? [] : designChecks(d))];
  if (channel === 'li_personal' && (d.caption.length < 700)) return problems;
  problems.push(...await modelReview({ rules, label: `channel ${channel}, format ${d.format}`, text: `Hook: ${d.hook}\n\n${text}`, graphic: graphic || undefined, timeoutMs: 60000 }));
  return problems;
}

async function draftChannel(channel: 'li_personal' | 'li_group' | 'ig_client' | 'ig_careers', formats: Format[], hooks: string[], extra = '', season = '') {
  const system = channel === 'li_personal' ? `${SAGE}\n\n${FACTS}` : `You write Relève's social content.\n\n${FACTS}`;
  /* The team's own notes on how this account's posts should be built (a
     reference post or reel, a structure to follow), set in the Content tab. */
  const style = (await getSetting<{ text: string }>(`style:${channel}`))?.text?.trim();
  const rules = await houseRules();
  const designStd = channel === 'li_personal' ? '' : await houseDesign();
  const brief = [
    `THE HOUSE RULES. Every post is checked against these before it is saved, and a post that fails is sent back:
${rules}`,
    style ? `How these posts should be built (the team's reference, follow it closely for structure, pacing and tone, but keep every fact and rule above):\n${style}` : '',
    `Write ${formats.length} posts, in this order of format: ${formats.join(', ')}.`,
    PILLARS,
    channel === 'li_personal' || channel === 'li_group' || channel === 'ig_client' ? LI_REFERENCE : '',
    channel === 'li_personal' ? '' : `${DESIGN}\n\nTHE DESIGN STANDARD. Every graphic is checked against this before it is saved, and a graphic that fails is sent back:\n${designStd}`,
    FORMAT_RULES[channel],
    season ? `Keep Relève current. ${season}` : '',
    extra,
    hooks.length ? `Recent hooks. Do not repeat their angle, wording or shape:\n- ${hooks.slice(0, 40).join('\n- ')}` : ''
  ].filter(Boolean).join('\n\n');
  /* Opus designs every slide, so a full week in one answer runs long. The
     week is written in parts of up to three posts; each later part is told
     what the earlier ones already covered, so the week still varies. */
  const out: Drafted[] = [];
  for (let at = 0; at < formats.length; at += 1) {
    const part = formats.slice(at, at + 1);
    const done = out.length
      ? `\n\nYou are writing posts ${at + 1} to ${at + part.length} of ${formats.length} for this week. Already written this week (use different topics, layouts and next steps, and cover the weekly minimums the earlier posts did not):\n- ${out.map(d => `${d.topic} | layouts: ${[d.card?.layout, ...(d.slides ?? []).map((x: any) => x.layout)].filter(Boolean).join(', ') || d.format}`).join('\n- ')}`
      : formats.length > 1 ? `\n\nYou are writing post 1 of ${formats.length} for this week; the rest are written next.` : '';
    const partBrief = brief.replace(`Write ${formats.length} posts, in this order of format: ${formats.join(', ')}.`, `Write ${part.length} posts, in this order of format: ${part.join(', ')}.`) + done;
    /* The answer is accepted in any of the shapes the model uses, but a post
       is only kept when it is whole: a topic, a hook, a caption and its
       graphic. Anything less is asked for again (3 tries), and the model's raw
       answer is kept in the settings table so a failure can be diagnosed. */
    let posts: any[] = [];
    let lastRaw: any = null;
    let feedback = '';
    let best: { n: any; problems: string[] } | null = null;
    for (let tryNo = 0; tryNo < 4; tryNo++) {
      lastRaw = await askClaude(system, partBrief + feedback + '\n\nReturn exactly one JSON object shaped {"posts":[ ... ]} with the post inside the posts array, even when it is a single post. No text outside the JSON. Use exactly these keys on the post and no others for content: topic, hook, format, caption_ig, caption_fb, caption_li, and either card (for a card) or slides (for a carousel), each card or slide using the field names given above (title, body, layout and that layout\'s own fields). Do not rename them (not graphic, captions, headline as the only title field, or point).');
      const got = extractPosts(lastRaw);
      const whole = got.map(g => normalize(channel, g, part[0])).filter(n => n.topic && n.hook && n.caption && (n.card || (n.slides?.length ?? 0) >= 3));
      if (whole.length < part.length) {
        await putSetting('draft:debug', { at: new Date().toISOString(), channel, tryNo, raw: JSON.stringify(lastRaw).slice(0, 3000) }).catch(() => {});
        continue;
      }
      /* The editor's pass: a post that breaks the house rules goes back with
         the reasons, up to twice; the cleanest draft is kept either way. */
      const problems = await reviewPost(channel, whole[0], rules);
      if (!best || problems.length < best.problems.length) best = { n: whole[0], problems };
      if (!problems.length) break;
      if (tryNo >= 2) break;
      feedback = `\n\nYOUR PREVIOUS DRAFT WAS SENT BACK BY THE EDITOR. Fix every one of these, keep the same topic and format, and check the whole post against the house rules again before answering:\n- ${problems.join('\n- ')}`;
      await putSetting('draft:editor', { at: new Date().toISOString(), channel, tryNo, problems }).catch(() => {});
    }
    if (!best) throw new Error(`The AI wrote 0 whole ${CHANNELS[channel].label} posts out of ${part.length}.`);
    if (best.problems.length) console.warn('[content] kept with notes:', best.problems.join(' | '));
    posts = [best.n];
    part.forEach((f, i) => out.push(posts[i]));
  }
  return out;
}

/* ---------- The Relève Brief: LinkedIn's own version (7 Nov 2026) ----------
   Nona's creative direction: LinkedIn has its own direction and never reuses
   the Instagram graphic. Each day's client post is rebuilt for the Relève
   LinkedIn page and the groups as The Relève Brief, a short editorial report
   (a 7 or 8 page document on carousel days, one report page on card days)
   with its own LinkedIn caption. Same idea, facts and next step. If it cannot
   be written, the copies fall back to the Instagram graphic and the team is
   told, so a day is never lost. */
const BRIEF = `You now write the LinkedIn version of the same post: The Relève Brief, a short editorial report in Relève's house style. Same idea, same facts, same next step as the Instagram post below, rebuilt for LinkedIn readers: founders and owners who read for an argument and a method. It stands on its own and never mentions Instagram. Do not reuse the Instagram slides; rethink the structure as a report a consulting firm would be proud of.
Pages. Each page is {"layout","title","body", plus that layout's own fields}, and may carry "kicker": a 1 to 3 word section label for the margin ("The argument", "The working").
- "masthead": page 1 only. title: an opinion-led thesis or a concrete promise, under 64 characters, sentence case. body: one line saying what the reader will get, under 20 words.
- "thesis": title: the argument in one sentence, under 70 characters. body: 1 to 3 sentences of reasoning, under 45 words.
- "figure": "number": one checkable figure (honest arithmetic or clearly illustrative, never an invented statistic), title: what it measures, "facts":[up to 3 {"value","label"}] showing the working. body optional, one line.
- "table": title, "cols":[2 or 3 short column headings], "table":[3 to 6 rows of cells], each cell under 28 characters. Real working: tasks, hours, owners, before and after.
- "framework": a 2 by 2. title, "x": the horizontal axis, low to high, under 30 characters; "y": the vertical axis; "quads":[4 of {"label","text"}] in the order top left, top right, bottom left, bottom right; label under 24 characters, text under 70.
- "method": title, "rows":[3 to 5 steps in order, each under 80 characters]. Only for a true sequence.
- "contrast": title, "left":{"label","items":[3 or 4]}, "right":{"label","items":[3 or 4]}; the right side is the better way.
- "takeaway": title: the one line to remember, under 70 characters. body optional, one sentence.
- "close": last page only. title: the whole brief in one line; body: the one next step with its full address (relevestaffing.com/training or relevestaffing.com/discovery, matching the Instagram post's next step).
A document has 7 or 8 pages: masthead first, close last, and between them at least three different layouts from thesis, figure, table, framework, method, contrast, takeaway. One idea per page; under 40 words of body on a page. A single page is one layout from thesis, figure, table, framework, contrast or method, carrying the post's one working idea in full.
Then the LinkedIn caption: 500 to 1100 characters, \\n for breaks. Open with the thesis in plain words, give the reader one usable thing in the caption itself, say the full brief is in the document when it is a document, and end with the next step as a full address. At most three hashtags at the very end. No em dashes.
Return exactly one JSON object: {"caption":"...","slides":[...]} for a document, or {"caption":"...","card":{"layout","title","body", plus the layout's fields}} for a single page.`;

function normalizeBrief(j: any, format: Format, base: Drafted): Drafted | null {
  const caption = clean(j?.caption ?? j?.caption_li ?? j?.text, 3000);
  if (!caption) return null;
  if (format === 'carousel') {
    const raw = Array.isArray(j?.slides) ? j.slides : Array.isArray(j?.pages) ? j.pages : [];
    const slides: any[] = raw.map((x: any) => ({ ...design(x), kicker: x?.kicker ? clean(x.kicker, 30) : undefined, title: clean(x?.title ?? x?.headline, 140), body: clean(x?.body ?? x?.text, 420) }))
      .filter((x: any) => x.title).slice(0, 9);
    if (slides.length < 6) return null;
    slides[0].layout = 'masthead'; slides[slides.length - 1].layout = 'close';
    for (const x of slides) if (!x.kicker) delete x.kicker;
    slides[0].look = 'brief';
    return { topic: base.topic, hook: base.hook, format: 'carousel', caption, slides, card: null };
  }
  const c = j?.card ?? (Array.isArray(j?.slides) ? j.slides[0] : null);
  const title = clean(c?.title ?? c?.quote ?? c?.headline, 200);
  if (!title) return null;
  const card: any = { ...design(c), kicker: clean(c?.kicker, 30), quote: title, sub: clean(c?.body ?? c?.sub, 300) || undefined, look: 'brief' };
  if (!card.kicker) delete card.kicker;
  if (['masthead', 'close', undefined].includes(card.layout)) card.layout = 'thesis';
  return { topic: base.topic, hook: base.hook, format: 'card', caption, card, slides: [] };
}

async function draftLinkedIn(d: Drafted, season = ''): Promise<Drafted | null> {
  try {
    const designStd = await houseDesign();
    const graphic = d.card
      ? `A single graphic (${d.card.layout ?? 'statement'}): ${JSON.stringify(d.card)}`
      : `A carousel:\n${(d.slides ?? []).map((x, i) => `${i + 1}. ${JSON.stringify(x)}`).join('\n')}`;
    const source = `THE INSTAGRAM POST (the idea to carry over)\nTopic: ${d.topic}\nHook: ${d.hook}\nLinkedIn caption already written for it: ${d.caption_li || d.caption}\n${graphic}`;
    const want = d.format === 'carousel' ? 'Write the document (7 or 8 pages).' : 'Write the single page.';
    const system = `You write Relève's LinkedIn content.\n\n${FACTS}`;
    let feedback = '';
    let best: { n: Drafted; problems: string[] } | null = null;
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const raw = await askClaude(system, [BRIEF, `THE DESIGN STANDARD. Every page is checked against this:\n${designStd}`, season ? `Keep it current. ${season}` : '', source, want].filter(Boolean).join('\n\n') + feedback, 8000);
      const n = normalizeBrief(raw?.posts?.[0] ?? raw, d.format === 'carousel' ? 'carousel' : 'card', d);
      if (!n) { feedback = '\n\nYOUR LAST ANSWER WAS INCOMPLETE (missing the caption or pages). Return the full JSON.'; continue; }
      const text = [n.card ? [n.card.quote, n.card.sub, ...((n.card as any).rows ?? [])].join('\n') : '', ...(n.slides ?? []).map((x: any) => [x.title, x.body, ...(x.rows ?? [])].join('\n'))].join('\n');
      const problems = [...designChecks(n), ...hardChecks({ hook: n.hook, text: n.caption, graphic: text, channel: 'li_page_client' }).problems];
      if (!best || problems.length < best.problems.length) best = { n, problems };
      if (!problems.length) break;
      feedback = `\n\nYOUR PREVIOUS DRAFT WAS SENT BACK BY THE EDITOR. Fix every one of these and keep the same idea:\n- ${problems.join('\n- ')}`;
    }
    if (!best) throw new Error('The AI did not return a whole LinkedIn brief.');
    return best.n;
  } catch (e: any) {
    const why = String(e?.message ?? e).slice(0, 300);
    console.error('[content] LinkedIn brief failed:', why);
    await putSetting('draft:linkedin', { at: new Date().toISOString(), topic: d.topic, error: why }).catch(() => {});
    return null;
  }
}

const isBriefPost = (p: { card?: any; slides?: any[] }) => p?.card?.look === 'brief' || p?.slides?.[0]?.look === 'brief';

/* Rebuild the LinkedIn brief for a day's post and put it on its page and
   group copies. Used by Redraft and by "Make the LinkedIn versions". */
export async function rebuildLinkedIn(parent: ContentPost): Promise<boolean> {
  const { data } = await sb().from('content_posts').select('*').eq('parent_id', parent.id).in('channel', ['li_page_client', 'li_group']);
  const kids = ((data ?? []) as ContentPost[]).filter(k => k.status !== 'posted' && k.status !== 'publishing' && k.status !== 'skipped');
  if (!kids.length || (parent.card as any)?.layout === 'hiring') return false;
  const base: Drafted = { topic: parent.topic ?? '', hook: parent.hook ?? '', format: parent.format, caption: parent.caption, caption_li: kids[0].caption, card: parent.card, slides: parent.slides };
  const li = await draftLinkedIn(base);
  if (!li) return false;
  for (const k of kids) await updatePost(k.id, { format: li.format, caption: li.caption, card: li.card ?? null, slides: li.slides ?? [], written_by: 'claude' } as any);
  return true;
}

/* Every day of a week that still carries the Instagram graphic on LinkedIn. */
export async function rebuildLinkedInWeek(monday: string, deadline = Date.now() + 12 * 60000) {
  hardDeadline = deadline;
  const all = await listWeek(monday);
  const parents = all.filter(p => p.channel === 'ig_client' && !p.parent_id && p.status !== 'skipped' && (p.card as any)?.layout !== 'hiring');
  let made = 0, left = 0;
  for (const p of parents) {
    const kids = all.filter(k => k.parent_id === p.id && (k.channel === 'li_page_client' || k.channel === 'li_group') && k.status !== 'posted' && k.status !== 'skipped' && new Date(k.publish_at).getTime() > Date.now());
    if (!kids.length || kids.every(isBriefPost)) continue;
    if (Date.now() > deadline - 90000) { left++; continue; }
    if (await rebuildLinkedIn(p)) made++; else left++;
  }
  hardDeadline = 0;
  return { made, left };
}

function statusFor(channel: Channel, format: Format) {
  if (channel === 'li_personal') return 'needs_image';
  if (channel === 'li_group') return 'manual';
  if (channel === 'li_page_client' || channel === 'li_page_careers') return pageAccess() ? 'scheduled' : 'manual';
  if (format === 'video') return 'needs_video';
  return 'scheduled';
}

/* Which of the week's daily client posts still do not exist. */
export async function missingSlots(monday: string): Promise<string[]> {
  const want = WEEK_PLAN.filter(x => x.channel === 'ig_client').map(x => `${monday}-ig_client-${DAY_KEYS[x.day]}`);
  const { data } = await sb().from('content_posts').select('slot').in('slot', want);
  const have = new Set(((data ?? []) as { slot: string }[]).map(r => r.slot));
  return want.filter(w => !have.has(w));
}

/* Tell the team when something in the content engine breaks: an email and a
   phone push. The same problem alerts at most once every 3 hours. */
export async function alertAdmins(key: string, headline: string, detail: string) {
  try {
    const last = await getSetting<{ at: string }>(`alert:${key}`);
    if (last && Date.now() - new Date(last.at).getTime() < 3 * 3600000) return;
    await putSetting(`alert:${key}`, { at: new Date().toISOString() });
    const subject = `Relève content needs you: ${headline}`;
    await toTeam(subject, headline, p(esc(detail)) + p('Open the Content tab and press Redraft the week, or reply to Claude in the console.'), `${headline}\n\n${detail}`);
    const { sendPushToEmail } = await import('./push');
    const admins = await teamEmailsAdmin();
    await Promise.all(admins.map(e => sendPushToEmail(e, { title: 'Content needs you', body: `${headline}. ${detail}`.slice(0, 180), url: '/console/content', tag: `alert-${key}` })));
  } catch (e) { console.error('[content] alert failed', e); }
}

/* Draft a week and see it through: if anything is still missing it starts
   itself again (up to 6 rounds), and if it still cannot finish it alerts. */
export async function runDraft(monday: string, attempt = 1) {
  await putSetting(`draft:${monday}`, { status: 'drafting', at: new Date().toISOString(), attempt });
  let err = ''; let made: string[] = [];
  try { made = await draftWeek(monday); } catch (e: any) { err = String(e?.message ?? e).slice(0, 300); }
  const missing = await missingSlots(monday);
  if (!missing.length) {
    await putSetting(`draft:${monday}`, { status: 'done', at: new Date().toISOString(), made: made.length, attempt });
    if (made.length) await previewWeek(monday);
    return;
  }
  if (attempt < 6 && await kick('draft_week', { week: monday, attempt: attempt + 1 })) {
    await putSetting(`draft:${monday}`, { status: 'drafting', at: new Date().toISOString(), attempt, note: `${missing.length} still to write, trying again` });
    return;
  }
  const why = err || lastDraftError || 'The AI could not finish every post.';
  await putSetting(`draft:${monday}`, { status: 'failed', at: new Date().toISOString(), error: why, attempt });
  await alertAdmins(`draft-${monday}`, `The week of ${monday} is not fully written (${missing.length} of 6 posts missing)`, why);
}

/* Draft the whole week that starts on `monday`. Re-running fills only the
   slots still empty, so an interrupted run simply carries on. */
export async function draftWeek(monday: string) {
  const existing = new Set((await listWeek(monday)).map(r => r.slot));
  const hooks = await recentHooks();
  const made: string[] = [];
  /* Careers posts are paused until a careers Facebook page is chosen in the
     Content tab (31 Oct 2026: the careers page did not come through Meta). */
  /* A redone week waits for approval: its new posts are drafted held. */
  const holdNew = Boolean((await getSetting<{ on: boolean }>(`hold:${monday}`))?.on);
  const heldFields = holdNew ? { hold_reason: 'Waiting for your approval.' } : {};
  /* li_personal is photo-first (written from Sage's uploaded photo), so it is
     NOT drafted here. The other channels are written by Opus as before. */
  /* One post a day (2 Nov 2026): the client post is written once and copied
     to the LinkedIn page and the groups, so only ig_client (and careers, when
     it is on) are drafted. */
  const families: ('ig_client' | 'ig_careers')[] = ['ig_client'];  // careers removed 2 Nov 2026

  /* One post at a time, each saved the moment it is written, so a hiccup
     never costs the week: whatever is saved stays, and the next run (it
     re-starts itself, see runDraft) only fills what is still empty. Stops
     before the worker's 15 minutes run out. */
  const deadline = Date.now() + 11 * 60000;
  hardDeadline = deadline; lastDraftError = '';
  const earlier: string[] = (await listWeek(monday)).filter(r => r.channel === 'ig_client' && r.status !== 'skipped' && r.topic)
    .map(r => `${r.topic} | layouts: ${[(r.card as any)?.layout, ...((r.slides ?? []) as any[]).map(x => x?.layout)].filter(Boolean).join(', ') || r.format}`);
  for (const ch of families) {
    const plan = WEEK_PLAN.filter(s => s.channel === ch && !existing.has(`${monday}-${ch}-${DAY_KEYS[s.day]}`));
    for (const s of plan) {
      if (Date.now() > deadline) break;
      const extra = earlier.length ? `Already written this week (use different topics, layouts and next steps, and cover the weekly minimums these did not):\n- ${earlier.join('\n- ')}` : '';
      let d: Drafted;
      try { [d] = await draftChannel(ch, [s.format], hooks, extra, seasonFor(monday)); }
      catch (e: any) { lastDraftError = String(e?.message ?? e).slice(0, 300); console.error('[content] one post failed:', lastDraftError); continue; }
      const slot = `${monday}-${ch}-${DAY_KEYS[s.day]}`;
      const at = slotTime(monday, s.day, s.hour, s.minute).toISOString();
      /* The copies (one post a day): the client post goes to the LinkedIn
         page and the groups as its own LinkedIn version, The Relève Brief
         (7 Nov 2026). Written before anything is saved, so a stopped worker
         never leaves a day without its copies. */
      const targets: Channel[] = ch === 'ig_client'
        ? COPY_PLAN.filter(c => c.days.includes(s.day)).map(c => c.channel)
        : (pageFor(ch) ? [pageFor(ch) as Channel] : []);
      const li = targets.length && d.format !== 'video' ? await draftLinkedIn(d, seasonFor(monday)) : null;
      const { data: row, error } = await sb().from('content_posts').insert({
        slot, week_start: monday, channel: ch, format: d.format, publish_at: at, status: holdNew ? 'held' : statusFor(ch, d.format), ...heldFields,
        topic: d.topic, hook: d.hook, caption: d.caption, caption_fb: d.caption_fb ?? null,
        card: d.card ?? null, slides: d.slides ?? [], script: d.script ?? null, image_idea: d.image_idea ?? null
      }).select('id').single();
      if (error) { if (/duplicate/i.test(error.message)) continue; throw new Error(error.message); }
      made.push(slot);
      hooks.unshift(d.hook);
      earlier.push(`${d.topic} | layouts: ${[d.card?.layout, ...(d.slides ?? []).map((x: any) => x.layout)].filter(Boolean).join(', ') || d.format}`);

      if (targets.length && !li && d.format !== 'video') await alertAdmins(`linkedin-${slot}`, 'A LinkedIn brief could not be written', `${dayLabel(at)}: the LinkedIn page and groups carry the Instagram graphic for now. Press Redraft on the LinkedIn copy, or "Make the LinkedIn versions", to try again.`);
      for (const target of targets) {
        const f = li ? li.format : d.format;
        await sb().from('content_posts').insert({
          slot: `${slot}-${target}`, week_start: monday, channel: target, format: f, publish_at: at,
          status: holdNew ? 'held' : f === 'video' ? 'needs_video' : statusFor(target, f), ...heldFields,
          topic: d.topic, hook: d.hook, caption: li?.caption || d.caption_li || d.caption || d.hook, caption_fb: null,
          card: (li ? li.card : d.card) ?? null, slides: (li ? li.slides : d.slides) ?? [], script: d.script ?? null, parent_id: row.id
        });
      }
    }
  }
  /* Open this week's six personal slots for photos. Each is written when Sage
     uploads a candid picture to it. A push tells her they are ready. */
  const liPlan = WEEK_PLAN.filter(sl => sl.channel === 'li_personal' && !existing.has(`${monday}-li_personal-${DAY_KEYS[sl.day]}`));
  let liMade = 0;
  for (const sl of liPlan) {
    const slot = `${monday}-li_personal-${DAY_KEYS[sl.day]}`;
    const at = slotTime(monday, sl.day, sl.hour, sl.minute).toISOString();
    const { error } = await sb().from('content_posts').insert({
      slot, week_start: monday, channel: 'li_personal', format: 'text', publish_at: at, status: 'needs_image',
      topic: null, hook: null, caption: '', image_idea: 'Upload a candid photo from your week; the post is written around it.'
    });
    if (!error) { made.push(slot); liMade++; }
    else if (!/duplicate/i.test(error.message)) throw new Error(error.message);
  }
  if (liMade) await remindUploadPhotos(monday, liMade);

  return made;
}

/* Rewrite one post in place (same channel, format and slot). */
export async function redraftPost(post: ContentPost) {
  /* A LinkedIn copy of a day's post: rebuild its brief from the day's post. */
  if (post.parent_id && (post.channel === 'li_page_client' || post.channel === 'li_group')) {
    const parent = await getPost(post.parent_id);
    if (parent && (parent.card as any)?.layout !== 'hiring') {
      if (!(await rebuildLinkedIn(parent))) throw new Error('The LinkedIn brief could not be written. Try again in a minute.');
      return;
    }
  }
  const family = (post.channel === 'li_page_client' || post.channel === 'li_group' ? 'ig_client' : post.channel === 'li_page_careers' ? 'ig_careers' : post.channel) as 'li_personal' | 'li_group' | 'ig_client' | 'ig_careers';
  const [d] = await draftChannel(family, [post.format], [post.hook ?? '', ...(await recentHooks())].filter(Boolean),
    post.format === 'video' ? 'This one is the face-to-camera video.' : '');
  const caption = post.channel.startsWith('li_page') ? (d.caption_li || d.caption) : d.caption;
  await updatePost(post.id, {
    topic: d.topic, hook: d.hook, caption, caption_fb: post.channel.startsWith('ig_') ? (d.caption_fb ?? null) : null,
    card: d.card ?? null, slides: d.slides ?? [], script: d.script ?? null, image_idea: d.image_idea ?? post.image_idea,
    written_by: 'claude'
  } as any);
  /* The copies (LinkedIn page, groups) carry the same new post; the page
     and group copies of a client post get their own LinkedIn brief. */
  const { data: kids } = await sb().from('content_posts').select('id,status,channel').eq('parent_id', post.id).in('channel', COPY_CHANNELS);
  const live = ((kids ?? []) as { id: string; status: string; channel: Channel }[]).filter(k => k.status !== 'posted' && k.status !== 'publishing');
  const liKids = post.channel === 'ig_client' ? live.filter(k => k.channel === 'li_page_client' || k.channel === 'li_group') : [];
  const li = liKids.length && d.format !== 'video' ? await draftLinkedIn(d) : null;
  for (const k of live) {
    const brief = li && liKids.some(x => x.id === k.id);
    await updatePost(k.id, {
      topic: d.topic, hook: d.hook, caption: brief ? li!.caption : (d.caption_li || d.caption),
      format: brief ? li!.format : d.format, card: (brief ? li!.card : d.card) ?? null, slides: (brief ? li!.slides : d.slides) ?? [],
      script: d.script ?? null, written_by: 'claude'
    } as any);
  }
}

/* ---------- publishing ---------- */

/* Photo-first personal posts: Sage uploads a candid photo, Claude writes the
   post around what the photo actually shows, in her voice. */
export async function writePostFromImage(post: ContentPost): Promise<void> {
  if (post.channel !== 'li_personal' || !post.image_path) return;
  try {
    const img = await fetchBytes(mediaUrl(post.image_path));
    const rules = await houseRules();
    const system = `${SAGE}\n\n${FACTS}\n\n${LI_REFERENCE}\n\nTHE HOUSE RULES (section 7 is yours; every post is checked against them):\n${rules}`;
    const brief = [
      "The image above is a real, candid photo from Sage's own life that she has chosen for this post.",
      'FIRST look at the photo and work out what it actually shows (where she is, what she is doing, the light, the mood). Then write ONE LinkedIn post built around THAT moment: the first line names the real moment in the photo and pivots to a belief or lesson in Sage\'s voice. Never write about a different setting than the one in the photo (no airport unless the photo is an airport). Do not list what is in the image. Then the lesson for a business owner, in Sage\'s voice. End with a question or a quiet comment-to-DM invitation (for example a free Zoom-coffee delegation audit by DM). No links.',
      'Keep it universal: the lesson must apply to ANY business owner, not one industry.',
      'Return JSON only, with exactly these three keys: {"image_idea":"one sentence describing what this photo actually shows","hook":"the first line","text":"the full post, 900 to 1500 characters, line breaks as \\n"}'
    ].join('\n\n');
    let caption = ''; let hook = ''; let idea = ''; let feedback = '';
    let best: { caption: string; hook: string; idea: string; problems: string[] } | null = null;
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      const raw = await askClaudeVision(system, brief + feedback, img, 4000);
      const r = raw?.post && typeof raw.post === 'object' ? raw.post : raw;
      caption = clean(r?.text ?? r?.post ?? r?.caption ?? r?.body ?? r?.content ?? r?.linkedin_post ?? (typeof raw === 'string' ? raw : ''), 3000);
      hook = clean(r?.hook, 300) || clean(caption.split('\n')[0], 300);
      idea = r?.image_idea ? clean(r.image_idea, 300) : '';
      if (caption.length < 300) continue;
      const problems = await reviewPost('li_personal', { topic: idea, hook, format: 'text', caption } as Drafted, rules);
      if (!best || problems.length < best.problems.length) best = { caption, hook, idea, problems };
      if (!problems.length) break;
      feedback = `\n\nYOUR PREVIOUS DRAFT WAS SENT BACK BY THE EDITOR. Fix every one of these and keep the post anchored to what the photo actually shows:\n- ${problems.join('\n- ')}`;
    }
    if (best) { caption = best.caption; hook = best.hook; idea = best.idea; }
    if (caption.length < 300) throw new Error('No full post came back from the AI.');
    await updatePost(post.id, {
      hook: hook || null, caption,
      image_idea: idea || post.image_idea,
      status: 'held', hold_reason: 'Written from your photo. Edit if you like, then approve the week.'
    } as any);
  } catch (e: any) {
    /* Never leave the post stuck on "Writing…", and say what went wrong. */
    const why = String(e?.message ?? e).slice(0, 200);
    await updatePost(post.id, {
      status: post.caption ? 'held' : 'needs_image',
      hold_reason: `Could not write from that photo: ${why}`
    } as any).catch(() => {});
    await alertAdmins(`photo-${post.id}`, 'A post could not be written from your photo', why);
  }
}

async function remindUploadPhotos(monday: string, n: number) {
  try {
    const { sendPushToEmail } = await import('./push');
    const admins = await teamEmailsAdmin();
    const when = new Date(`${monday}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
    await Promise.all(admins.map(e => sendPushToEmail(e, {
      title: 'Time to upload your photos',
      body: `Your ${n} personal LinkedIn posts for the week of ${when} are ready. Upload a candid photo for each and the post writes itself.`,
      url: '/console/content', tag: 'photo-upload'
    })));
  } catch { /* best-effort */ }
}

/* The launch set (slot ...-launchNN) was designed and approved as finished
   pictures, so those posts go out as the stored files rather than being
   drawn again from their text. */
export function launchFile(slot: string, i: number) {
  const m = /-launch(\d{2})$/.exec(slot);
  return m ? `/social30/p${m[1]}-${i + 1}.jpg` : null;
}
async function imagesFor(post: ContentPost): Promise<string[]> {
  const n = imageCount(post);
  return Array.from({ length: n }, (_, i) => { const f = launchFile(post.slot, i); return f ? `${APP()}${f}` : imageUrl(post.id, i, 'jpg'); });
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
    const hiring = (post.card as any)?.layout === 'hiring';
    const images = post.channel === 'li_personal' && !hiring
      ? (post.image_path ? [await fetchBytes(mediaUrl(post.image_path))] : [])
      : await Promise.all((await imagesFor(post)).map(fetchBytes));
    if (post.channel === 'li_personal' && !images.length) throw new Error('Add your picture first.');
    if (post.channel === 'li_personal' && !(post.caption ?? '').trim()) throw new Error('No words yet: this post is still being written from its photo.');
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


/* ---------- hiring posts (6 Nov 2026) ----------
   Every time a job posting goes live, the app makes a hiring post for it:
   one graphic (the approved "We are hiring." layout, see content-render.tsx),
   one caption, and a copy for every place it belongs. Every role is for one
   of Relève's clients and never for Relève itself, so the post never names the
   client. It waits for Nona's approval (Content tab, "Release the hold", or
   Approve the week) unless HIRING_AUTOPOST=1 is set, then posts itself to
   Relève's Instagram and Facebook and Sage's LinkedIn. The LinkedIn pages and
   the Careers accounts go to the team as post-by-hand until they are
   connected. */
const nodashH = (s: unknown) => String(s ?? '').replace(/\s*[–—]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const lines = (s: unknown) => String(s ?? '').split(/\n+/).map(x => x.trim()).filter(Boolean);
const sentence = (s: string) => { const t = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : t; };

const HIRING_EXAMPLE = `We're hiring a social media manager for one of our clients.

The client is a founder-led business. I can't share the name until you're hired, but here is exactly what the work looks like.

THE WORK
- Twice a week you get a face-to-camera video and turn it into a finished post: cut it tight, add captions, size it for each platform.
- Build the carousels from scratch.
- Publish everything to the client's accounts on schedule.
- Tell us when something needs attention, like a post that flopped or a comment that needs a reply.

THE TERMS
- 5 to 10 hours a week
- Fully remote
- $7 an hour

WHO WE'RE LOOKING FOR
- Strong design. Your carousels have to look better than everyone else's.
- Fast, clean editing and deadlines you actually hit.
- Use AI wherever it saves you time, as long as the finished work still looks like someone with taste made it.

HOW TO APPLY
Go to relevestaffing.com/careers and send examples of your work. I'll look at the work before I look at a résumé.`;

function hiringFallback(job: any) {
  const role = sentence(job.title);
  const own = lines(job.owns).slice(0, 5).map(x => `- ${nodashH(x)}`).join('\n');
  const need = lines(job.needs).slice(0, 5).map(x => `- ${nodashH(x)}`).join('\n');
  const terms = [job.hours, job.location, job.pay_note].map(x => nodashH(x)).filter(Boolean).map(x => `- ${x}`).join('\n');
  return [
    `We're hiring a ${role.toLowerCase()} for one of our clients.`,
    `The client is a founder-led business. I can't share the name until you're hired, but here is exactly what the work looks like.`,
    own && `THE WORK\n${own}`, terms && `THE TERMS\n${terms}`, need && `WHO WE'RE LOOKING FOR\n${need}`,
    `HOW TO APPLY\nGo to relevestaffing.com/careers and apply for the role.`
  ].filter(Boolean).join('\n\n');
}

export async function draftHiringPost(postingId: string, opts: { useAI?: boolean } = {}): Promise<{ created: boolean; why?: string }> {
  const { data: job } = await sb().from('job_posts').select('*').eq('id', postingId).maybeSingle();
  if (!job) return { created: false, why: 'No such posting.' };
  if (job.state !== 'open') return { created: false, why: 'The posting is not open.' };
  const slot = `hire-${job.id}`;
  const { data: have } = await sb().from('content_posts').select('id').like('slot', `${slot}%`).limit(1);
  if (have?.length) return { created: false, why: 'This role already has its hiring post.' };

  /* Short copy for the graphic and the words for the caption. */
  let hire = {
    work: nodashH(lines(job.owns)[0] ?? job.summary), hours: nodashH([job.hours, job.location].filter(Boolean).join('. ')),
    pay: nodashH(job.pay_note), you: nodashH(lines(job.needs)[0] ?? ''), apply: 'Apply at relevestaffing.com/careers'
  };
  let caption = hiringFallback(job);
  let drafted = false;
  if (opts.useAI !== false && process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await askClaude(
        `You write the hiring announcement for one job posting at Relève, a premium virtual staffing agency. Every role is for one of Relève's clients and is never for Relève itself. Never name the client and never say Relève is the employer. The post is written in the first person by Sage, Relève's founder. Plain, direct, high-end, human. It must not sound like AI: no filler openers, no "not X but Y" constructions, no slogans, no exclamation marks, no emojis, no hashtags, no em dashes or en dashes (use commas, periods or colons). Do not invent facts that are not in the posting: if the posting does not say it, leave it out. Follow the structure and voice of this approved example exactly, with the same section labels in capitals, but with the facts of the posting you are given:\n\n${HIRING_EXAMPLE}\n\nReturn only JSON: {"work": string, "hours": string, "pay": string, "you": string, "caption": string}. The first four are the short lines printed on the graphic, so keep them tight: work at most 84 characters (what the person does, as one sentence), hours at most 40 characters (for example "Part time, 5 to 10 hours a week. Remote."), pay at most 36 characters (empty string if the posting shows no pay), you at most 84 characters (what we want in the person, as one sentence). caption is the full post text. It ends with the line to apply at relevestaffing.com/careers.`,
        `THE POSTING\nTitle: ${job.title}\nOne line: ${job.summary}\nAbout: ${job.about ?? ''}\nWhat this person owns:\n${job.owns ?? ''}\nWhat we are looking for:\n${job.needs ?? ''}\nHours: ${job.hours ?? ''}\nLocation: ${job.location ?? ''}\nPay shown publicly: ${job.pay_note ?? '(none shown)'}`,
        3000
      );
      const clean = (x: unknown, n: number) => nodashH(x).slice(0, n);
      if (r && typeof r.caption === 'string' && r.caption.trim().length > 200) {
        caption = String(r.caption).replace(/[–—]/g, ', ').replace(/[ \t]+\n/g, '\n').trim().slice(0, 2900);
        hire = { work: clean(r.work, 100) || hire.work, hours: clean(r.hours, 48) || hire.hours, pay: clean(r.pay, 42), you: clean(r.you, 100) || hire.you, apply: hire.apply };
        drafted = true;
      }
    } catch (e: any) { console.error('[hiring] Claude draft failed, using the template:', e?.message ?? e); }
  }
  if (!/relevestaffing\.com\/careers/i.test(caption)) caption += '\n\nApply at relevestaffing.com/careers';

  const now = new Date();
  const monday = weekStart(now);
  const role = sentence(job.title);
  const card = { layout: 'hiring', kicker: 'Now hiring', quote: 'We are hiring.', sub: role, hire };
  const hold = process.env.HIRING_AUTOPOST === '1' ? null : 'New role: read the graphic and the words, then release the hold.';
  const base = { week_start: monday, publish_at: now.toISOString(), topic: `Hiring: ${role}`, hook: `We are hiring a ${role.toLowerCase()}.`, caption, caption_fb: null, card, slides: [], script: null, written_by: 'claude' as const };

  const { data: main, error } = await sb().from('content_posts').insert({
    ...base, slot, channel: 'ig_client', format: 'card', status: hold ? 'held' : 'scheduled', hold_reason: hold
  }).select('id').maybeSingle();
  if (error || !main) throw new Error(error?.message ?? 'Could not save the hiring post.');

  /* Sage's own LinkedIn, the careers accounts and the LinkedIn page copies. */
  const more: any[] = [
    { ...base, slot: `${slot}-li`, channel: 'li_personal', format: 'card', status: hold ? 'held' : 'scheduled', hold_reason: hold, parent_id: main.id },
    { ...base, slot: `${slot}-ic`, channel: 'ig_careers', format: 'card', status: hold ? 'held' : 'scheduled', hold_reason: hold, parent_id: main.id },
    { ...base, slot: `${slot}-pg`, channel: 'li_page_client', format: 'card', status: hold ? 'held' : (pageAccess() ? 'scheduled' : 'manual'), hold_reason: hold, parent_id: main.id },
    { ...base, slot: `${slot}-pc`, channel: 'li_page_careers', format: 'card', status: hold ? 'held' : (pageAccess() ? 'scheduled' : 'manual'), hold_reason: hold, parent_id: main.id }
  ];
  await sb().from('content_posts').insert(more);

  if (hold) await alertAdmins(`hire-${job.id}`, `A hiring post for ${role} is ready`, `${drafted ? 'Claude wrote' : 'The app drafted'} the graphic and the words for the new ${role} role. Open the Content tab, read them, and release the hold to post it to Instagram, Facebook and Sage's LinkedIn.`);
  return { created: true };
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

  const manualAll = ((todays ?? []) as ContentPost[]).filter(x => x.status === 'manual');
  /* One post a day: the LinkedIn page copy and the groups copy are the same
     post, so they arrive as one block. */
  const groupParents = new Set(manualAll.filter(x => x.channel === 'li_group' && x.parent_id).map(x => x.parent_id));
  const pageParents = new Set(manualAll.filter(x => x.channel.startsWith('li_page') && x.parent_id).map(x => x.parent_id));
  const manual = manualAll.filter(x => !(x.channel.startsWith('li_page') && x.parent_id && groupParents.has(x.parent_id)));
  const blocks: string[] = [];
  for (const m of manual) {
    const files = m.format === 'carousel'
      ? `<a href="${pdfUrl(m.id)}" style="color:#35443A;">Download the carousel (PDF for LinkedIn)</a>`
      : m.format === 'card' ? `<a href="${imageUrl(m.id, 0)}" style="color:#35443A;">Download the graphic</a>`
      : m.video_path ? `<a href="${mediaUrl(m.video_path)}" style="color:#35443A;">Download your video</a>` : 'Record the video from the script in the Content tab.';
    const both = m.channel === 'li_group' && Boolean(m.parent_id) && pageParents.has(m.parent_id);
    const title = both ? 'LinkedIn page + groups' : CHANNELS[m.channel].label;
    const where = m.channel === 'li_group'
      ? (both ? 'Post it on the Relève LinkedIn page (or schedule it there), then in the groups: ' : '') + (groups.length ? groups.map(g => g.url ? `<a href="${esc(g.url)}" style="color:#35443A;">${esc(g.name || g.url)}</a>` : esc(g.name)).join(' · ') : 'Add your four groups in the Content tab.')
      : `${esc(CHANNELS[m.channel].label)}: post it, or schedule it in LinkedIn.`;
    blocks.push(`<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:18px;color:#35443A;margin:22px 0 8px;">${esc(title)} · ${esc(whenLabel(m.publish_at))}</h2>` +
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
    [...notes.map(n => n.replace(/<[^>]+>/g, '')), ...manual.map(m => `${m.channel === 'li_group' && m.parent_id && pageParents.has(m.parent_id) ? 'LinkedIn page + groups' : CHANNELS[m.channel].label} ${whenLabel(m.publish_at)}\n${m.caption}`)].join('\n\n')
  );
  return true;
}

/* ---------- the hourly tick ---------- */

export async function tick(now = new Date()) {
  const out: Record<string, unknown> = {};
  try { out.published = await publishDue(now); } catch (e: any) { out.publishError = e?.message ?? String(e); await alertAdmins('publish', 'A scheduled post could not be published', String(out.publishError)); }

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
    const retry = lock?.status === 'failed' && Date.now() - new Date(lock.at).getTime() > 45 * 60000;
    if (!lock || stuck || retry) {
      try { await runDraft(next); out.drafted = true; }
      catch (e: any) {
        out.draftError = e?.message ?? String(e);
        await putSetting(`draft:${next}`, { status: 'failed', at: new Date().toISOString(), error: out.draftError });
        await alertAdmins(`draft-${next}`, 'Drafting next week crashed', String(out.draftError));
      }
    }
  }
  /* The VA (on US hours) gets the coming week on Sunday from 8:00 AM
     Pacific, so any edits made after Thursday's draft are in what she
     receives. Once per week. */
  /* LinkedIn's own version (7 Nov 2026): a week drafted before The Relève
     Brief existed gets its LinkedIn briefs built once, in the background. */
  for (const wk of [weekStart(now, 0), weekStart(now, 1)]) {
    if ((await getSetting<{ status: string }>(`draft:${wk}`))?.status === 'drafting') continue;
    if (await getSetting(`linkedin:${wk}`)) continue;
    await putSetting(`linkedin:${wk}`, { status: 'queued', at: new Date().toISOString() });
    try { out.linkedin = await kick('linkedin_week', { week: wk }); } catch (e: any) { out.linkedinError = e?.message ?? String(e); }
  }
  if (pt.wd === 0 && pt.h >= 8) {
    try { out.va = await exportForVA(weekStart(now, 1)); } catch (e: any) { out.vaError = e?.message ?? String(e); await alertAdmins('va', 'The weekly send to the VA failed', String(out.vaError)); }
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
  const sorted = (await listWeek(monday)).filter(forVA).sort((a, b) => a.publish_at.localeCompare(b.publish_at));
  /* One post a day: when a day's page copy and groups copy are the same post,
     the VA gets one entry (one file) telling her to post it in both places. */
  const groupParents = new Set(sorted.filter(p => p.channel === 'li_group' && p.parent_id).map(p => p.parent_id));
  const pageParents = new Set(sorted.filter(p => p.channel.startsWith('li_page') && p.parent_id).map(p => p.parent_id));
  const posts = sorted.filter(p => !(p.channel.startsWith('li_page') && p.parent_id && groupParents.has(p.parent_id)));
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
      const both = p.channel === 'li_group' && Boolean(p.parent_id) && pageParents.has(p.parent_id);
      const where = p.channel === 'li_group' ? (both ? 'The Relève LinkedIn page, then all four LinkedIn groups (the same post in each)' : 'LinkedIn groups (post in all four)') : CHANNELS[p.channel].label;
      const base = `${short(p.publish_at)} - ${p.channel === 'li_group' ? (both ? 'Page and groups' : 'Groups') : 'LinkedIn page'} - ${p.format}`.replace(/[,/]/g, '');
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
      if (p.format === 'carousel' && (p.channel === 'li_group' || p.channel.startsWith('li_page'))) lines.push('Post the PDF as a document (carousel) and give it the title of the first page.');
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
