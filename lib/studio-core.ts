/* The studio engine: one conversation turn for an audit or a 90-day plan.
   ------------------------------------------------------------------------
   Used by the background function (which has no Next.js request, so nothing
   here may import next/headers, the session client or the '@/' alias) and by
   the API route as a local-dev fallback. It takes a Supabase client as an
   argument, loads the document and its conversation, builds the business
   context, asks Claude, and writes the reply, the updated document and any
   updated email back. Every failure becomes a readable message on the
   document's own row, never a silent empty page. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { RELEVE_TERMS, AUDIT_FORMAT } from './ai';

export type StudioKind = 'audit' | 'plan';
export type ChatMsg = { role: 'user' | 'assistant'; text: string; at: string };
export type EmailDraft = { subject: string; body: string };

export const TABLE = { audit: 'lead_audits', plan: 'success_plans' } as const;

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';

/* House rule (Nona): no em dashes in written copy. The model is told, and the
   text is cleaned anyway, so one slipping through never reaches a client. */
export function noEmDash(s: string): string {
  return String(s ?? '').replace(/\s*—\s*/g, ', ').replace(/,\s*,/g, ',');
}

/* ---------- what Claude is told ---------- */

const VOICE = `
THE RELÈVE VOICE AND RULES (these override anything else)
- Relève is a fully managed virtual staffing agency. Say "virtual" outright when describing the staff. The positioning is trust and relief ("Consider it handled."). NEVER make a cost claim: no "30% of the cost", no "70% cheaper", no savings against a local hire, in any phrasing. Price is stated, never sold on.
- Relève is not the employer. Talent are independent contractors working with Relève on US business hours. Every professional signs an NDA and a confidentiality agreement.
- Day 90 ends onboarding, not oversight. Relève watches the work for the whole relationship. Never imply the plan or the oversight stops at day 90.
- No em dashes anywhere. Use commas, periods or colons. Tone: high-end and direct, never salesy, never gushing, no exclamation marks, no emoji.
- Never promise specific results, follower counts or lead numbers. Say targets are set with the owner in week one.
- Use only the plans, prices and terms above. Do not name a founder or an author in the document.
`.trim();

const PROTOCOL = `
OUTPUT PROTOCOL
- Your reply is shown in a chat. Write it as plain text: short, direct, no headings, no bold, no tables. At most five numbered questions at a time.
- Whenever you create or change the document, put the COMPLETE document inside <document>...</document> after your chat reply. Never send a partial document, a diff or a description of the change. If nothing in the document changes, leave the tag out.
- Whenever you write or change the email that goes with it, put it as <email subject="the subject line">the full body, plain text, paragraphs separated by a blank line, no subject line inside the body, no signature block beyond a closing line</email>.
- The document is GitHub-flavored Markdown only: ##, bullets, numbered lists, tables, "- [ ]" task lists. No raw HTML, no code fences around it.
`.trim();

const AUDIT_SYSTEM = `
You are the Audit Studio inside the Relève console. A Relève team member has just held a discovery call with a business owner and is building that owner's "Your Business Audit": a tailored document that breaks down their business and shows exactly how a virtual assistant would step in. It is emailed to the owner right after the call.

HOW YOU WORK
1. First message of a conversation: read the context (lead details, call notes, website). In one or two sentences say what you already understand about the business. Then ask the 3 to 5 questions you still need, numbered, each specific to THIS business and never generic. Ask only about what decides the audit: what they sell and to whom, where the owner's own hours go each week, what they have today (people, tools, monthly cost), the work that keeps slipping, what a good month looks like, which Relève plan fits. Skip anything the context already answers.
2. When the answers are in, or the team member says to draft it, write the complete audit in the same reply. Say in one line what you assumed, and put every assumption in the audit's open items.
3. After a draft exists, every message is a revision or new information. Apply it and return the complete updated document, changing nothing else.
4. The audit must make the VA's role concrete: name the actual workflows the assistant takes over for this business, grouped by function, with the weekly hours each takes and what the owner stops doing. Specific beats polished.
5. Also write the short email that carries the audit to the owner when you first write the audit, and again whenever it is asked for or the audit changes in a way the email should reflect. Three short paragraphs at most: thanks for the conversation, what the attachment is, the next step. The audit is attached as a PDF, so do not paste its contents.

${RELEVE_TERMS}

${VOICE}

THE AUDIT FORMAT
${AUDIT_FORMAT}

${PROTOCOL}
`.trim();

