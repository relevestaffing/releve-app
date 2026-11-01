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
import { listPlacementsFor, listTasks } from '@/lib/work';
import { TASK_STATUSES } from '@/lib/experience-public';
import { listInterviews } from '@/lib/store';
import { listInvoicesFor, money, isOwner } from '@/lib/money';
import { fmtWhen } from '@/lib/words';
import { SHARED, CLIENT, TALENT, FOUNDER } from './knowledge';
import { BOOK_SECTIONS } from './book';
import { ACTION_CATALOG, type Proposal } from './actions';

export type Msg = { role: 'user' | 'assistant'; content: string };
export type ChatResult = { reply: string; proposals: Proposal[] };
export type ChatEvent =
  | { t: 'text'; d: string }
  | { t: 'status'; d: string }
  | { t: 'done'; reply: string; proposals: Proposal[] };
export type Greeting = { text: string; chips: string[] };

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
    const live = await listPlacementsFor(p.id).catch(() => []);   // live placements only
    if (live.length) lines.push('Placements: ' + live.map((x: any) => p.role === 'client'
      ? `${x.talent_name ?? 'talent'} since ${x.started_on}`
      : `with ${x.client_name ?? 'an executive'}${x.org_name ? ` (${x.org_name})` : ''} since ${x.started_on}`).join('; ') + '.');
    /* The task list on each live placement: what a placed person asks about most. */
    for (const x of live.slice(0, 2) as any[]) {
      const tasks = await listTasks(x.id).catch(() => []);
      const open = tasks.filter(t => !t.done).slice(0, 10);
      const who = p.role === 'client' ? (x.talent_name ?? 'your assistant') : (x.client_name ?? 'your executive');
      const label = (st: string) => (TASK_STATUSES as any[]).find(o => o.key === st)?.[p.role === 'client' ? 'client' : 'talent'] ?? st;
      lines.push(open.length
        ? `Open tasks with ${who} (${open.length}): ` + open.map(t => `"${t.title}" (${label(String((t as any).status ?? 'todo'))}${t.due_on ? `, due ${t.due_on}` : ''}${t.priority === 'high' ? ', high priority' : ''})`).join('; ') + `. Finished: ${tasks.length - tasks.filter(t => !t.done).length}. The task page is /app/tasks.`
        : `Open tasks with ${who}: none. Finished: ${tasks.length}. The task page is /app/tasks.`);
    }
    const iv = await listInterviews(p.role === 'client' ? { clientId: p.id } : { talentId: p.id }).catch(() => []);
    const soon = iv.filter(i => String(i.status) !== 'Cancelled' && String(i.status) !== 'cancelled' && new Date(i.starts_at).getTime() > Date.now() - 3600000).slice(0, 3);
    if (soon.length) lines.push('Interviews: ' + soon.map(i => `${fmtWhen(i.starts_at, 'America/Los_Angeles')} with ${p.role === 'client' ? i.talent_name : i.client_name} (${i.status})`).join('; ') + '.');
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
      return soon.map(i => `${fmtWhen(i.starts_at, 'America/Los_Angeles')} ${i.client_name} with ${i.talent_name} (${i.status}) id=${i.id}`).join('\n') || 'None in the next two weeks.';
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
        sb.from('job_applications').select('id', { count: 'exact', head: true }).eq('state', 'new'),
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

How you carry a conversation: like Relève's best client success person on a chat window, not a search box. Answer the question first, in the first sentence. When a request could mean two things, ask one short question instead of guessing. Before proposing a change, say in one line what you understood. End with the natural next step when there is one: a question, or a link to the page that does it. Use the person's first name now and then, not in every message. Never open with "Great question" or any filler; never apologise more than once. If they thank you, one warm line back, no recap.

Links: when a page in the app would help, give it as a markdown link with a short label, for example [Open your tasks](/app/tasks) or [See the placement](/console/placements/ID). Only link paths that exist in the knowledge or account summary.

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

/* One turn, streamed. The model's words go to `emit` as they arrive, so the
   person sees Relève typing instead of a spinner; a lookup in the middle is
   announced with a status line. `chat` below is the same turn collected. */
