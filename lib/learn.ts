/* The team trainings, server side (10 November 2026). See lib/learn-courses.ts.
   A training link is /learn/<token>. The token names one person's copy of
   one course and nothing else; it opens no account and reads nothing but
   that row. Rows live in team_trainings (supabase/part62-learn.sql): the
   team reads and writes them through the console under row level security,
   and the public link reaches its own row through the service role, after
   the token has been checked. */
import { randomBytes } from 'node:crypto';
import { adminClient, hasServiceKey } from '@/lib/supabase/admin';
import { COURSES, isCourse, VIDEO_RE, type CourseKey } from '@/lib/learn-courses';
import { HTML as INSIDE_HTML } from '@/lib/learn-gen/inside-html';
import { HTML as SALES_HTML } from '@/lib/learn-gen/sales-html';
import { HTML as TALENT_HTML } from '@/lib/learn-gen/talent-html';

export const COURSE_HTML: Record<CourseKey, string> = { inside: INSIDE_HTML, sales: SALES_HTML, talent: TALENT_HTML };

export type Progress = { done: string[]; checks: Record<string, { score: number; at: string }>; last: number };
export type TrainingRow = {
  id: string; course: CourseKey; name: string; email: string; token: string;
  sent_at: string | null; opened_at: string | null; last_seen_at: string | null;
  progress: Partial<Progress> | null; lessons_done: number; checks_passed: number;
  completed_at: string | null; signed_name: string | null; revoked_at: string | null; created_at: string;
  user_id?: string | null;
};

export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export const newToken = () => randomBytes(24).toString('base64url');   // 32 characters

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';
export const learnLink = (token: string) => `${APP}/learn/${token}`;

/** The live row behind a link, or null for anything unknown or withdrawn. */
export async function trainingByToken(token: string): Promise<TrainingRow | null> {
  if (!TOKEN_RE.test(token) || !hasServiceKey()) return null;
  try {
    const { data } = await adminClient().from('team_trainings').select('*').eq('token', token).maybeSingle();
    const row = data as TrainingRow | null;
    if (!row || row.revoked_at || !isCourse(row.course)) return null;
    return row;
  } catch { return null; }
}

/* Merge what a browser reports into what the server already holds. Only real
   step ids count, a lesson once done stays done, and a check keeps its best
   passing score. Nothing a browser sends can mark the sign-off itself. */
export function mergeProgress(course: CourseKey, stored: Partial<Progress> | null, incoming: any): Progress {
  const steps = COURSES[course].steps;
  const ids = new Set(steps.filter(s => s[4] !== 's').map(s => s[0]));
  const checkIds = new Set(steps.filter(s => s[4] === 'c').map(s => s[0]));
  const done = new Set<string>((stored?.done ?? []).filter(id => ids.has(id)));
  for (const id of Array.isArray(incoming?.done) ? incoming.done.slice(0, 100) : [])
    if (typeof id === 'string' && ids.has(id)) done.add(id);
  const checks: Progress['checks'] = { ...(stored?.checks ?? {}) };
  const inc = incoming?.checks && typeof incoming.checks === 'object' ? incoming.checks : {};
  for (const k of Object.keys(inc)) {
    if (!checkIds.has(k)) continue;
    const score = Math.round(Number(inc[k]?.score));
    if (!Number.isFinite(score) || score < 4 || score > 5) continue;   // only passes are recorded
    const at = typeof inc[k]?.at === 'string' && !isNaN(Date.parse(inc[k].at)) ? new Date(inc[k].at).toISOString() : new Date().toISOString();
    if (!checks[k] || score > checks[k].score) checks[k] = { score, at };
    done.add(k);
  }
  for (const k of Object.keys(checks)) if (!checkIds.has(k)) delete checks[k];
  const lastIn = Number(incoming?.last);
  const last = Number.isInteger(lastIn) && lastIn >= 0 && lastIn < steps.length ? lastIn : (stored?.last ?? 0);
  return { done: [...done], checks, last };
}

