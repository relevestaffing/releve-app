/* Relève's assistant.
   ------------------
   One model, three seats. A client or a talent asks about Relève and about
   their own account and gets an answer grounded in the curated knowledge
   (knowledge.ts) plus a short, read-only summary of their account built
   here on the server. The founder gets the same, plus lookups across the
   console and the Book, and can ask for fixes: the model proposes, the
   founder confirms with one click, the server executes and logs it
   (actions.ts). Nothing in this file writes to the database except the
   message log, which is best-effort.

   Rules the prompt holds the model to, and the code holds it to as well:
   - a talent never sees client pricing; a client never sees talent pay
     (the knowledge layers only include what the seat may know)
   - the account summary is the asker's own, never anyone else's
   - unsure means hand off to the named Success Manager, not guess
   - no em dashes, short answers, Relève's voice */

import type { Profile } from '@/lib/supabase/server';
import { configured } from '@/lib/supabase/server';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { setupFor } from '@/lib/setup';
import { executiveStage } from '@/lib/stage';
import { listPlacementsFor } from '@/lib/work';
import { listInterviews } from '@/lib/store';
import { listInvoicesFor, money, isOwner } from '@/lib/money';
import { fmtWhen } from '@/lib/words';
import { SHARED, CLIENT, TALENT, FOUNDER } from './knowledge';
import { BOOK_SECTIONS } from './book';
import { ACTION_CATALOG, type Proposal } from './actions';

export type Msg = { role: 'user' | 'assistant'; content: string };
export type ChatResult = { reply: string; proposals: Proposal[] };

/* Sonnet by default: the answer has to land inside Netlify's 26-second
   request window, lookups included. ANTHROPIC_AI_MODEL overrides. */
const MODEL = () => process.env.ANTHROPIC_AI_MODEL || 'claude-sonnet-5-5';
const BUDGET_MS = 23000;
const nodash = (s: string) => s.replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',');

/* ---------- the asker's own account, in a few lines ---------- */

async function accountSummary(p: Profile): Promise<string> {
  const lines: string[] = [`Name: ${p.full_name ?? 'not set'}. Role: ${p.role === 'client' ? 'executive (client)' : p.role}.`];
  if (!configured()) return lines.join('\n');
  try {
    if (p.role === 'client' || p.role === 'talent') {
      const steps = await setupFor(p).catch(() => []);
      if (steps.length) lines.push('Setup checklist: ' + steps.map(s => `${s.title} (${s.done ? 'done' : 'to do'})`).join('; ') + '.');
    }
    if (p.role === 'client') {
      const st = await executiveStage(p.id);
      lines.push(`Search open: ${st.hiring ? 'yes' : 'no'}. People placed with them: ${st.placements}.`);
      const inv = await listInvoicesFor(p.id).catch(() => []);
      const open = inv.filter(i => ['sent', 'failed', 'processing'].includes(i.status));
      if (open.length) lines.push('Open invoices: ' + open.map(i => `${i.number ?? 'invoice'} ${money(i.amount_cents)} ${i.status}${i.due_on ? `, due ${i.due_on}` : ''}`).join('; ') + '.');
      else lines.push('Open invoices: none.');
    }
    const pl = await listPlacementsFor(p.id).catch(() => []);
    const live = pl.filter((x: any) => !x.ended_on);
    if (live.length) lines.push('Placements: ' + live.map((x: any) => p.role === 'client'
      ? `${x.talent?.full_name ?? 'talent'} since ${x.started_on}`
      : `with ${x.client?.full_name ?? 'an executive'}${x.client?.org_name ? ` (${x.client.org_name})` : ''} since ${x.started_on}`).join('; ') + '.');
    const iv = await listInterviews(p.role === 'client' ? { clientId: p.id } : { talentId: p.id }).catch(() => []);
    const soon = iv.filter(i => String(i.status) !== 'Cancelled' && String(i.status) !== 'cancelled' && new Date(i.starts_at).getTime() > Date.now() - 3600000).slice(0, 3);
    if (soon.length) lines.push('Interviews: ' + soon.map(i => `${fmtWhen(i.starts_at)} with ${p.role === 'client' ? i.talent_name : i.client_name} (${i.status})`).join('; ') + '.');
  } catch { /* a summary is a convenience; the answer still stands without it */ }
  return lines.join('\n');
}

/* ---------- founder lookups (read-only) ---------- */