export async function chatStream(p: Profile, history: Msg[], emit: (e: ChatEvent) => void): Promise<ChatResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('The assistant is not switched on yet. Add ANTHROPIC_API_KEY in Netlify.');
  const started = Date.now();
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

  let trimmed = history.slice(-14).map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  while (trimmed.length && trimmed[0].role !== 'user') trimmed = trimmed.slice(1);   // the API needs a user turn first
  const messages: any[] = trimmed.length ? trimmed : [{ role: 'user', content: 'Hello' }];
  const proposals: Proposal[] = [];
  const parts: string[] = [];

  for (let round = 0; round < 5; round++) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 4000) { if (!parts.length) { const t = 'That took longer than the page allows. Ask again in a narrower way.'; parts.push(t); emit({ t: 'text', d: t }); } break; }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), left);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 1200, system, messages, stream: true, ...(tools.length ? { tools } : {}) }),
      signal: ctl.signal
    }).catch(() => null);
    if (!res) { clearTimeout(timer); throw new Error('The assistant did not answer in time. Try again.'); }
    if (!res.ok || !res.body) {
      clearTimeout(timer);
      const data: any = await res.json().catch(() => null);
      throw new Error(data?.error?.message ? `The assistant could not answer: ${String(data.error.message).slice(0, 140)}` : 'The assistant could not answer.');
    }

    /* Read the event stream, rebuilding the content blocks as they close. */
    const blocks: any[] = [];
    let stop = '';
    let roundText = '';
    const open: Record<number, { type: string; text: string; json: string; id?: string; name?: string }> = {};
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          let ev: any; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
          if (ev.type === 'content_block_start') {
            const b = ev.content_block ?? {};
            open[ev.index] = { type: b.type, text: '', json: '', id: b.id, name: b.name };
            if (b.type === 'tool_use') emit({ t: 'status', d: b.name === 'propose_action' ? 'Writing up a proposal' : 'Looking that up' });
          } else if (ev.type === 'content_block_delta') {
            const o = open[ev.index]; if (!o) continue;
            if (ev.delta?.type === 'text_delta') {
              const d = nodash(String(ev.delta.text ?? ''));
              o.text += d; roundText += d;
              if (d) emit({ t: 'text', d });
            } else if (ev.delta?.type === 'input_json_delta') o.json += String(ev.delta.partial_json ?? '');
          } else if (ev.type === 'content_block_stop') {
            const o = open[ev.index]; if (!o) continue;
            if (o.type === 'text') blocks.push({ type: 'text', text: o.text });
            else if (o.type === 'tool_use') { let input: any = {}; try { input = o.json ? JSON.parse(o.json) : {}; } catch {} blocks.push({ type: 'tool_use', id: o.id, name: o.name, input }); }
            delete open[ev.index];
          } else if (ev.type === 'message_delta') {
            if (ev.delta?.stop_reason) stop = ev.delta.stop_reason;
          } else if (ev.type === 'error') {
            throw new Error(String(ev.error?.message ?? 'The assistant stopped.').slice(0, 140));
          }
        }
      }
    } finally { clearTimeout(timer); }

    if (roundText.trim()) parts.push(roundText.trim());
    const uses = blocks.filter(b => b.type === 'tool_use');
    if (!uses.length || stop !== 'tool_use') break;

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
    if (round < 4 && roundText.trim()) emit({ t: 'text', d: '\n\n' });
  }

  let reply = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!reply) { reply = proposals.length ? 'Here is what I would do. Confirm what you want.' : 'I could not put an answer together. Your Success Manager can help from Messages.'; emit({ t: 'text', d: reply }); }
  logMessage(p, history[history.length - 1]?.content ?? '', reply, proposals.length).catch(() => {});
  return { reply, proposals };
}

export async function chat(p: Profile, history: Msg[]): Promise<ChatResult> {
  return chatStream(p, history, () => {});
}

/* ---------- the opening line ---------- */

/* What a good person on the desk says when the window opens: the person's
   name, the hour, and the one thing on their account worth mentioning. Built
   from the account, not the model, so it is on screen before anything else. */
