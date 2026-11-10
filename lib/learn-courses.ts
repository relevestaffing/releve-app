/* The Relève team trainings (10 November 2026).
   ------------------------------------------------
   Nona: a full Relève training for every new hire, sent only through the
   console as a private link, with videos added later; then a separate sales
   training added to a person only once she approves it for them.

   Each training is a course: one self-contained page built by learn/build.py
   from learn/<course>/, and a list of steps (lessons, checks, the sign-off).
   This file is safe to import in client code: no HTML, no secrets. */
import { STEPS as INSIDE_STEPS } from '@/lib/learn-gen/inside-steps';
import { STEPS as SALES_STEPS } from '@/lib/learn-gen/sales-steps';
import { STEPS as TALENT_STEPS } from '@/lib/learn-gen/talent-steps';

export type StepKind = 'l' | 'c' | 's';
export type Step = readonly [id: string, part: string, title: string, minutes: number, kind: StepKind];

export type Course = {
  key: string;
  title: string;
  /** One line for the console. */
  blurb: string;
  /** Who it goes to, said plainly in the console. */
  audience: string;
  steps: readonly Step[];
  /** The email that carries the link. */
  email: { subject: string; headline: string; intro: string };
};

export const COURSES = {
  inside: {
    key: 'inside',
    title: 'Inside Relève',
    blurb: 'The full Relève training: who we serve, how we stand out, how a placement runs, and how we sell.',
    audience: 'Every new hire',
    steps: INSIDE_STEPS as unknown as readonly Step[],
    email: {
      subject: 'Your Relève training',
      headline: 'Welcome to Relève.',
      intro: 'Before your first weeks get busy, we would like you to know Relève the way we do. Inside Relève is our team training: twenty-two short lessons on who we serve, how we stand out, how a placement runs and how we sell, with a short check at the end of each part.'
    }
  },
  sales: {
    key: 'sales',
    title: 'Selling Relève',
    blurb: 'The deep sales training: how owners decide, the psychology behind each step, and how to sell Relève from the first message to a signed client.',
    audience: 'Only the hires you approve for sales',
    steps: SALES_STEPS as unknown as readonly Step[],
    email: {
      subject: 'Your Relève sales training',
      headline: 'Selling Relève.',
      intro: 'You have been approved for Selling Relève, our sales training. It covers how owners decide and why they hesitate, how to find and reach the right founders, the discovery call line by line, every common objection, and what happens after the call, with the words to use and the reason each one works.'
    }
  },
  talent: {
    key: 'talent',
    title: 'Working with Relève',
    blurb: 'For every professional we place with a client: how working through Relève works, how the app works, and what their days look like.',
    audience: 'Every placed professional, from their app',
    steps: TALENT_STEPS as unknown as readonly Step[],
    email: {
      subject: 'Working with Relève, your training',
      headline: 'Working with Relève.',
      intro: 'Working with Relève is a short training for every professional we place: how working through Relève works, how to use the app, and what your days will look like with your client. It is also on your checklist in the app.'
    }
  }
} satisfies Record<string, Course>;

/** Courses a person opens from their own app account rather than from a link the console sends. */


export type CourseKey = keyof typeof COURSES;
export const COURSE_KEYS = Object.keys(COURSES) as CourseKey[];
export const isCourse = (k: unknown): k is CourseKey => typeof k === 'string' && k in COURSES;
/** Courses a person opens from their own app account (the talent training), not from a link the console sends. */
export const IN_APP_COURSES: readonly CourseKey[] = ['talent'];

export const lessonsOf = (c: CourseKey) => COURSES[c].steps.filter(s => s[4] === 'l');
export const checksOf = (c: CourseKey) => COURSES[c].steps.filter(s => s[4] === 'c');
export const minutesOf = (c: CourseKey) => COURSES[c].steps.reduce((a, s) => a + s[3], 0);

/** Where a person is, in the console's own words. */
export function learnStatus(r: { opened_at: string | null; lessons_done: number; checks_passed: number; completed_at: string | null; revoked_at: string | null }, c: CourseKey): string {
  if (r.revoked_at) return 'Link withdrawn';
  if (r.completed_at) return 'Signed off';
  if (!r.opened_at) return 'Not opened yet';
  if (!r.lessons_done && !r.checks_passed) return 'Opened';
  return `${r.lessons_done} of ${lessonsOf(c).length} lessons · ${r.checks_passed} of ${checksOf(c).length} checks`;
}

/** Video links a lesson may carry. Only these hosts embed in the page. */
export const VIDEO_RE = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]{6,}|youtu\.be\/[\w-]{6,}|youtube\.com\/embed\/[\w-]{6,}|vimeo\.com\/(video\/)?\d+|player\.vimeo\.com\/video\/\d+|loom\.com\/(share|embed)\/\w+)/i;
