/* Read-only look at the hello@relevestaffing.com inbox, so a stranger who
   emails Relève from the website lands in the lead pipeline the same way a
   form does. Same service account and hand-signed JWT as lib/calendar.ts,
   asking for the Gmail readonly scope instead. Only headers and Gmail's own
   short snippet are read, plus a resume attachment when a job seeker
   sends one (filed with their application). Never message bodies.

   Needs one thing beyond the calendar setup: in Google Workspace admin,
   Security → Access and data control → API controls → Domain-wide
   delegation, the service account's entry must also list
     https://www.googleapis.com/auth/gmail.readonly
   Until it does, Google refuses the token and the import reports that
   plainly instead of failing. Added 29 October 2026. */

import crypto from 'crypto';

const MAILBOX = () => process.env.GOOGLE_INBOX_ID || 'hello@relevestaffing.com';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export type InboxMessage = {
  id: string; threadId: string;
  fromName: string; fromEmail: string;
  subject: string; snippet: string; at: string;
  bulk: boolean;   // carries List-Unsubscribe or a bulk Precedence: a newsletter, not a person
  hasResume: boolean;  // a PDF or Word file is attached
};

export function inboxConfigured() {
  return !!(process.env.GOOGLE_CALENDAR_CLIENT_EMAIL && process.env.GOOGLE_CALENDAR_PRIVATE_KEY);
}