export async function greet(p: Profile): Promise<Greeting> {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Los_Angeles' }).format(new Date()));
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const founder = p.role === 'admin' && await isOwner().catch(() => false);
  const shown = p.role === 'admin' && (!p.full_name || p.full_name.includes('@')) ? 'Sage' : (p.full_name ?? '');
  const first = shown.trim().split(/\s+/)[0] || '';
  const name = first ? `${hello}, ${first}.` : `${hello}.`;

  try {
    if (p.role === 'admin') {
      if (!founder) return { text: `${name} Ask me anything across the console and I will look it up.`, chips: ['What is waiting on the team today?', 'Which interviews are coming up?', 'What does the Book say about releases?'] };
      const { consoleSnapshot } = await import('@/lib/console');
      const snap = await consoleSnapshot().catch(() => null);
      const att = snap?.attention ?? [];
      if (att.length) {
        const top = att.slice(0, 2).map(a => `${a.count > 0 ? `${a.count} ` : ''}${a.what.replace(/\.$/, '')}`).join(', and ');
        return { text: `${name} ${att.length === 1 ? 'One thing needs you' : `${att.length} things need you`} today: ${top}. Where would you like to start?`,
          chips: ['Walk me through what is waiting', 'Show me this week’s posts', 'Which invoices are open?', 'Hold next Tuesday’s Letter'] };
      }
      return { text: `${name} Nothing is waiting on you right now. What would you like to look at?`, chips: ['Show me this week’s posts', 'Which invoices are open?', 'Who is coming up for interview?', 'Hold next Tuesday’s Letter'] };
    }

    if (p.role === 'client') {
      const [st, steps, live] = await Promise.all([executiveStage(p.id), setupFor(p).catch(() => []), listPlacementsFor(p.id).catch(() => [])]);
      const inv = await listInvoicesFor(p.id).catch(() => []);
      const openInv = inv.filter(i => ['sent', 'failed'].includes(i.status));
      if (live.length) {
        const who = (live[0] as any).talent_name ?? 'your assistant';
        return { text: `${name} ${who} is working with you${openInv.length ? `, and you have ${openInv.length === 1 ? 'an invoice' : `${openInv.length} invoices`} open` : ''}. How can I help today?`,
          chips: ['What is on the task list?', 'When is the next invoice?', 'How do I give feedback?', 'What does the guarantee cover?'] };
      }
      if (st.hiring) return { text: `${name} Your search is under way and your Client Success Manager is on it. I can answer anything about how the matching works while you wait.`, chips: ['How does the matching work?', 'What happens after I approve a candidate?', 'When is my first invoice?', 'What does the guarantee cover?'] };
      const next = steps.find(s => !s.done);
      if (next) return { text: `${name} The next step on your account is ${next.title.toLowerCase()}. Want me to walk you through it, or is there something else on your mind?`, chips: [`Walk me through ${next.title.toLowerCase()}`, 'How does the matching work?', 'When is my first invoice?', 'What does the guarantee cover?'] };
      return { text: `${name} Your setup is complete. What can I help with?`, chips: ['How does the matching work?', 'What happens after I approve a candidate?', 'When is my first invoice?', 'What does the guarantee cover?'] };
    }

    const [steps, live] = await Promise.all([setupFor(p).catch(() => []), listPlacementsFor(p.id).catch(() => [])]);
    if (live.length) {
      const who = (live[0] as any).client_name ?? 'your executive';
      return { text: `${name} You are placed with ${who}. Ask me about the day to day, your pay, or anything Relève expects of you.`, chips: ['What is on my task list?', 'How am I paid?', 'How do I file the end of week report?', 'What if I need time off?'] };
    }
    const left = steps.filter(s => !s.done);
    if (left.length) return { text: `${name} ${left.length === 1 ? 'One step' : `${left.length} steps`} left on your checklist, starting with ${left[0].title.toLowerCase()}. Want me to explain it?`, chips: [`Explain ${left[0].title.toLowerCase()}`, 'How is The Watch scored?', 'How am I paid?', 'What happens once I am placed?'] };
    return { text: `${name} Your checklist is complete and Relève is matching you. What would you like to know?`, chips: ['What happens once I am placed?', 'How am I paid?', 'How long does matching take?', 'How do interviews work?'] };
  } catch {
    return { text: `${name} What can I help with?`, chips: [] };
  }
}

/* The last few exchanges, for the window to open on. Each row is one
   question and one answer; proposals from the same minute ride along. */
export async function recentThread(p: Profile): Promise<{ role: 'user' | 'assistant'; content: string; at: string; proposals?: any[] }[]> {
  if (!hasServiceKey()) return [];
  const sb = adminClient();
  const { data } = await sb.from('ai_messages').select('question, answer, proposed, created_at')
    .eq('user_id', p.id).order('created_at', { ascending: false }).limit(12);
  const rows = ((data ?? []) as any[]).reverse();
  if (!rows.length) return [];
  let actions: any[] = [];
  if (rows.some(r => r.proposed > 0)) {
    const since = rows[0].created_at;
    const { data: a } = await sb.from('ai_actions').select('id, kind, summary, status, result, created_at').eq('user_id', p.id).gte('created_at', since).order('created_at');
    actions = (a ?? []) as any[];
  }
  const out: { role: 'user' | 'assistant'; content: string; at: string; proposals?: any[] }[] = [];
  for (const r of rows) {
    out.push({ role: 'user', content: r.question, at: r.created_at });
    const t = new Date(r.created_at).getTime();
    const mine = r.proposed > 0 ? actions.filter(x => Math.abs(new Date(x.created_at).getTime() - t) < 90000) : [];
    out.push({ role: 'assistant', content: r.answer, at: r.created_at, ...(mine.length ? { proposals: mine } : {}) });
  }
  return out;
}

/* Best-effort log: what people ask is the clearest view of what the product
   leaves unclear. Needs supabase/part57-ai.sql; silent when it is not there. */
async function logMessage(p: Profile, question: string, answer: string, proposed: number) {
  if (!hasServiceKey()) return;
  await adminClient().from('ai_messages').insert({ user_id: p.id, role: p.role, question: String(question).slice(0, 4000), answer: answer.slice(0, 8000), proposed });
}
