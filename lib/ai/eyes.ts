/* The founder's assistant: everything else it can see (read-only).
   ---------------------------------------------------------------
   assistant.ts holds the focused lookups. These are the wide ones, so that
   any question about Relève can be answered from the live app instead of
   "I can't tell": any table, the VA's Google Doc and Drive folder, the
   hello@ inbox, the state of the social connections. Founder seat only.
   Nothing here writes. Secrets are stripped from every row before the model
   sees them. */

import { adminClient } from '@/lib/supabase/admin';

type Tool = { description: string; input: any; run: (a: any) => Promise<string> };

/* Tables the assistant may not read at all (credentials, device keys). */
const BLOCKED = new Set(['calendar_connections', 'push_subscriptions', 'signin_failures']);
const SECRET = /(token|secret|password|private_key|api_key|refresh)/i;

function clean(v: any): any {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) o[k] = SECRET.test(k) ? '[hidden]' : clean(x);
    return o;
  }
  return v;
}

const TABLES = [
  'ai_actions', 'ai_messages', 'apply_attempts', 'audit_log', 'availability', 'backup_log', 'billing_accounts', 'campaign_sends', 'campaigns',
  'checkins', 'client_agreement_history', 'client_agreements', 'client_pulse', 'client_requests', 'content_posts', 'content_settings',
  'documents', 'docusign_events', 'email_log', 'interview_feedback', 'interview_reminders', 'interviews', 'invoices', 'job_applications',
  'job_posts', 'lead_audits', 'matches', 'message_reads', 'messages', 'offers', 'onboarding_steps', 'pending_people', 'placement_notes',
  'placement_terms', 'placements', 'profiles', 'prospect_touches', 'prospects', 'report_sends', 'role_breakdown', 'searches',
  'signature_attempts', 'signatures', 'skills_profile', 'stripe_events', 'subscribers', 'taking_the_watch_attempts', 'taking_the_watch_scores',
  'taking_the_watch_tasks', 'talent_briefs', 'talent_decisions', 'talent_feedback', 'talent_logs', 'talent_pay', 'talent_payments',
  'talent_payout', 'task_comments', 'task_files', 'tasks', 'team_roles', 'terms_acceptances', 'time_off', 'vetting'
].filter(t => !BLOCKED.has(t));

const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'is', 'in'] as const;