function base64url(input: Buffer | string) {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<{ token: string | null; why?: string }> {
  const email = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
  const key = process.env.GOOGLE_CALENDAR_PRIVATE_KEY;
  if (!email || !key) return { token: null, why: 'The Google service account is not set.' };
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return { token: cached.token };
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token',
    sub: MAILBOX(), iat: now, exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`); signer.end();
  const jwt = `${header}.${claims}.${base64url(signer.sign(key.replace(/\\n/g, '\n')))}`;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
      cache: 'no-store'
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('[gmail] token refused', res.status, t.slice(0, 300));
      return { token: null, why: /unauthorized_client|access_denied/.test(t)
        ? 'Gmail access is not authorised yet: add the gmail.readonly scope to the service account in Workspace admin.'
        : `Google refused the token (${res.status}).` };
    }
    const j = await res.json() as { access_token: string; expires_in: number };
    cached = { token: j.access_token, exp: now + j.expires_in };
    return { token: j.access_token };
  } catch (e: any) {
    return { token: null, why: `The token request did not complete: ${e?.message ?? e}` };
  }
}

function parseFrom(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: '', email: v.trim().toLowerCase() };
}

/* Mail in the primary inbox from the last `days` days, newest first, that
   Relève did not send itself. Never throws: a reason comes back instead. */
export async function recentInboxMessages(days = 3): Promise<{ messages: InboxMessage[]; reason?: string }> {
  const { token, why } = await accessToken();
  if (!token) return { messages: [], reason: why };
  const auth = { authorization: `Bearer ${token}` };
  const base = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(MAILBOX())}`;
  const q = `in:inbox category:primary newer_than:${days}d -from:me -from:relevestaffing.com`;
  const list = await fetch(`${base}/messages?maxResults=50&q=${encodeURIComponent(q)}`, { headers: auth, cache: 'no-store' });
  if (!list.ok) return { messages: [], reason: `Gmail would not list the inbox (${list.status}).` };
  const ids = ((await list.json()).messages ?? []) as { id: string }[];
  /* Which of them carry a PDF or Word file, in one more list call. */
  const withDoc = new Set<string>();
  const docs = await fetch(`${base}/messages?maxResults=50&q=${encodeURIComponent(q + ' has:attachment (filename:pdf OR filename:doc OR filename:docx)')}`, { headers: auth, cache: 'no-store' });
  if (docs.ok) for (const x of ((await docs.json()).messages ?? []) as { id: string }[]) withDoc.add(x.id);
  const out: InboxMessage[] = [];
  for (const { id } of ids) {
    const r = await fetch(`${base}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence&metadataHeaders=Auto-Submitted`, { headers: auth, cache: 'no-store' });
    if (!r.ok) continue;
    const m = await r.json();
    const h: Record<string, string> = {};
    for (const x of (m.payload?.headers ?? []) as any[]) h[String(x.name).toLowerCase()] = String(x.value ?? '');
    const from = parseFrom(h['from'] ?? '');
    if (!from.email.includes('@')) continue;
    out.push({
      id: m.id, threadId: m.threadId, fromName: from.name, fromEmail: from.email,
      subject: h['subject'] ?? '', snippet: String(m.snippet ?? '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
      at: new Date(Number(m.internalDate)).toISOString(),
      hasResume: withDoc.has(m.id),
      bulk: !!h['list-unsubscribe'] || /bulk|list|junk/i.test(h['precedence'] ?? '') || /auto-/i.test(h['auto-submitted'] ?? '')
    });
  }
  return { messages: out };
}

/* The fallback when the AI is off: strict on purpose. A client must make
   a clear request with no sign of a candidate or a pitch; an applicant must
   clearly be looking for work or send a resume, with no sign of a pitch. */
const WANTS = /\b(hire|hiring|looking for (an? )?(assistant|va|virtual|executive|help|someone)|need (an? )?(assistant|va|help|virtual)|(virtual|executive|personal) assistant|va|staffing|discovery call|book(ing)? a call|schedule (a )?call|consult(ation)?|pricing|price|rates?|quote|your (services?|plans?)|how (does|do) (it|you|relève|releve) work|delegate|take (things|work|tasks) off my plate|start a search|interested in (relève|releve|your))\b/i;
const SEEKS = /\b(resume|résumé|cv|curriculum|apply(ing)?|application|applicant|job (opening|posting|opportunity)|open (role|position)|position|vacancy|looking for (work|a job|opportunities|a role)|i am an? (va|virtual assistant|assistant|executive assistant)|i'?m an? (va|virtual assistant|assistant|executive assistant)|my (portfolio|experience as)|hire me|join your (team|talent)|work with relève as)\b/i;
const PITCH = /\b(seo|backlinks?|guest post|sponsor(ship)?|partnership|collaborat|lead generation|we help (businesses|agencies|companies)|our (agency|team|company) (can|helps|offers|provides)|unsubscribe|invoice|receipt|payment (received|confirmation)|webinar)\b/i;

export type InboxKindGuess = 'client' | 'applicant' | 'other';
export function guessInboxKind(subject: string, snippet: string, hasResume: boolean): InboxKindGuess {
  const text = `${subject}\n${snippet}`;
  if (PITCH.test(text)) return 'other';
  if (hasResume || SEEKS.test(text)) return 'applicant';
  if (WANTS.test(text)) return 'client';
  return 'other';
}

const RESUME_MIME = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const RESUME_EXT = /\.(pdf|docx?)$/i;

/* The first PDF or Word attachment on a message, up to 5MB, or null. */
export async function resumeAttachment(messageId: string): Promise<{ name: string; mime: string; bytes: Buffer } | null> {
  const { token } = await accessToken();
  if (!token) return null;
  const auth = { authorization: `Bearer ${token}` };
  const base = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(MAILBOX())}/messages/${messageId}`;
  try {
    const r = await fetch(`${base}?format=full`, { headers: auth, cache: 'no-store' });
    if (!r.ok) return null;
    const m = await r.json();
    const stack: any[] = [m.payload];
    while (stack.length) {
      const part = stack.shift();
      if (!part) continue;
      if (Array.isArray(part.parts)) stack.push(...part.parts);
      const name = String(part.filename ?? '');
      const aid = part.body?.attachmentId;
      const size = Number(part.body?.size ?? 0);
      if (!aid || !name || size > 5 * 1024 * 1024) continue;
      if (!RESUME_EXT.test(name) && !RESUME_MIME.includes(part.mimeType)) continue;
      const a = await fetch(`${base}/attachments/${aid}`, { headers: auth, cache: 'no-store' });
      if (!a.ok) return null;
      const data = String((await a.json()).data ?? '').replace(/-/g, '+').replace(/_/g, '/');
      const mime = /\.pdf$/i.test(name) ? 'application/pdf' : /\.doc$/i.test(name) ? 'application/msword'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      return { name: name.slice(0, 160), mime, bytes: Buffer.from(data, 'base64') };
    }
  } catch { /* no resume is no reason to drop the applicant */ }
  return null;
}
