import { supabaseServer, configured } from './supabase/server';
import { listTouches } from './prospects';
import { sendPushToUser } from './push';
import { todayInPacific, addDaysISO } from './money-public';

/* The Directory's history (part 59, 2 November 2026). One timeline per lead,
   executive or talent: stage, owner and follow-up changes, notes with
   @mentions, and touches. For a lead the calls, emails, messages and
   meetings already live in prospect_touches (they move "last touched"), so
   the timeline reads both and merges them.

   Until part 59 has been run the table is not there: every read here falls
   back to what exists (a lead's touches) and every write says it was not
   stored, so nothing breaks before the database catches up. */

export type SubjectType = 'prospect' | 'client' | 'talent';
export type ActivityKind = 'note' | 'call' | 'email' | 'message' | 'meeting' | 'stage' | 'owner' | 'follow_up' | 'created' | 'field';
export type ActivityItem = {
  id: string; at: string; by: string | null; kind: ActivityKind;
  body: string | null; meta: Record<string, any>; mentions: string[];
  source: 'activity' | 'touch';
};

const MISSING = /crm_activity|relation .* does not exist|schema cache/i;

function demo(type: SubjectType, id: string): ActivityItem[] {
  const t = todayInPacific();
  const at = (d: number, h: string) => `${addDaysISO(t, d)}T${h}:00Z`;
  const base = { mentions: [] as string[], source: 'activity' as const };
  if (type === 'prospect') return [
    { ...base, id: `d1-${id}`, at: at(-1, '17:20'), by: 'demo-admin', kind: 'note', mentions: ['demo-csm'],
      body: '@Marguerite Vance she asked about the Specialist plan for a Chief of Staff. Can you send the one-pager before Thursday?', meta: {} },
    { ...base, id: `d2-${id}`, at: at(-2, '18:05'), by: 'demo-admin', kind: 'stage', body: null, meta: { from: 'new', to: 'contacted' } },
    { ...base, id: `d3-${id}`, at: at(-4, '15:40'), by: 'demo-admin', kind: 'owner', body: null, meta: { to: 'demo-csm' } },
    { ...base, id: `d4-${id}`, at: at(-7, '16:00'), by: null, kind: 'created', body: null, meta: { via: 'Instagram' } }
  ];
  return [
    { ...base, id: `d1-${id}`, at: at(-1, '16:30'), by: 'demo-csm', kind: 'call', body: 'Check-in call. Happy with the shortlist so far; wants one more candidate with board experience.', meta: {} },
    { ...base, id: `d2-${id}`, at: at(-3, '19:10'), by: 'demo-admin', kind: 'note', mentions: ['demo-csm'],
      body: '@Marguerite Vance agreement is out for signature, nudge on Friday if it is not back.', meta: {} },
    { ...base, id: `d3-${id}`, at: at(-9, '14:00'), by: null, kind: 'created', body: null, meta: {} }
  ];
}

/* Is the history table there? Asked once per server instance. */
let ready: boolean | null = null;
export async function activityReady(): Promise<boolean> {
  if (!configured()) return true;
  if (ready !== null) return ready;
  try {
    const sb = await supabaseServer();
    const { error } = await sb.from('crm_activity').select('id').limit(1);
    ready = !error;
  } catch { ready = false; }
  return ready;
}

export async function listActivity(type: SubjectType, id: string): Promise<{ items: ActivityItem[]; ready: boolean }> {
  if (!configured()) {
    const items = demo(type, id);
    if (type === 'prospect') {
      const touches = await listTouches(id);
      items.push(...touches.map(t => ({ id: t.id, at: t.at, by: t.by, kind: t.kind as ActivityKind, body: t.note,
        meta: t.next_follow_up ? { next_follow_up: t.next_follow_up } : {}, mentions: [], source: 'touch' as const })));
    }
    return { items: items.sort((a, b) => (a.at < b.at ? 1 : -1)), ready: true };
  }
  const isReady = await activityReady();
  const items: ActivityItem[] = [];
  if (isReady) {
    try {
      const sb = await supabaseServer();
      const { data } = await sb.from('crm_activity').select('*')
        .eq('subject_type', type).eq('subject_id', id).order('at', { ascending: false }).limit(300);
      items.push(...((data ?? []) as any[]).map(r => ({
        id: r.id, at: r.at, by: r.by, kind: r.kind, body: r.body, meta: r.meta ?? {}, mentions: r.mentions ?? [], source: 'activity' as const
      })));
    } catch { /* fall through to touches */ }
  }
  if (type === 'prospect') {
    const touches = await listTouches(id).catch(() => []);
    items.push(...touches.map(t => ({ id: t.id, at: t.at, by: t.by, kind: t.kind as ActivityKind, body: t.note,
      meta: t.next_follow_up ? { next_follow_up: t.next_follow_up } : {}, mentions: [], source: 'touch' as const })));
  }
  return { items: items.sort((a, b) => (a.at < b.at ? 1 : -1)), ready: isReady };
}

/* Write one event. Returns false, quietly, when the table is not there yet. */
export async function logActivity(e: {
  type: SubjectType; id: string; kind: ActivityKind; body?: string | null;
  meta?: Record<string, any>; mentions?: string[]; by?: string | null;
}): Promise<boolean> {
  if (!configured()) return true;
  if (!(await activityReady())) return false;
  try {
    const sb = await supabaseServer();
    const { error } = await sb.from('crm_activity').insert({
      subject_type: e.type, subject_id: e.id, kind: e.kind, body: e.body?.trim() || null,
      meta: e.meta ?? {}, mentions: (e.mentions ?? []).filter(Boolean), by: e.by ?? null
    });
    if (error) { if (MISSING.test(error.message)) ready = false; return false; }
    return true;
  } catch { return false; }
}

/* Tell the people named, or the new owner, on their phone. Best-effort. */
export async function notifyTeam(userIds: string[], from: string | null, payload: { title: string; body?: string; url: string }) {
  const unique = Array.from(new Set(userIds.filter(u => u && u !== from)));
  await Promise.all(unique.map(u => sendPushToUser(u, { ...payload, tag: `crm-${payload.url}` }).catch(() => {})));
}
