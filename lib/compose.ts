import { CONTACT_EMAIL } from './experience-public';

/** Opens a Gmail compose window from the shared Relève inbox (hello@relevestaffing.com).
 *  A plain mailto: can't choose the sender, so this targets that account directly. */
export function composeFromHello(to: string, subject = '', body = ''): string {
  const q = new URLSearchParams({ view: 'cm', fs: '1', authuser: CONTACT_EMAIL, to });
  if (subject) q.set('su', subject);
  if (body) q.set('body', body);
  return `https://mail.google.com/mail/?${q.toString()}`;
}