const LOOKUPS: Record<string, { description: string; input: any; run: (a: any) => Promise<string> }> = {
  find_person: {
    description: 'Find an account by name or email. Returns id, role, stage and contact.',
    input: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async ({ query }) => {
      const q = String(query ?? '').trim();
      if (q.length < 2) return 'Give at least two characters.';
      const sb = adminClient();
      const { data } = await sb.from('profiles').select('id, full_name, email, role, org_name, stage, headline, archived_at')
        .or(`full_name.ilike.%${q.replace(/[%,]/g, '')}%,email.ilike.%${q.replace(/[%,]/g, '')}%`).limit(8);
      if (!data?.length) return 'Nobody matches.';
      return data.map((r: any) => `${r.full_name ?? '(no name)'} <${r.email}> role=${r.role} id=${r.id}${r.org_name ? ` org=${r.org_name}` : ''}${r.stage ? ` stage=${r.stage}` : ''}${r.archived_at ? ' ARCHIVED' : ''}`).join('\n');
    }
  },
  week_posts: {
    description: 'The content desk: every post for a week (default this week). Monday date YYYY-MM-DD.',
    input: { type: 'object', properties: { week: { type: 'string' } } },
    run: async ({ week }) => {
      const { listWeek, weekStart } = await import('@/lib/content');
      const monday = /^\d{4}-\d{2}-\d{2}$/.test(String(week)) ? String(week) : weekStart(new Date(), 0);
      const rows = await listWeek(monday);
      if (!rows.length) return `No posts drafted for the week of ${monday}.`;
      return `Week of ${monday}:\n` + rows.map(r => `id=${r.id} slot=${r.slot} channel=${r.channel} status=${r.status}${r.hold_reason ? ` (${r.hold_reason})` : ''} at=${r.publish_at}${r.image_path ? ' photo=yes' : ''} hook=${(r.hook ?? r.caption ?? '').slice(0, 70).replace(/\n/g, ' ')}`).join('\n');
    }
  },
  campaigns: {
    description: 'The Relève Letter: upcoming and recent campaigns with id, status, send time and subject.',
    input: { type: 'object', properties: {} },
    run: async () => {
      const { listCampaigns } = await import('@/lib/campaigns');
      const rows = await listCampaigns();
      return rows.slice(0, 12).map(c => `id=${c.id} status=${c.status} send_at=${c.send_at} subject=${c.subject}${c.hold_reason ? ` (${c.hold_reason})` : ''}`).join('\n') || 'No campaigns.';
    }
  },
  open_invoices: {
    description: 'Invoices not yet paid: number, client, amount, status, due date.',
    input: { type: 'object', properties: {} },
    run: async () => {
      const sb = adminClient();
      const { data } = await sb.from('invoices').select('id, number, amount_cents, status, due_on, issued_on, client:client_id(full_name)')
        .in('status', ['draft', 'sent', 'failed', 'processing']).order('issued_on', { ascending: false }).limit(25);
      return (data ?? []).map((i: any) => `${i.number ?? 'draft'} ${money(i.amount_cents)} ${i.status} ${i.client?.full_name ?? ''}${i.due_on ? ` due ${i.due_on}` : ''} id=${i.id}`).join('\n') || 'Nothing open.';
    }
  },
  interviews_upcoming: {
    description: 'Interviews in the next 14 days.',
    input: { type: 'object', properties: {} },
    run: async () => {
      const rows = await listInterviews();
      const soon = rows.filter(i => String(i.status) !== 'Cancelled' && String(i.status) !== 'cancelled' && new Date(i.starts_at).getTime() > Date.now() - 3600000 && new Date(i.starts_at).getTime() < Date.now() + 14 * 86400000);
      return soon.map(i => `${fmtWhen(i.starts_at)} ${i.client_name} with ${i.talent_name} (${i.status}) id=${i.id}`).join('\n') || 'None in the next two weeks.';
    }
  },
  queues: {
    description: 'What is waiting on the team: identity documents to verify, Watches to score, new applications, held posts, held campaigns.',
    input: { type: 'object', properties: {} },
    run: async () => {
      const sb = adminClient();
      const [v, w, a, h, c] = await Promise.all([
        sb.from('vetting').select('talent_id', { count: 'exact', head: true }).eq('state', 'submitted'),
        sb.from('taking_the_watch_attempts').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        sb.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        sb.from('content_posts').select('id', { count: 'exact', head: true }).eq('status', 'held'),
        sb.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'held')
      ]);
      return `Identity documents to verify: ${v.count ?? 0}\nWatches to score: ${w.count ?? 0}\nNew applications: ${a.count ?? 0}\nHeld posts: ${h.count ?? 0}\nHeld Letters: ${c.count ?? 0}`;
    }
  },
  account_summary: {
    description: 'A client or talent account as they see it: checklist, stage, placements, interviews, open invoices. Needs the profile id from find_person.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async ({ id }) => {
      const sb = adminClient();
      const { data } = await sb.from('profiles').select('id, email, full_name, role, org_name, headline').eq('id', String(id)).maybeSingle();
      if (!data) return 'No such account.';
      return accountSummary(data as any);
    }
  },
  book: {
    description: 'Search the Relève Book (parts 01 to 16: foundation, terms, brand, voice, website, platform, console, standing rules, open items, systems, commands). Returns the best matching sections.',
    input: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async ({ query }) => bookLookup(String(query ?? ''))
  }
};

