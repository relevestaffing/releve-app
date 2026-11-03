/* The content engine's shapes and schedule (30 October 2026). Safe to import
   from the browser: no server code, no secrets. Relative imports only, so a
   Netlify background function can bundle it too. */

export type Channel = 'li_personal' | 'li_group' | 'ig_client' | 'ig_careers' | 'li_page_client' | 'li_page_careers';
export type Format = 'text' | 'card' | 'carousel' | 'video';
export type PostStatus = 'needs_image' | 'needs_video' | 'scheduled' | 'held' | 'manual' | 'publishing' | 'posted' | 'failed' | 'skipped';

/* Design fields (layout, rows, number, facts, left/right, bars, messages,
   chips) ride along inside card and slides; see lib/content-render.tsx. */
export type Slide = { title: string; body: string; layout?: string; [k: string]: any };
export type Card = { kicker: string; quote: string; sub?: string; layout?: string; [k: string]: any };
export type Script = { hook: string; beats: string[]; close: string; onscreen: string[] };

export type ContentPost = {
  id: string; slot: string; week_start: string; channel: Channel; format: Format;
  publish_at: string; status: PostStatus; hold_reason: string | null; topic: string | null;
  hook: string | null; caption: string; caption_fb: string | null;
  card: Card | null; slides: Slide[]; script: Script | null;
  image_idea: string | null; image_path: string | null; video_path: string | null;
  parent_id: string | null; results: Record<string, any>; error: string | null;
  posted_at: string | null; written_by: 'claude' | 'team'; created_at: string; updated_at: string;
};

export const CHANNELS: Record<Channel, { label: string; short: string; where: string }> = {
  li_personal:     { label: "Sage's LinkedIn",        short: 'LinkedIn',        where: 'Posts itself once the picture is in' },
  li_group:        { label: 'LinkedIn groups',        short: 'Groups',          where: 'Same post as the day\u2019s main one. Post by hand in all four groups' },
  ig_client:       { label: 'Instagram + Facebook',   short: 'Relève IG + FB',  where: 'Posts itself to Instagram and Facebook. Its copies go to the LinkedIn page and the groups' },
  ig_careers:      { label: 'Careers IG + FB',        short: 'Careers IG + FB', where: 'Posts itself' },
  li_page_client:  { label: 'Relève LinkedIn page',   short: 'LinkedIn page',   where: 'Schedule in LinkedIn until page access is approved' },
  li_page_careers: { label: 'Careers LinkedIn page',  short: 'Careers page',    where: 'Schedule in LinkedIn until page access is approved' }
};

export const STATUS_LABEL: Record<PostStatus, string> = {
  needs_image: 'Needs your picture', needs_video: 'Needs your video', scheduled: 'Posts on schedule',
  held: 'Held', manual: 'Post by hand', publishing: 'Posting', posted: 'Posted', failed: 'Did not post', skipped: 'Skipped'
};
export const STATUS_PILL: Record<PostStatus, string> = {
  needs_image: 'pill warn', needs_video: 'pill warn', scheduled: 'pill good', held: 'pill warn',
  manual: 'pill', publishing: 'pill', posted: 'pill good', failed: 'pill crit', skipped: 'pill'
};

/* The week (Pacific). Day 1 is Monday. One row per slot. */
export type SlotPlan = { channel: Channel; day: number; hour: number; minute: number; format: Format };
export const WEEK_PLAN: SlotPlan[] = [
  ...[1, 2, 3, 4, 5, 6].map(d => ({ channel: 'li_personal' as Channel, day: d, hour: 8, minute: 0, format: 'text' as Format })),
  /* One post a day (2 November 2026). The client post is the day's single
     post: it goes to Instagram, Facebook, the Relève LinkedIn page and the
     four LinkedIn groups, identical everywhere (see COPY_PLAN). Days alternate a
     card and a carousel. Face-to-camera videos are off (2 Nov 2026). */
  ...[1, 2, 3, 4, 5, 6].map(d => ({ channel: 'ig_client' as Channel, day: d, hour: 11, minute: 0, format: (d % 2 ? 'card' : 'carousel') as Format })),
  /* Careers posts removed from the app (2 Nov 2026); rebuild if needed. */
];
/* Where each day's single client post is copied to, by day (1 = Monday). The
   copies hold the same words and graphics and are posted by hand (or by the
   LinkedIn page once LinkedIn approves page access). */
export const COPY_PLAN: { channel: Channel; days: number[] }[] = [
  { channel: 'li_page_client', days: [1, 2, 3, 4, 5, 6] },
  { channel: 'li_group', days: [1, 2, 3, 4, 5] }
];
export const COPY_CHANNELS: Channel[] = ['li_group', 'li_page_client', 'li_page_careers'];
/* A copy of another post, shown inside that post rather than on its own. */
export const isCopyPost = (p: { parent_id: string | null; channel: Channel }) => Boolean(p.parent_id) && COPY_CHANNELS.includes(p.channel);
export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_KEYS = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const TZ = 'America/Los_Angeles';

export function pacificParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) };
}

/* The UTC instant of a Pacific wall-clock time, correct across daylight saving. */
export function pacificToUtc(y: number, m: number, d: number, h: number, min = 0) {
  let t = Date.UTC(y, m - 1, d, h + 8, min);
  for (let i = 0; i < 2; i++) {
    const p = pacificParts(new Date(t));
    const diff = (h - p.h + 24) % 24;
    t += (diff > 12 ? diff - 24 : diff) * 3600000;
  }
  return new Date(t);
}

/* The Monday (Pacific) of the week containing `d`, plus `weeks`, as YYYY-MM-DD. */
export function weekStart(d = new Date(), weeks = 0): string {
  const p = pacificParts(d);
  const noon = pacificToUtc(p.y, p.m, p.d, 12);
  const back = (p.wd + 6) % 7;                       // days since Monday
  const mon = new Date(noon.getTime() - back * 86400000 + weeks * 7 * 86400000);
  const q = pacificParts(mon);
  return `${q.y}-${String(q.m).padStart(2, '0')}-${String(q.d).padStart(2, '0')}`;
}

/* The UTC instant for day `day` (1 = Monday) of the week starting `monday`. */
export function slotTime(monday: string, day: number, hour: number, minute: number) {
  const [y, m, d] = monday.split('-').map(Number);
  const noon = pacificToUtc(y, m, d, 12);
  const p = pacificParts(new Date(noon.getTime() + (day - 1) * 86400000));
  return pacificToUtc(p.y, p.m, p.d, hour, minute);
}

export function whenLabel(iso: string) {
  return new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT';
}
export function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
}

/* Is this a post a person has to publish? */
export const isManual = (c: Channel) => c === 'li_group' || c === 'li_page_client' || c === 'li_page_careers';
export const pageFor = (c: Channel): Channel | null => c === 'ig_client' ? 'li_page_client' : c === 'ig_careers' ? 'li_page_careers' : null;
