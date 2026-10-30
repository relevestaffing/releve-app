/* Claude, wired into the console. The one place the app calls an AI model:
   it writes a tailored business audit for a lead from a few key points Nona
   fills in after a discovery call. Server-only. The key is Nona's, set in
   Netlify (ANTHROPIC_API_KEY); nothing runs until it is there, exactly like
   the payout providers. */

import type { AuditInputs } from './audits-public';
import { planLabel } from './audits-public';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

export function aiReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/* The current commercial terms, stated for the model so the numbers in the
   audit are right. Mirror the Book; update here when the plans change. */
const RELEVE_TERMS = `
Relève is a premium virtual executive staffing agency. It places a vetted, fully managed virtual professional and manages them for the life of the relationship. The positioning is trust and relief ("Consider it handled."), never cost or offshore savings.

Plans (US dollars, billed first Monday of the month, due on receipt):
- Starter: $950 a month, or $2,500 if paid in full for a three-month term. 3-month minimum. The VA's hours are capped at 15 a week. Part-time, dedicated.
- Essential: $2,500 a month. 6-month minimum. A dedicated full-time VA, unlimited hours and unlimited tasks.
- Specialist: $4,500 a month. 6-month minimum. A dedicated full-time specialized expert.
- eLIVate Club members get $500 off each of the FIRST THREE months on Essential and Specialist (so Essential is $2,000 for months 1 to 3, then $2,500; Specialist is $4,000 then $4,500). Starter has no eLIVate discount.
- A $500 deposit starts a search and is credited to the first invoice.
- Guarantee: a qualified candidate within 14 days of the search opening, plus up to two replacements if a hire does not work out.
- Talent at about 30% of the cost of a comparable local hire (i.e. ~70% cheaper). Only ever phrase it this way, never the reverse.
- Every placement comes with a Client Success Manager and a Talent Success Manager and a 90-Day Success Plan; oversight continues for the whole relationship, not just 90 days.
`.trim();

const AUDIT_FORMAT = `
Write the audit as a tailored proposal for THIS specific business owner, in the same shape as Relève's best audits:

1. "# Business VA Audit: {Company}" as the only H1.
2. "## Executive summary" — one short paragraph, then a tight bullet list (their situation now, the recommended plan and its monthly price, the core output, the day-90 step-up if the path includes one).
3. "## Where they are now" — a sentence naming them and their business, then bullets of the gaps in what they have today.
4. "## Where they could be" — a sentence of the vision, then a Markdown table of channel -> weekly output.
5. A "## Phase 1: {plan} (${'{price}/month}'})" section for the recommended starting plan: a short intro, a Markdown table of what is delivered (or specialists and hours if Starter), what the owner provides, and what is not covered at this tier.
6. "## The 90-day game plan" — a numbered list, Month 1 / Month 2 / Month 3, concrete.
7. If the path steps up, a "## Phase 2: {next plan}" section with a table of the expanded scope and the commitment, applying the eLIVate discount if they are a member.
8. "## Investment and value" — a short line, then a Markdown comparison table (Today vs each Relève phase across monthly cost, hours, output, LinkedIn, scripting, commitment). Apply the eLIVate discount in the numbers if they are a member, and note any paid-in-full saving.
9. "## Open items and next steps" — a Markdown task list ("- [ ] ...") of what to confirm with them.

Rules:
- Output GitHub-flavored Markdown ONLY. Use ##, bullets, numbered lists, and tables. NO raw HTML, no code fences around the whole thing.
- Be concrete and specific to what you were told. Where a key point is missing, make a sensible, modest assumption and add it to the open items to confirm, rather than inventing hard numbers you were not given.
- Do not promise specific results or follower/lead numbers before the work starts; say targets are set with them in week 1.
- No em dashes anywhere. Use commas, periods or colons. Keep the tone high-end and direct, not salesy.
- Only use the plans and prices in the terms above. Keep every figure consistent across the summary, the phase sections and the investment table.
`.trim();

function userBrief(ctx: { name: string; company: string; inputs: AuditInputs }): string {
  const i = ctx.inputs;
  const lines = [
    `Business owner: ${ctx.name}`,
    `Company: ${ctx.company || '(not given)'}`,
    i.website ? `Website: ${i.website}` : '',
    `Recommended Relève path: ${planLabel(i.plan)}`,
    i.elivate ? `They ARE an eLIVate Club member (apply the discount).` : `They are not an eLIVate Club member.`,
    i.today ? `What they have today: ${i.today}` : '',
    i.offer ? `What they sell and their ideal client: ${i.offer}` : '',
    i.goals ? `What they want more of: ${i.goals}` : '',
    i.notes ? `Other notes from the discovery call: ${i.notes}` : ''
  ].filter(Boolean);
  return `Write the business audit for this lead.\n\n${lines.join('\n')}`;
}

export type AuditDraft = { title: string; content: string };

/* Draft one audit. Throws with a readable message on any failure so the
   console can show Nona exactly what went wrong (a missing key, a bad model,
   a rate limit), rather than a silent empty page. */
export async function auditDraft(ctx: { name: string; company: string; inputs: AuditInputs }): Promise<AuditDraft> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Add your Anthropic API key (ANTHROPIC_API_KEY) in Netlify to turn on audits.');
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: `You write Relève's business audits.\n\n${RELEVE_TERMS}\n\n${AUDIT_FORMAT}`,
        messages: [{ role: 'user', content: userBrief(ctx) }]
      })
    });
  } catch {
    throw new Error('Could not reach the AI service. Please try again in a moment.');
  }

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
  const content: string = (data?.content ?? [])
    .filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim();
  if (!content) throw new Error('The AI service sent back an empty audit. Please try again.');

  const company = ctx.company || ctx.name;
  const title = `Business VA Audit: ${company}`;
  return { title, content };
}

/* What is this email to hello@? Used by the inbox import so only real
   prospects reach the CRM and job seekers reach Applications (Nona, 29
   October 2026). Returns null when the AI is off or unreachable, so the
   caller falls back to its keyword rule. Haiku-class, one short call per
   unknown sender, at most hourly. */
export type InboxKind = 'client' | 'applicant' | 'other';
export async function classifyInboxEmailAI(m: { from: string; subject: string; snippet: string; hasResume: boolean }): Promise<InboxKind | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_CLASSIFY_MODEL || 'claude-haiku-4-5',
        max_tokens: 5,
        system: 'Relève places fully managed virtual executive staff (assistants, VAs, specialists) from the Philippines and Latin America with founders and business owners. You read one email sent to hello@relevestaffing.com and answer with exactly one word. CLIENT: a business owner or company asking Relève for that service, wanting to hire or be matched with an assistant or virtual staff, asking about pricing, plans or how it works for their business, or asking to book or reschedule a discovery call. APPLICANT: a person looking for work through Relève, applying for a role, sending a resume or CV, or offering themselves as an assistant or VA. OTHER: everything else, including vendors, agencies or anyone selling something, partnership or sponsorship pitches, newsletters, notifications, receipts, invoices, existing team, and anything unclear.',
        messages: [{ role: 'user', content: `From: ${m.from}\nSubject: ${m.subject}\nResume attached: ${m.hasResume ? 'yes' : 'no'}\n\n${m.snippet}` }]
      })
    });
    if (!res.ok) return null;
    const j = await res.json();
    const t = String(j?.content?.[0]?.text ?? '').trim().toUpperCase();
    return t.startsWith('CLIENT') ? 'client' : t.startsWith('APPLICANT') ? 'applicant' : t.startsWith('OTHER') ? 'other' : null;
  } catch { return null; }
}