function bookLookup(query: string, cap = 24000) {
  const words = query.toLowerCase().split(/[^a-z0-9à-ü]+/).filter(w => w.length > 2);
  if (!words.length) return BOOK_SECTIONS.map(s => s.name).join('\n');
  const scored = BOOK_SECTIONS.map(s => {
    const t = (s.name + ' ' + s.text).toLowerCase();
    const score = words.reduce((n, w) => n + (t.split(w).length - 1), 0) / Math.sqrt(s.text.length + 1);
    return { s, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  let out = '', used = 0;
  for (const { s } of scored) {
    const piece = `## ${s.name}\n${s.text}\n\n`;
    if (used + piece.length > cap) { if (!used) out += piece.slice(0, cap); break; }
    out += piece; used += piece.length;
  }
  return out || 'Nothing in the Book matches that.';
}

/* ---------- the prompt ---------- */

function systemFor(p: Profile, founder: boolean, account: string) {
  const seat = p.role === 'client' ? 'an executive (a client)' : p.role === 'talent' ? 'a talent (a candidate or a placed professional)' : founder ? 'the founder, Sage Jackson, working in her console' : 'a member of the Relève team in the console';
  const knowledge = p.role === 'client' ? SHARED + CLIENT : p.role === 'talent' ? SHARED + TALENT : SHARED + CLIENT + TALENT + FOUNDER;
  const rules = `You are Relève's assistant inside the Relève app. You are talking with ${seat}.

How you speak: Relève's voice. Calm, warm, specific, short. Plain sentences, no bullet points unless listing steps, no exclamation marks, no emojis, never an em dash or en dash (use a comma, a colon or a full stop). Say "handled" and "supported", never "managed". Call people by role: "your Client Success Manager", "your Talent Success Manager". Never call a person "a talent" to their face.

What you answer: anything about Relève, how it works, the app, the process, the person's own account (summarised below), and what to do next. For anything outside Relève, say in one line that you only cover Relève and offer the nearest Relève thing you can help with.

What you never do: invent facts, figures, dates or names that are not in your knowledge or the account summary; discuss other people's accounts; give legal or tax advice beyond what the knowledge states; promise outcomes (a start date, a candidate, a refund) that a person at Relève decides. ${p.role === 'talent' ? 'Never discuss what clients pay Relève, plan prices or retainers: that is not shown to talent. If asked, say pricing is between Relève and the executive, and offer to help with their own pay page instead.' : ''}${p.role === 'client' ? 'Never discuss what talent are paid: say Relève pays its professionals directly and well, and the fee is the flat retainer.' : ''}

When you do not know, or the question is about a specific decision on their account (a refund, a date, a change of plan, a dispute, a replacement), say so plainly and hand off: "Your ${p.role === 'talent' ? 'Talent' : 'Client'} Success Manager will pick this up; the Messages page is the fastest way to reach them." Do not pretend to have sent anything.

Formatting: plain text. Short paragraphs. If you list steps, number them. Keep answers under 160 words unless the person asks for detail.`;

  const founderRules = founder ? `

You are talking with the founder. You may use the lookup tools freely to answer from live data; call them before answering questions about people, posts, the Letter, invoices, interviews or queues, and cite what you found. When she asks you to change or fix something, do not do it yourself: call propose_action with the exact kind and parameters, and a one-line summary in plain words. She will see a card and confirm with one click; the server then executes and logs it. If what she wants is not in the catalog, say which console page does it, in one line. Propose at most three actions per reply. Available action kinds:\n${ACTION_CATALOG.map(a => `- ${a.kind}: ${a.describe} Params: ${a.params}`).join('\n')}` : p.role === 'admin' ? `

You are talking with a team member, not the founder. You may use the lookup tools. You cannot propose actions; point to the console page instead.` : '';

  return [
    { type: 'text', text: rules + founderRules },
    { type: 'text', text: `# Knowledge\n${knowledge}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `# This person's account\n${account}\n\nToday: ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.` }
  ];
}

/* ---------- the call ---------- */

export async function chat(p: Profile, history: Msg[]): Promise<ChatResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('The assistant is not switched on yet. Add ANTHROPIC_API_KEY in Netlify.');
  const founder = p.role === 'admin' && await isOwner();
  const account = p.role === 'admin' ? `Signed in as ${p.full_name ?? p.email}, ${founder ? 'founder' : 'team'}.` : await accountSummary(p);
  const system = systemFor(p, founder, account);

  const tools: any[] = [];
  if (p.role === 'admin') {
    for (const [name, t] of Object.entries(LOOKUPS)) tools.push({ name, description: t.description, input_schema: t.input });
    if (founder) tools.push({
      name: 'propose_action',
      description: 'Propose one change for the founder to confirm. Never executes on its own.',
      input_schema: { type: 'object', properties: {
        kind: { type: 'string', enum: ACTION_CATALOG.map(a => a.kind) },
        params: { type: 'object' },
        summary: { type: 'string', description: 'One plain sentence of what will happen, naming the thing (post, email, person) in words, not ids.' }
      }, required: ['kind', 'params', 'summary'] }
    });
  }

  const trimmed = history.slice(-14).map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  const messages: any[] = trimmed.length ? trimmed : [{ role: 'user', content: 'Hello' }];
  const proposals: Proposal[] = [];
  let reply = '';
  const started = Date.now();

  for (let round = 0; round < 5; round++) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 4000) { reply = reply || 'That took longer than the page allows. Ask again in a narrower way.'; break; }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), left);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 900, system, messages, ...(tools.length ? { tools } : {}) }),
      signal: ctl.signal
    }).catch(() => null).finally(() => clearTimeout(timer));
    if (!res) throw new Error('The assistant did not answer in time. Try again.');
    const data: any = await res.json().catch(() => null);
    if (!res.ok || !data) throw new Error(data?.error?.message ? `The assistant could not answer: ${String(data.error.message).slice(0, 140)}` : 'The assistant could not answer.');

    const blocks: any[] = data.content ?? [];
    const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const uses = blocks.filter(b => b.type === 'tool_use');
    if (text) reply = text;
    if (!uses.length || data.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: blocks });
    const results: any[] = [];
    for (const u of uses) {
      let out = '';
      try {
        if (u.name === 'propose_action') {
          const cat = ACTION_CATALOG.find(a => a.kind === u.input?.kind);
          if (!cat) out = 'Unknown action kind.';
          else if (proposals.length >= 3) out = 'Three proposals already; stop here.';
          else { proposals.push({ kind: cat.kind, params: u.input.params ?? {}, summary: nodash(String(u.input.summary ?? cat.describe)).slice(0, 240) }); out = 'Proposed. The founder sees a confirmation card.'; }
        } else if (LOOKUPS[u.name]) out = await LOOKUPS[u.name].run(u.input ?? {});
        else out = 'No such tool.';
      } catch (e: any) { out = `Lookup failed: ${String(e?.message ?? e).slice(0, 200)}`; }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: String(out).slice(0, 20000) });
    }
    messages.push({ role: 'user', content: results });
  }

  reply = nodash(reply || (proposals.length ? 'Here is what I would do. Confirm what you want.' : 'I could not put an answer together. Your Success Manager can help from Messages.'));
  logMessage(p, history[history.length - 1]?.content ?? '', reply, proposals.length).catch(() => {});
  return { reply, proposals };
}

/* Best-effort log: what people ask is the clearest view of what the product
   leaves unclear. Needs supabase/part57-ai.sql; silent when it is not there. */
async function logMessage(p: Profile, question: string, answer: string, proposed: number) {
  if (!hasServiceKey()) return;
  await adminClient().from('ai_messages').insert({ user_id: p.id, role: p.role, question: String(question).slice(0, 4000), answer: answer.slice(0, 8000), proposed });
}