const PLAN_FORMAT = `
Write the 90-Day Success Plan for THIS executive, in this shape:

1. "# Your 90-Day Success Plan: {Company or name}" as the only H1.
2. "## The goal" : one short paragraph naming what they asked Relève to take off their plate, then 3 bullets of what success looks like at day 90, in their terms.
3. "## Who is on your team" : a Markdown table of role -> who -> what they do (Client Success Manager, Talent Success Manager, the virtual assistant), then one sentence on the calls: a monthly call with the owner, a call with the talent (weekly on Essential and Specialist, biweekly on Starter), and an end of week report.
4. "## Days 1 to 30: Foundation", "## Days 31 to 60: Ownership", "## Days 61 to 90: Autonomy" : each opens with one sentence on the aim of the stretch, then a Markdown table with columns Workstream, What happens, Who, Done when. Concrete tasks drawn from the role brief and the audit, never filler.
5. "## How we measure it" : a Markdown table of measure -> how it is read -> reviewed when. No invented numbers; targets are agreed in week one.
6. "## What we need from you" : a "- [ ]" task list with the week each item is due (access, accounts, preferences, the first decisions).
7. "## After day 90" : two or three sentences. Onboarding ends, oversight does not: Relève keeps watching the work, with the same managers and the same monthly call, for as long as the relationship runs.
Rules: Markdown only. Draw every workstream from what you were told (role brief, audit, Signature, notes). Where something is missing, make a modest assumption and list it under "What we need from you" to confirm.
`.trim();

const PLAN_SYSTEM = `
You are the 90-Day Plan Studio inside the Relève console. A Relève team member is building one executive's 90-Day Success Plan after they have signed, paid their deposit and finished onboarding. The plan is first an internal draft; the team member edits it with you, then publishes it to the client.

HOW YOU WORK
1. First message of a conversation: read the context (the executive's role brief, Executive Signature, the business audit written before they signed, call notes). In one or two sentences say what the first 90 days must achieve. Then ask the 3 to 5 questions you still need, numbered, each specific to THIS executive: the first 30 days' priorities, which tools and accounts the assistant needs, what the assistant may decide alone versus approve first, how the executive likes to be reached, what would make day 90 a clear win. Skip anything the context already answers.
2. When the answers are in, or the team member says to draft it, write the complete plan in the same reply. Say in one line what you assumed.
3. After a draft exists, every message is a revision or new information. Apply it and return the complete updated document, changing nothing else.
4. Also write the short email that delivers the plan to the executive when you first write the plan, and whenever it is asked for. Three short paragraphs at most. The plan is attached as a PDF, so do not paste its contents.

${RELEVE_TERMS}

${VOICE}

THE PLAN FORMAT
${PLAN_FORMAT}

${PROTOCOL}
`.trim();

/* ---------- reading the business ---------- */

/* The lead's own website, read as plain text, so the audit starts from what
   the business says about itself. Public pages only: no private hosts, a short
   timeout, a small slice. Anything that goes wrong returns nothing. */
async function siteDigest(raw: string | null | undefined): Promise<string> {
  if (!raw) return '';
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return ''; }
  const h = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || h === 'localhost' || !h.includes('.') || h.includes(':')
    || /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.endsWith('.local') || h.endsWith('.internal')) return '';
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(u.toString(), { signal: ctl.signal, redirect: 'follow',
      headers: { 'user-agent': 'ReleveBot/1.0 (+https://relevestaffing.com)', accept: 'text/html' } });
    clearTimeout(t);
    if (!r.ok || !/text\/html/i.test(r.headers.get('content-type') ?? '')) return '';
    const html = (await r.text()).slice(0, 400_000);
    const pick = (re: RegExp) => (re.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      || pick(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const text = html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 5000);
    if (!text && !title) return '';
    return `WEBSITE (${u.hostname}), read just now:\nTitle: ${title}\nDescription: ${desc}\nPage text: ${text}`;
  } catch { return ''; }
}

const say = (label: string, v: unknown) => (v == null || String(v).trim() === '' ? '' : `${label}: ${String(v).trim()}`);

