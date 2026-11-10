/* The two emails the team trainings send (10 November 2026): the private
   link to a new hire, and a note to the team when someone signs off. Built
   on the house frame in lib/email.ts, so they look like every other Relève
   email and read clean in Gmail dark mode. */
import { shell, p, esc, type Message } from '@/lib/email';
import { COURSES, lessonsOf, checksOf, type CourseKey } from '@/lib/learn-courses';

export function learnInvite(o: { name: string; course: CourseKey; link: string; again?: boolean }): Message {
  const c = COURSES[o.course];
  const first = (o.name || '').trim().split(/\s+/)[0] || 'Hello';
  const lessons = lessonsOf(o.course).length, checks = checksOf(o.course).length;
  const lines = [
    `${first},`,
    c.email.intro,
    'Go at your own pace, in as many sittings as you like. Your place saves as you go, on any device you open the link on.',
    'The link below is yours alone, so please keep it to yourself. When you have finished, you will sign off at the end and we will see it here.'
  ];
  return {
    kind: 'learnInvite',
    subject: o.again ? `${c.email.subject}, your link again` : c.email.subject,
    text: `${lines.join('\n\n')}\n\nOpen your training: ${o.link}\n\n${lessons} lessons, ${checks} short checks.\n\nRelève`,
    html: shell(esc(c.email.headline),
      lines.map((l, i) => p(i === 0 ? esc(l) : esc(l))).join(''),
      { label: 'Open your training', href: o.link })
  };
}

export function learnFinished(o: { name: string; signedAs: string; email: string; course: string }): Message {
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  return {
    kind: 'learnFinished',
    subject: `${o.name} finished ${o.course}`,
    text: `${o.name} (${o.email}) finished ${o.course} and signed off as ${o.signedAs}, ${when} Pacific.\n\nEvery lesson read and every check passed. You can see it under The business, Training, in the console.\n\nRelève`,
    html: shell(`${esc(o.name)} finished ${esc(o.course)}`,
      p(`${esc(o.name)} (${esc(o.email)}) signed off as <b>${esc(o.signedAs)}</b>, ${esc(when)} Pacific.`) +
      p('Every lesson read and every check passed. You can see it under The business, Training, in the console.'),
      { label: 'Open Training', href: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com'}/console/training` })
  };
}
