/* Email for the experience layer: interview reminders, the month's report,
   client requests and questions on tasks. Built on the same shell, escaping
   and send helper as lib/email.ts, so every letter still looks, logs and
   signs off the same way: as Relève, never a named person. */
import { shell, esc, p, type Message } from './email';

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.relevestaffing.com';

const quote = (s: string) =>
  `<p style="margin:0 0 15px;padding:14px 18px;background:#F3EFE6;border-left:2px solid #B0C4B2;font-style:italic;">${esc(s)}</p>`;

const list = (items: string[]) => items.length
  ? `<ul style="margin:0 0 15px;padding-left:18px;">${items.map(i => `<li style="margin:0 0 6px;">${esc(i)}</li>`).join('')}</ul>`
  : '';

export const experienceEmails = {
  /* 24 hours and 1 hour before an interview, to each side, in their own time. */
  interviewReminder: (o: { name: string; withWhom: string; when: string; url: string | null; soon: '24h' | '1h' }): Message => {
    const lead = o.soon === '1h' ? 'Within the hour' : 'Tomorrow';
    const subject = `${lead}: your interview with ${o.withWhom}`;
    const href = o.url ?? `${SITE}/app/interviews`;
    return {
      kind: `interviewReminder${o.soon}`,
      subject,
      text: `${o.name},\n\nA reminder: your interview with ${o.withWhom} is at ${o.when}.\n\n${o.url ? `Join here: ${o.url}` : `Details: ${SITE}/app/interviews`}\n\nIf the time no longer works, reply to this email and we will arrange another.\n\nRelève`,
      html: shell(esc(subject),
        p(`${esc(o.name)},`) +
        p(`A reminder: your interview with <b>${esc(o.withWhom)}</b> is at <b>${esc(o.when)}</b>.`) +
        p('If the time no longer works, reply to this email and we will arrange another.'),
        { label: o.url ? 'Join the interview' : 'See the details', href })
    };
  },

  /* The 1st of the month: last month, in one letter, linking to the page. */
  monthlyReport: (o: {
    name: string; talent: string; month: string; monthParam: string;
    completed: number; hours: number; highlights: string[]; focus: string[];
  }): Message => {
    const href = `${SITE}/app/report?month=${o.monthParam}`;
    const subject = `Your month with ${o.talent}: ${o.month}`;
    const stats = [
      `${o.completed} task${o.completed === 1 ? '' : 's'} completed`,
      o.hours > 0 ? `${o.hours} hours logged` : null
    ].filter(Boolean).join(' · ');
    return {
      kind: 'monthlyReport',
      subject,
      text: `${o.name},\n\nHere is ${o.month} with ${o.talent}: ${stats}.\n\n${o.highlights.length ? `Highlights:\n${o.highlights.map(h => `- ${h}`).join('\n')}\n\n` : ''}${o.focus.length ? `Next month's focus:\n${o.focus.map(h => `- ${h}`).join('\n')}\n\n` : ''}The full report: ${href}\n\nAnything you would change, reply here. Your Client Success Manager reads every reply.\n\nRelève`,
      html: shell(esc(subject),
        p(`${esc(o.name)},`) +
        p(`Here is ${esc(o.month)} with <b>${esc(o.talent)}</b>: ${esc(stats)}.`) +
        (o.highlights.length ? p('<b>Highlights</b>') + list(o.highlights) : '') +
        (o.focus.length ? p('<b>Next month’s focus</b>') + list(o.focus) : '') +
        p('Anything you would change, reply here. Your Client Success Manager reads every reply.'),
        { label: 'Read the full report', href })
    };
  },

  /* To the client's manager (or the team) when a request is made. */
  clientRequestTeam: (o: { client: string; talent: string; what: string; note?: string | null; preferred?: string | null; action: string }): Message => ({
    kind: 'clientRequestTeam',
    subject: `${o.client}: ${o.what}`,
    text: `${o.client} has asked for: ${o.what} (placement with ${o.talent}).\n\n${o.note ? `In their words: "${o.note}"\n\n` : ''}${o.preferred ? `Preferred: ${o.preferred}\n\n` : ''}Next step: ${o.action}.\n\n${SITE}/console/care\n\nRelève`,
    html: shell(esc(`${o.client}: ${o.what}`),
      p(`<b>${esc(o.client)}</b> has asked for: <b>${esc(o.what)}</b>, on the placement with ${esc(o.talent)}.`) +
      (o.note ? quote(o.note) : '') +
      (o.preferred ? p(`Preferred: ${esc(o.preferred)}`) : '') +
      p(`Next step: ${esc(o.action)}. We promise a reply within one business day.`),
      { label: 'Open Care', href: `${SITE}/console/care` })
  }),

  /* To the client, confirming the request landed and what happens next. */
  clientRequestReceived: (o: { name: string; what: string; promise: string }): Message => ({
    kind: 'clientRequestReceived',
    subject: `Received: ${o.what}`,
    text: `${o.name},\n\nWe have your request: ${o.what}.\n\n${o.promise}\n\n${SITE}/app/care\n\nRelève`,
    html: shell(esc(`Received: ${o.what}`),
      p(`${esc(o.name)},`) + p(`We have your request: <b>${esc(o.what)}</b>.`) + p(esc(o.promise)),
      { label: 'See your placement', href: `${SITE}/app/care` })
  }),

  /* A comment or question on a task, to the other side of the placement. */
  taskComment: (o: { name: string; from: string; title: string; body: string; question: boolean }): Message => {
    const subject = o.question ? `${o.from} has a question about "${o.title}"` : `${o.from} commented on "${o.title}"`;
    return {
      kind: o.question ? 'taskQuestion' : 'taskComment',
      subject,
      text: `${o.name},\n\n${subject}.\n\n"${o.body}"\n\n${SITE}/app/tasks\n\nRelève`,
      html: shell(esc(subject),
        p(`${esc(o.name)},`) + quote(o.body) +
        (o.question ? p('A short answer on the task keeps the work moving.') : ''),
        { label: o.question ? 'Answer on the task' : 'Open the task', href: `${SITE}/app/tasks` })
    };
  }
};