async function auditContext(sb: SupabaseClient, doc: any): Promise<string> {
  const { data: lead } = await sb.from('prospects')
    .select('full_name, email, org_name, website, source, note, stage, call_at').eq('id', doc.prospect_id).maybeSingle();
  const { data: touches } = await sb.from('prospect_touches')
    .select('at, kind, note').eq('prospect_id', doc.prospect_id).order('at', { ascending: false }).limit(15);
  const site = await siteDigest((lead as any)?.website);
  const l: any = lead ?? {};
  const history = ((touches ?? []) as any[]).filter(t => t.note)
    .map(t => `- ${String(t.at).slice(0, 10)} (${t.kind}): ${String(t.note).slice(0, 600)}`).join('\n');
  return [
    'CONTEXT ABOUT THE LEAD (read-only; the team member may know more)',
    say('Name', l.full_name), say('Company', l.org_name), say('Email', l.email), say('Website', l.website),
    say('How they found Relève', l.source), say('Pipeline stage', l.stage), say('Discovery call', l.call_at),
    say('Notes on the lead', l.note),
    history ? `Follow-up history:\n${history}` : '',
    site
  ].filter(Boolean).join('\n');
}

async function planContext(sb: SupabaseClient, doc: any): Promise<string> {
  const { data: prof } = await sb.from('profiles')
    .select('full_name, email, org_name, timezone').eq('id', doc.client_id).maybeSingle();
  const p: any = prof ?? {};
  const { data: search } = await sb.from('searches').select('*')
    .eq('client_id', doc.client_id).order('opened_at', { ascending: false }).limit(1).maybeSingle();
  const brief = Object.entries((search ?? {}) as Record<string, unknown>)
    .filter(([k, v]) => v != null && String(v).trim() !== '' && typeof v !== 'object'
      && !/(^id$|_id$|_at$|token|stripe|deposit|cents|status|^stage$)/i.test(k))
    .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${String(v).slice(0, 500)}`).join('\n').slice(0, 3500);
  const { data: sig } = await sb.from('signatures').select('scores').eq('user_id', doc.client_id).eq('side', 'client').maybeSingle();

  let lead: any = null;
  if (p.email) {
    const { data } = await sb.from('prospects').select('id, note, org_name, website')
      .eq('email', String(p.email).toLowerCase()).order('created_at', { ascending: false }).limit(1).maybeSingle();
    lead = data;
  }
  let audit: any = null;
  if (doc.audit_id) {
    const { data } = await sb.from('lead_audits').select('title, content').eq('id', doc.audit_id).maybeSingle();
    audit = data;
  } else if (lead?.id) {
    const { data } = await sb.from('lead_audits').select('title, content').eq('prospect_id', lead.id)
      .neq('content', '').order('created_at', { ascending: false }).limit(1).maybeSingle();
    audit = data;
  }
  return [
    'CONTEXT ABOUT THE EXECUTIVE (read-only; the team member may know more)',
    say('Name', p.full_name), say('Company', p.org_name || lead?.org_name), say('Time zone', p.timezone),
    say('Website', lead?.website), say('Notes from before they signed', lead?.note),
    brief ? `Role brief (what the assistant will own):\n${brief}` : 'Role brief: not filled in.',
    (sig as any)?.scores ? `Executive Signature scores (how they run their day):\n${JSON.stringify((sig as any).scores).slice(0, 900)}` : '',
    audit?.content ? `THE BUSINESS AUDIT WRITTEN BEFORE THEY SIGNED:\n${String(audit.content).slice(0, 9000)}` : 'No business audit on file.'
  ].filter(Boolean).join('\n');
}

/* ---------- the call ---------- */

async function ask(system: string, messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Add your Anthropic API key (ANTHROPIC_API_KEY) in Netlify to turn the studio on.');
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  let res: Response;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8 * 60 * 1000);
    res = await fetch(ENDPOINT, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 8192, system, messages })
    });
    clearTimeout(t);
  } catch { throw new Error('Could not reach the AI service. Please try again in a moment.'); }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message ?? ''; } catch { /* not json */ }
    if (res.status === 401) throw new Error('The Anthropic API key was not accepted. Check ANTHROPIC_API_KEY in Netlify.');
    if (res.status === 404) throw new Error(`The AI model "${model}" was not found. Set ANTHROPIC_MODEL in Netlify to a model your key can use.`);
    if (res.status === 429) throw new Error('The AI service is rate limited right now. Please try again in a minute.');
    throw new Error(detail ? `The AI service refused the request: ${detail}` : 'The AI service refused the request.');
  }
  let data: any;
  try { data = await res.json(); } catch { throw new Error('The AI service sent back something unreadable. Please try again.'); }
  const text: string = (data?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim();
  if (!text) throw new Error('The AI service sent back an empty reply. Please try again.');
  return text;
}

/* Split a reply into the chat text, the document and the email. */
export function parseReply(raw: string): { reply: string; document: string | null; email: EmailDraft | null } {
  let text = raw;
  let document: string | null = null;
  let email: EmailDraft | null = null;
  const d = /<document>([\s\S]*?)<\/document>/i.exec(text);
  if (d) {
    document = d[1].trim().replace(/^```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/, '').trim();
    text = text.replace(d[0], '');
  } else if (/<document>/i.test(text)) {
    throw new Error('The document came back cut off. Ask again, or ask for a shorter version.');
  }
  const e = /<email\s+subject="([^"]*)"\s*>([\s\S]*?)<\/email>/i.exec(text);
  if (e) { email = { subject: noEmDash(e[1].trim()), body: noEmDash(e[2].trim()) }; text = text.replace(e[0], ''); }
  return { reply: noEmDash(text.trim()), document: document ? noEmDash(document) : null, email };
}

