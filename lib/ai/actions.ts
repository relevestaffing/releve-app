/* What the founder's assistant may do, and how it does it.
   -------------------------------------------------------
   A short catalog of changes, every one of which already exists as a
   console action with its own checks. The assistant proposes one of these;
   the founder confirms; execute() runs it through the same route handler
   the console button uses (so the validation, the emails and the side
   effects are identical), and the result is written to ai_actions.

   Deliberately absent: anything that moves money, deletes, archives, or
   sends to a client or a talent directly. Those stay on their own pages. */

import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { setSearchOpen } from '@/lib/store';

export type Proposal = { kind: string; params: Record<string, unknown>; summary: string };
export type ActionRow = Proposal & { id: string; user_id: string; status: 'proposed' | 'done' | 'failed' | 'dismissed'; result: any; created_at: string; confirmed_at: string | null };

export const ACTION_CATALOG: { kind: string; describe: string; params: string }[] = [
  { kind: 'content_hold',          describe: 'Hold a drafted post so it does not go out.',                    params: '{ id: post id }' },
  { kind: 'content_resume',        describe: 'Release a held post back to its schedule.',                      params: '{ id: post id }' },
  { kind: 'content_skip',          describe: 'Skip a post for good (can be put back).',                        params: '{ id: post id }' },
  { kind: 'content_unskip',        describe: 'Put a skipped post back on its schedule.',                       params: '{ id: post id }' },
  { kind: 'content_post_now',      describe: 'Publish a scheduled post right now.',                            params: '{ id: post id }' },
  { kind: 'content_redraft',       describe: 'Have Claude rewrite a post (not a photo post).',                 params: '{ id: post id }' },
  { kind: 'content_write_image',   describe: 'Write a personal LinkedIn post again from its photo.',           params: '{ id: post id }' },
  { kind: 'content_approve_week',  describe: 'Release every held post in a week.',                             params: '{ week: Monday YYYY-MM-DD }' },
  { kind: 'content_draft_week',    describe: 'Draft the posts for a week (fills empty slots).',                params: '{ week: Monday YYYY-MM-DD }' },
  { kind: 'campaign_hold',         describe: 'Hold a Relève Letter so it does not send.',                      params: '{ id: campaign id }' },
  { kind: 'campaign_resume',       describe: 'Put a held or skipped Letter back on schedule (sends now if its time has passed).', params: '{ id: campaign id }' },
  { kind: 'campaign_cancel',       describe: 'Skip a Letter.',                                                  params: '{ id: campaign id }' },
  { kind: 'campaign_redraft',      describe: 'Have Claude rewrite a Letter.',                                   params: '{ id: campaign id }' },
  { kind: 'campaign_draft_next',   describe: 'Draft the next Letter now.',                                      params: '{}' },
  { kind: 'campaign_test',         describe: 'Send a test of a Letter to the founder.',                         params: '{ id: campaign id }' },
  { kind: 'search_reopen',         describe: 'Reopen a client\'s search (they want to hire again).',            params: '{ client_id }' },
  { kind: 'search_close',          describe: 'Close a client\'s open search (withdrawn or on hold).',           params: '{ client_id, reason: "withdrawn" | "on_hold" }' }
];