export function counts(course: CourseKey, p: Progress) {
  const steps = COURSES[course].steps;
  const lessons_done = steps.filter(s => s[4] === 'l' && p.done.includes(s[0])).length;
  const checks_passed = steps.filter(s => s[4] === 'c' && p.checks[s[0]]?.score >= 4).length;
  return { lessons_done, checks_passed };
}

/** Every lesson read and every check passed: the sign-off is open. */
export function finished(course: CourseKey, p: Progress): boolean {
  return COURSES[course].steps.every(s =>
    s[4] === 's' || (s[4] === 'l' ? p.done.includes(s[0]) : (p.checks[s[0]]?.score ?? 0) >= 4));
}

/** Lesson videos for a course: content_settings 'learn:videos:<course>'. */
export async function courseVideos(course: CourseKey): Promise<Record<string, string>> {
  if (!hasServiceKey()) return {};
  try {
    const { data } = await adminClient().from('content_settings').select('value').eq('key', `learn:videos:${course}`).maybeSingle();
    const v = ((data as any)?.value ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, u] of Object.entries(v)) if (typeof u === 'string' && VIDEO_RE.test(u)) out[k] = u;
    return out;
  } catch { return {}; }
}

/** The page someone sees when a link is unknown or has been withdrawn. */
export function gonePage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Relève</title>
<style>@font-face{font-family:Lora;src:url(/fonts/Lora-Regular.woff) format('woff')}@font-face{font-family:Poppins;src:url(/fonts/Poppins-Light.woff) format('woff');font-weight:300}
html,body{margin:0;height:100%}body{display:grid;place-items:center;background:#EEEAE1 url(/learn-assets/limewash.webp) 50% 0/1600px 800px;font-family:Poppins,Helvetica,sans-serif;font-weight:300;color:#3C463F;padding:24px;box-sizing:border-box}
main{max-width:460px;text-align:center}img{width:220px;height:auto;margin:0 auto 40px;display:block}h1{font-family:Lora,Georgia,serif;font-weight:400;font-size:30px;line-height:1.2;color:#22302A;margin:0 0 14px}p{margin:0;font-size:16px;line-height:1.7}</style></head>
<body><main><img src="/logo-fern.png" alt="Relève Executive Staffing" width="1200" height="360"><h1>This link isn’t active.</h1><p>Training links are private to one person and can be withdrawn. If you need yours, ask the Relève team at hello@relevestaffing.com and we will send you a new one.</p></main></body></html>`;
}

/* The talent training lives in the talent's own account (Nona, 10 November
   2026: "in their app accounts as part of their onboarding", tracked, not a
   gate). Each talent gets one row for it, keyed to their account, made the
   first time they open it. */
export async function trainingFor(userId: string, course: CourseKey = 'talent'): Promise<TrainingRow | null> {
  if (!hasServiceKey()) return null;
  try {
    const { data } = await adminClient().from('team_trainings').select('*')
      .eq('user_id', userId).eq('course', course).is('revoked_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return (data as TrainingRow | null) ?? null;
  } catch { return null; }
}

export async function trainingDoneFor(userId: string, course: CourseKey = 'talent'): Promise<boolean> {
  return Boolean((await trainingFor(userId, course))?.completed_at);
}

export async function ensureTraining(p: { id: string; email: string; full_name?: string | null }, course: CourseKey = 'talent'): Promise<TrainingRow | null> {
  const have = await trainingFor(p.id, course);
  if (have) return have;
  if (!hasServiceKey()) return null;
  const name = (p.full_name || p.email.split('@')[0] || 'Relève professional').replace(/\s+/g, ' ').trim().slice(0, 120).padEnd(2, ' ');
  const { data, error } = await adminClient().from('team_trainings').insert({
    course, name, email: p.email.toLowerCase(), token: newToken(), user_id: p.id, sent_at: new Date().toISOString()
  }).select('*').single();
  if (error) return trainingFor(p.id, course);   // a second tab got there first
  return data as TrainingRow;
}

/** A link prefetch must never count as someone opening a training. */
export const isPrefetch = (req: Request) =>
  Boolean(req.headers.get('next-router-prefetch') || req.headers.get('rsc') ||
    /prefetch/i.test(req.headers.get('purpose') ?? '') || /prefetch/i.test(req.headers.get('sec-purpose') ?? ''));