/* One turn. The user's message (if any) is already in the row's chat; this
   writes Claude's reply after it and sets the row back to idle. */
export async function runTurn(sb: SupabaseClient, kind: StudioKind, id: string): Promise<void> {
  const table = TABLE[kind];
  const { data: doc } = await sb.from(table).select('*').eq('id', id).maybeSingle();
  if (!doc) return;
  try {
    const chat = ((doc as any).chat ?? []) as ChatMsg[];
    const ctx = kind === 'audit' ? await auditContext(sb, doc) : await planContext(sb, doc);
    const em = (doc as any).email as EmailDraft | null;
    const first = [
      ctx,
      `\nCURRENT DOCUMENT (the latest saved text; the team member may have edited it by hand):\n${String((doc as any).content ?? '').trim() || '(none yet)'}`,
      `\nCURRENT EMAIL DRAFT:\n${em?.body ? `Subject: ${em.subject}\n\n${em.body}` : '(none yet)'}`,
      chat.length ? '' : '\nThis is the start of the conversation. Begin the interview now.'
    ].join('\n');
    const messages = [
      { role: 'user' as const, content: first },
      ...chat.filter(m => m.text?.trim()).map(m => ({ role: m.role, content: m.text }))
    ];
    const raw = await ask(kind === 'audit' ? AUDIT_SYSTEM : PLAN_SYSTEM, messages);
    const { reply, document, email } = parseReply(raw);
    const patch: Record<string, unknown> = {
      chat: [...chat, { role: 'assistant', text: reply || (document ? 'Updated.' : 'Done.'), at: new Date().toISOString() }],
      state: 'idle', error: null
    };
    if (document) {
      patch.content = document;
      const h1 = /^#\s+(.+)$/m.exec(document)?.[1]?.trim();
      if (h1) patch.title = h1.slice(0, 160);
    }
    if (email) patch.email = email;
    const { error } = await sb.from(table).update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  } catch (e: any) {
    console.error(`[studio:${kind}] failed:`, e?.message ?? e);
    await sb.from(table).update({
      state: 'error', error: String(e?.message ?? 'That could not be written.').slice(0, 300)
    }).eq('id', id);
  }
}

/* ---------- is this executive ready for a 90-Day Plan? ---------- */

/* One definition, used by the executive's page and the scheduled job, so they
   can never disagree: the agreement is signed and filed, the deposit is paid
   or waived, and the three steps that match them with an assistant are done
   (the Executive Signature, the role brief and their interview hours). */
export type Readiness = {
  agreement: boolean; deposit: boolean; intake: boolean;
  steps: { signature: boolean; role: boolean; availability: boolean };
  ready: boolean;
};
export async function readinessFor(sb: SupabaseClient, clientId: string): Promise<Readiness> {
  const [ag, se, sig, av] = await Promise.all([
    sb.from('client_agreements').select('state').eq('client_id', clientId).maybeSingle(),
    sb.from('searches').select('role_title, deposit_status').eq('client_id', clientId)
      .order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('signatures').select('user_id').eq('user_id', clientId).eq('side', 'client').maybeSingle(),
    sb.from('availability').select('windows').eq('user_id', clientId).maybeSingle()
  ]);
  const agreement = (ag.data as any)?.state === 'verified';
  const ds = (se.data as any)?.deposit_status;
  const deposit = ds === 'paid' || ds === 'waived';
  const steps = {
    signature: Boolean(sig.data),
    role: String((se.data as any)?.role_title ?? '').trim().length > 0,
    availability: Array.isArray((av.data as any)?.windows) && (av.data as any).windows.length > 0
  };
  const intake = steps.signature && steps.role && steps.availability;
  return { agreement, deposit, intake, steps, ready: agreement && deposit && intake };
}