export const EYES: Record<string, Tool> = {
  db_tables: {
    description: 'List every table in the Relève app database you can read. Then use db_query with describe=true on one to see its columns.',
    input: { type: 'object', properties: {} },
    run: async () => TABLES.join(', ')
  },
  db_query: {
    description: 'Read any table in the app database (read-only). Use for anything stored in Relève: placements, tasks, messages, applications, prospects and leads, offers, invoices, payments, check-ins, email log, subscribers, the AI log, content posts and so on. Pass describe=true to see a table\'s columns first. Filters is a list of {col, op, value} with op one of eq, neq, gt, gte, lt, lte, ilike (use % wildcards), is (value null or true/false), in (value an array). Max 50 rows. count_only returns just the number.',
    input: { type: 'object', properties: {
      table: { type: 'string' },
      select: { type: 'string', description: 'Comma separated columns, default all. Embedded joins like client:client_id(full_name) work.' },
      filters: { type: 'array', items: { type: 'object', properties: { col: { type: 'string' }, op: { type: 'string', enum: [...OPS] }, value: {} }, required: ['col', 'op'] } },
      order: { type: 'string', description: 'Column to sort by' },
      ascending: { type: 'boolean' },
      limit: { type: 'number' },
      count_only: { type: 'boolean' },
      describe: { type: 'boolean' }
    }, required: ['table'] },
    run: async (a) => {
      const table = String(a.table ?? '');
      if (!TABLES.includes(table)) return `No readable table named "${table}". Call db_tables for the list.`;
      const sb = adminClient();
      if (a.describe) {
        const { data, error } = await sb.from(table).select('*').limit(1);
        if (error) return `Could not read ${table}: ${error.message}`;
        return data?.[0] ? `Columns of ${table}: ${Object.keys(data[0]).join(', ')}` : `${table} is empty, so its columns cannot be shown.`;
      }
      let q: any = sb.from(table).select(String(a.select || '*'), a.count_only ? { count: 'exact', head: true } : undefined);
      if (table === 'content_settings') q = q.not('key', 'like', 'conn:%');
      for (const f of (Array.isArray(a.filters) ? a.filters : []).slice(0, 8)) {
        const col = String(f.col ?? ''); if (!/^[a-z_][a-z0-9_]*$/i.test(col) || !(OPS as readonly string[]).includes(f.op)) continue;
        let v = f.value;
        if (f.op === 'is') v = v === 'true' ? true : v === 'false' ? false : null;
        q = q.filter(col, f.op, f.op === 'in' ? `(${(Array.isArray(v) ? v : [v]).join(',')})` : v);
      }
      if (a.order && /^[a-z_][a-z0-9_]*$/i.test(String(a.order))) q = q.order(String(a.order), { ascending: !!a.ascending });
      if (!a.count_only) q = q.limit(Math.min(Math.max(Number(a.limit) || 20, 1), 50));
      const { data, error, count } = await q;
      if (error) return `Query failed: ${String(error.message).slice(0, 200)}`;
      if (a.count_only) return `${count ?? 0} rows in ${table} match.`;
      if (!data?.length) return 'No rows match.';
      return JSON.stringify(clean(data)).slice(0, 18000);
    }
  },
  va_doc: {
    description: 'Read the Google Doc Sage\'s VA works from (captions and scripts for the hand-posted LinkedIn group and page posts). Pass doc id only to read a different Doc. Returns each tab\'s text, newest at the end. Use to answer whether posts were uploaded to the VA\'s Doc.',
    input: { type: 'object', properties: { doc: { type: 'string', description: 'Optional Google Doc id' }, cap: { type: 'number' } } },
    run: async ({ doc, cap }) => {
      const { readDocText, vaConfigured } = await import('@/lib/google-va');
      const { vaPlace } = await import('@/lib/content');
      if (!vaConfigured()) return 'The Google service account is not set up, so the Doc cannot be read.';
      const place = await vaPlace();
      try { return await readDocText(String(doc || place.doc), Math.min(Number(cap) || 14000, 20000)); }
      catch (e: any) { return `Could not read the Doc: ${String(e?.message ?? e).slice(0, 200)}`; }
    }
  },
  va_drive: {
    description: 'List the files in the VA\'s Google Drive folder (carousel PDFs, card images, videos), newest first. Pass a folder id to open a subfolder such as "Week of November 2, 2026"; no id lists the top folder.',
    input: { type: 'object', properties: { folder: { type: 'string' } } },
    run: async ({ folder }) => {
      const { listFolder, vaConfigured } = await import('@/lib/google-va');
      const { vaPlace } = await import('@/lib/content');
      if (!vaConfigured()) return 'The Google service account is not set up, so Drive cannot be read.';
      const place = await vaPlace();
      try {
        const files = await listFolder(String(folder || place.folder));
        return files.length ? files.map(f => `${f.mimeType.includes('folder') ? '[folder]' : '[file]'} ${f.name} modified ${f.modifiedTime} id=${f.id}`).join('\n') : 'The folder is empty.';
      } catch (e: any) { return `Could not read Drive: ${String(e?.message ?? e).slice(0, 200)}`; }
    }
  },
  va_export_status: {
    description: 'Whether the weekly send to the VA ran for each week (status, time, number of files), plus the Doc and folder the app writes to.',
    input: { type: 'object', properties: {} },
    run: async () => {
      const { data } = await adminClient().from('content_settings').select('key, value, updated_at').like('key', 'va%').order('key', { ascending: false }).limit(12);
      const { vaPlace } = await import('@/lib/content');
      const place = await vaPlace();
      return `Writes to Doc ${place.doc} (tab ${place.tab}) and Drive folder ${place.folder}.\n` + ((data ?? []).map((r: any) => `${r.key}: ${JSON.stringify(clean(r.value))} (updated ${r.updated_at})`).join('\n') || 'No VA sends recorded.');
    }
  },
  inbox_search: {
    description: 'Search the hello@relevestaffing.com mailbox with Gmail search syntax (from:, subject:, newer_than:7d, has:attachment, plain words). Returns sender, subject, date and snippet; use inbox_read for the full text.',
    input: { type: 'object', properties: { query: { type: 'string' }, max: { type: 'number' } }, required: ['query'] },
    run: async ({ query, max }) => {
      const { searchInbox } = await import('@/lib/gmail');
      const r = await searchInbox(String(query ?? ''), Number(max) || 10);
      if (r.reason) return r.reason;
      return r.rows.map(m => `id=${m.id} ${m.at.slice(0, 16)} from ${m.from} | ${m.subject} | ${m.snippet.slice(0, 160)}`).join('\n') || 'Nothing matches.';
    }
  },
  inbox_read: {
    description: 'Read one email from hello@ in full text, by the id inbox_search returned.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async ({ id }) => {
      const { readInboxMessage } = await import('@/lib/gmail');
      const r = await readInboxMessage(String(id ?? ''));
      return r.reason || r.text;
    }
  },
  social_status: {
    description: 'State of the social connections and content settings: Instagram/Facebook (Meta) and LinkedIn connection, which pages are mapped, token expiry, the four LinkedIn groups, drafting and digest records. Secrets are hidden.',
    input: { type: 'object', properties: {} },
    run: async () => {
      const { data } = await adminClient().from('content_settings').select('key, value, updated_at').order('key').limit(60);
      return (data ?? []).map((r: any) => `${r.key}: ${JSON.stringify(clean(r.value)).slice(0, 500)} (updated ${r.updated_at})`).join('\n') || 'No settings.';
    }
  }
};