function viaRoute(path: string, body: Record<string, unknown>) {
  return async () => {
    const mod = path === 'content' ? await import('@/app/api/admin/content/route') : await import('@/app/api/admin/campaigns/route');
    const req = new Request(`https://app.relevestaffing.com/api/admin/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const res = await mod.POST(req);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || `That did not work (${res.status}).`);
    return j;
  };
}

/* Each kind becomes a function of its params. Ids are checked for shape so a
   mistyped proposal fails here, not inside a handler. */
const uuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v ?? ''));
const monday = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));

export function planFor(kind: string, params: Record<string, unknown>, founderEmail: string): () => Promise<any> {
  const id = String(params.id ?? '');
  switch (kind) {
    case 'content_hold': case 'content_resume': case 'content_skip': case 'content_unskip':
    case 'content_post_now': case 'content_redraft': case 'content_write_image': {
      if (!uuid(id)) throw new Error('Which post? The id is missing.');
      const action = kind.replace('content_', '');
      return viaRoute('content', { action, id });
    }
    case 'content_approve_week': case 'content_draft_week': {
      if (!monday(params.week)) throw new Error('Which week? Give the Monday as YYYY-MM-DD.');
      return viaRoute('content', { action: kind.replace('content_', ''), week: params.week });
    }
    case 'campaign_hold': case 'campaign_resume': case 'campaign_cancel': case 'campaign_redraft': {
      if (!uuid(id)) throw new Error('Which email? The id is missing.');
      return viaRoute('campaigns', { action: kind.replace('campaign_', ''), id });
    }
    case 'campaign_test': {
      if (!uuid(id)) throw new Error('Which email? The id is missing.');
      return viaRoute('campaigns', { action: 'test', id, to: founderEmail });
    }
    case 'campaign_draft_next':
      return viaRoute('campaigns', { action: 'draft_next' });
    case 'search_reopen': {
      if (!uuid(params.client_id)) throw new Error('Which client? The id is missing.');
      return async () => { await setSearchOpen(String(params.client_id), true); return { ok: true }; };
    }
    case 'search_close': {
      if (!uuid(params.client_id)) throw new Error('Which client? The id is missing.');
      const reason = params.reason === 'on_hold' ? 'on_hold' : 'withdrawn';
      return async () => { await setSearchOpen(String(params.client_id), false, reason); return { ok: true }; };
    }
    default:
      throw new Error('That is not something the assistant can do from here.');
  }
}

/* ---------- what the founder reads before confirming ---------- */

/* The confirmation card shows THIS sentence, built by the server from the
   kind and the record it points at, never the model's own summary. A
   prompt-injected email or lead note can talk the model into proposing a
   send under an innocent label; it cannot change what this says
   (security pass, 2 Nov 2026). */
const when = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'no time set';
const CHANNEL_WORDS: Record<string, string> = {
  li_personal: "Sage's personal LinkedIn post", li_group: 'LinkedIn group post', ig_client: 'Instagram and Facebook post',
  ig_careers: 'Careers post', li_page_client: 'Relève LinkedIn page post', li_page_careers: 'Careers LinkedIn page post'
};
const VERB: Record<string, string> = {
  content_hold: 'Hold', content_resume: 'Release back to its schedule', content_skip: 'Skip', content_unskip: 'Put back on its schedule',
  content_post_now: 'PUBLISH RIGHT NOW to its networks', content_redraft: 'Have Claude rewrite', content_write_image: 'Rewrite from its photo',
  campaign_hold: 'Hold', campaign_resume: 'Put back on schedule (SENDS to the whole list if its time has passed)',
  campaign_cancel: 'Skip', campaign_redraft: 'Have Claude rewrite', campaign_test: 'Send a test copy to you of'
};

export async function describeAction(kind: string, params: Record<string, unknown>): Promise<string> {
  const cat = ACTION_CATALOG.find(a => a.kind === kind);
  if (!cat) return 'Unknown action.';
  if (!hasServiceKey()) return cat.describe;
  const sb = adminClient();
  const id = String(params.id ?? '');
  try {
    if (kind.startsWith('content_') && uuid(id)) {
      const { data: p } = await sb.from('content_posts').select('channel, topic, hook, publish_at, status').eq('id', id).maybeSingle();
      if (!p) return `${VERB[kind]}: a post that could not be found (${id.slice(0, 8)}).`;
      const name = (p.topic || p.hook || 'untitled').toString().slice(0, 90);
      return `${VERB[kind]} the ${CHANNEL_WORDS[p.channel] ?? 'post'} "${name}" (${p.status}, set for ${when(p.publish_at)}).`;
    }
    if (kind === 'content_approve_week' || kind === 'content_draft_week') {
      const week = String(params.week ?? '');
      const { count } = await sb.from('content_posts').select('id', { count: 'exact', head: true }).eq('week_start', week).eq('status', 'held');
      return kind === 'content_approve_week'
        ? `Release every held post for the week of ${week} (${count ?? 0} held now) so they publish on schedule.`
        : `Draft the posts for the week of ${week} (fills the empty slots only).`;
    }
    if (kind.startsWith('campaign_') && uuid(id)) {
      const { data: c } = await sb.from('campaigns').select('subject, send_at, status').eq('id', id).maybeSingle();
      if (!c) return `${VERB[kind]}: a Letter that could not be found (${id.slice(0, 8)}).`;
      const { count } = await sb.from('subscribers').select('id', { count: 'exact', head: true }).eq('subscribed', true);
      return `${VERB[kind]} The Relève Letter "${String(c.subject).slice(0, 90)}" (${c.status}, ${when(c.send_at)}, list of ${count ?? 0}).`;
    }
    if (kind === 'campaign_draft_next') return 'Draft the next Relève Letter now (it stays held for review on its usual schedule).';
    if (kind === 'search_reopen' || kind === 'search_close') {
      const cid = String(params.client_id ?? '');
      const { data: c } = uuid(cid) ? await sb.from('profiles').select('full_name, email').eq('id', cid).maybeSingle() : { data: null };
      const who = c ? `${c.full_name ?? c.email}` : `a client that could not be found (${cid.slice(0, 8)})`;
      return kind === 'search_reopen' ? `Reopen the search for ${who}.` : `Close the open search for ${who} (${params.reason === 'on_hold' ? 'on hold' : 'withdrawn'}).`;
    }
  } catch { /* fall through to the catalog wording */ }
  return cat.describe;
}

/* ---------- the log (supabase/part57-ai.sql) ---------- */

export async function recordProposals(userId: string, proposals: Proposal[]): Promise<ActionRow[]> {
  if (!hasServiceKey() || !proposals.length) return [];
  const { data, error } = await adminClient().from('ai_actions')
    .insert(proposals.map(p => ({ user_id: userId, kind: p.kind, params: p.params, summary: p.summary, status: 'proposed' })))
    .select('*');
  if (error) throw new Error('The action log is not set up yet. Run supabase/part57-ai.sql (node scripts/apply-ai-migration.mjs) and try again.');
  return (data ?? []) as ActionRow[];
}

export async function getAction(id: string): Promise<ActionRow | null> {
  if (!hasServiceKey()) return null;
  const { data } = await adminClient().from('ai_actions').select('*').eq('id', id).maybeSingle();
  return (data ?? null) as ActionRow | null;
}

/* Claims a proposal for one run: the first caller stamps confirmed_at,
   a second simultaneous click finds it taken (security pass, 2 Nov 2026). */
export async function claimAction(id: string): Promise<boolean> {
  if (!hasServiceKey()) return false;
  const { data } = await adminClient().from('ai_actions')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'proposed').is('confirmed_at', null)
    .select('id');
  return (data ?? []).length === 1;
}

export async function finishAction(id: string, status: 'done' | 'failed' | 'dismissed', result: unknown) {
  if (!hasServiceKey()) return;
  await adminClient().from('ai_actions').update({ status, result, confirmed_at: new Date().toISOString() }).eq('id', id);
}

export async function recentActions(limit = 30): Promise<ActionRow[]> {
  if (!hasServiceKey()) return [];
  const { data } = await adminClient().from('ai_actions').select('*').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as ActionRow[];
}
