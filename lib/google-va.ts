/* Hands the week's hand-posted content to Sage's VA (31 October 2026):
   captions into the VA's Google Doc, files into the VA's Google Drive folder.
   Uses the same Google service account as the calendar and Gmail readers,
   acting as hello@relevestaffing.com through domain-wide delegation, so the
   files belong to Relève's own Workspace account. Needs, once, in Google
   Workspace admin (Security > API controls > Domain-wide delegation), the
   two scopes below added to that service account, and the Google Drive and
   Google Docs APIs switched on in its Google Cloud project.
   Relative imports only: the background worker bundles this file. */

import crypto from 'crypto';

const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents';
const SUBJECT = () => process.env.GOOGLE_VA_SUBJECT || 'hello@relevestaffing.com';

export function vaConfigured() {
  return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_EMAIL && process.env.GOOGLE_CALENDAR_PRIVATE_KEY);
}

const b64 = (x: Buffer | string) => (Buffer.isBuffer(x) ? x : Buffer.from(x)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cached: { token: string; exp: number } | null = null;
async function token(): Promise<string> {
  const email = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL, key = process.env.GOOGLE_CALENDAR_PRIVATE_KEY;
  if (!email || !key) throw new Error('The Google service account is not set up (GOOGLE_CALENDAR_CLIENT_EMAIL / GOOGLE_CALENDAR_PRIVATE_KEY).');
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return cached.token;
  const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({
    iss: email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', sub: SUBJECT(), iat: now, exp: now + 3600
  }))}`;
  const s = crypto.createSign('RSA-SHA256'); s.update(unsigned); s.end();
  const jwt = `${unsigned}.${b64(s.sign(key.replace(/\\n/g, '\n')))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    if (j.error === 'unauthorized_client') throw new Error('Google Drive access is not authorised yet: add the drive and documents scopes to the service account in Workspace admin (domain-wide delegation).');
    throw new Error(`Google sign-in failed: ${j.error_description || j.error || r.status}`);
  }
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return cached.token;
}

async function google(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message ?? `status ${r.status}`;
    if (/has not been used|is disabled/i.test(msg)) throw new Error(`Switch on the Google ${/docs/i.test(url) ? 'Docs' : 'Drive'} API in the service account's Google Cloud project. (${msg.slice(0, 120)})`);
    throw new Error(`Google: ${msg}`);
  }
  return j;
}

const DRIVE = 'https://www.googleapis.com/drive/v3/files';

/* A subfolder by name inside `parent`, made once and reused. */
export async function folderIn(parent: string, name: string): Promise<string> {
  const q = `'${parent}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await google(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (found.files?.[0]?.id) return found.files[0].id;
  const made = await google(`${DRIVE}?supportsAllDrives=true&fields=id`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] })
  });
  return made.id;
}

/* Uploads a file, replacing one of the same name in that folder. */
export async function upload(parent: string, name: string, type: string, bytes: Buffer): Promise<string> {
  const q = `'${parent}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`;
  const found = await google(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const existing: string | undefined = found.files?.[0]?.id;
  const boundary = `releve${crypto.randomBytes(8).toString('hex')}`;
  const meta = existing ? { name } : { name, parents: [parent] };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${type}\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--`)
  ]);
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=multipart&supportsAllDrives=true&fields=id`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`;
  const j = await google(url, { method: existing ? 'PATCH' : 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body });
  return j.id;
}

/* Adds text to the end of a Google Doc, in a given tab when the Doc has tabs. */
export async function appendToDoc(docId: string, tabId: string | null, text: string) {
  const doc = await google(`https://docs.googleapis.com/v1/documents/${docId}?includeTabsContent=true&fields=tabs(tabProperties(tabId),childTabs(tabProperties(tabId)))`);
  const ids: string[] = [];
  const walk = (tabs: any[] = []) => tabs.forEach(t => { if (t?.tabProperties?.tabId) ids.push(t.tabProperties.tabId); walk(t.childTabs); });
  walk(doc.tabs);
  const tab = tabId && ids.includes(tabId) ? tabId : ids[0];
  await google(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ insertText: { endOfSegmentLocation: tab ? { tabId: tab } : {}, text } }] })
  });
}


/* ---------- read-only, for the founder's assistant ---------- */

/* The text of a Google Doc, tab by tab, cut to `cap` characters. */
export async function readDocText(docId: string, cap = 14000): Promise<string> {
  const doc = await google(`https://docs.googleapis.com/v1/documents/${docId}?includeTabsContent=true`);
  const textOf = (content: any[] = []): string => content.map((el: any) => {
    if (el.paragraph) return (el.paragraph.elements ?? []).map((e: any) => e.textRun?.content ?? '').join('');
    if (el.table) return (el.table.tableRows ?? []).map((r: any) => (r.tableCells ?? []).map((c: any) => textOf(c.content).trim()).join(' | ')).join('\n') + '\n';
    return '';
  }).join('');
  const out: string[] = [];
  const walk = (tabs: any[] = []) => tabs.forEach(t => {
    out.push(`=== TAB: ${t.tabProperties?.title ?? 'untitled'} (id ${t.tabProperties?.tabId}) ===\n${textOf(t.documentTab?.body?.content)}`);
    walk(t.childTabs);
  });
  if (doc.tabs?.length) walk(doc.tabs); else out.push(textOf(doc.body?.content));
  const text = `Document: ${doc.title ?? ''}\n` + out.join('\n');
  /* The newest writing is at the end of each tab, so keep the tail when it is long. */
  return text.length > cap ? '[earlier text cut]\n' + text.slice(-cap) : text;
}

/* What is inside a Drive folder, newest first. */
export async function listFolder(folderId: string, max = 40) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const j = await google(`${DRIVE}?q=${q}&pageSize=${max}&orderBy=modifiedTime%20desc&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,modifiedTime,size)`);
  return (j.files ?? []) as { id: string; name: string; mimeType: string; modifiedTime: string; size?: string }[];
}
