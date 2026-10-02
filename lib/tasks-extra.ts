/* Task logic added in the October pass: a status beyond done, editing after
   creation, and comments (including a talent asking a question on a task).
   Kept out of lib/work.ts on purpose; the original create/list/delete stay
   there. Everything runs through the signed-in session, so row level
   security and the guard trigger in part39-experience.sql decide. */
import { configured, supabaseServer } from './supabase/server';
import type { Priority, Task } from './work-public';
import type { TaskComment, TaskStatus } from './experience-public';

export type TaskRow = Task & { status: TaskStatus; updated_at?: string };

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'done'];
const PRIORITY_KEYS: Priority[] = ['urgent', 'high', 'normal', 'low'];

export function isStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (STATUSES as string[]).includes(v);
}

export async function getTask(id: string): Promise<TaskRow | null> {
  if (!configured()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
  return (data as TaskRow) ?? null;
}

/** Edits a task and reports a refusal as a refusal. An update that row level
    security quietly matches to zero rows used to come back as success, so a
    tick that never saved looked saved. Asking for the row back is what turns
    that silence into an error the person sees. */
export async function updateTaskChecked(id: string, patch: {
  title?: unknown; detail?: unknown; priority?: unknown; due_on?: unknown;
  status?: unknown; done?: unknown;
}, byUser: string): Promise<TaskRow> {
  const sb = await supabaseServer();
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('title' in patch) {
    const t = String(patch.title ?? '').trim();
    if (!t) throw new Error('A task needs a title.');
    body.title = t.slice(0, 300);
  }
  if ('detail' in patch) body.detail = String(patch.detail ?? '').trim().slice(0, 4000) || null;
  if ('priority' in patch) {
    if (!PRIORITY_KEYS.includes(patch.priority as Priority)) throw new Error('That priority is not one we know.');
    body.priority = patch.priority;
  }
  if ('due_on' in patch) {
    const d = String(patch.due_on ?? '').trim();
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('That date is not a date.');
    body.due_on = d || null;
  }

  let done: boolean | undefined;
  if ('status' in patch) {
    if (!isStatus(patch.status)) throw new Error('That status is not one we know.');
    body.status = patch.status;
    done = patch.status === 'done';
  } else if ('done' in patch) {
    done = !!patch.done;
    body.done = done;
  }
  if (done !== undefined) {
    body.done = done;
    body.done_at = done ? new Date().toISOString() : null;
    body.done_by = done ? byUser : null;
  }

  const { data, error } = await sb.from('tasks').update(body).eq('id', id).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That task could not be changed. It may not be on a placement you are part of.');
  return data as TaskRow;
}

/* ---------- comments and questions ---------- */

export async function listComments(taskId: string): Promise<TaskComment[]> {
  if (!configured()) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from('task_comments').select('*')
    .eq('task_id', taskId).order('created_at', { ascending: true });
  return (data ?? []) as TaskComment[];
}

export async function addComment(taskId: string, authorId: string, body: string, isQuestion: boolean) {
  const sb = await supabaseServer();
  const text = body.trim().slice(0, 4000);
  if (!text) throw new Error('Nothing to send.');
  const { data, error } = await sb.from('task_comments')
    .insert({ task_id: taskId, author_id: authorId, body: text, is_question: isQuestion })
    .select('*').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That comment was not saved.');
  return data as TaskComment;
}

/** How many comments each task on a placement has, and whether the newest
    one is a question still waiting on an answer from the other side. */
export async function commentSummary(placementId: string): Promise<Record<string, { count: number; lastBy: string; question: boolean }>> {
  if (!configured()) return {};
  const sb = await supabaseServer();
  const { data: tasks } = await sb.from('tasks').select('id').eq('placement_id', placementId);
  const ids = ((tasks ?? []) as any[]).map(t => t.id);
  if (!ids.length) return {};
  const { data } = await sb.from('task_comments').select('task_id, author_id, is_question, created_at')
    .in('task_id', ids).order('created_at', { ascending: true });
  const out: Record<string, { count: number; lastBy: string; question: boolean }> = {};
  for (const c of (data ?? []) as any[]) {
    const cur = out[c.task_id] ?? { count: 0, lastBy: '', question: false };
    cur.count++; cur.lastBy = c.author_id; cur.question = !!c.is_question;
    out[c.task_id] = cur;
  }
  return out;
}
